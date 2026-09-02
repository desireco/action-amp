# F4b — Tasks port inventory: used-query inventory + seam decisions

Date: 2026-09-01 · Goal: F4b (platform switch) · Scope: the tasks
`operationsCore` + its deps (`activePool`, `billing/entitlements` + `config`,
`shared/time/temporal`, `shared/permalinks`) ported into `packages/domain`
with signatures unchanged, and the Drizzle-backed seam
(`src/db/client.ts` `createDb` + `createEntities`) that provides the exact
Prisma-delegate surface they speak. Zero writes to the database (validation
below is read-only SELECT).

This is the pattern-setter: every remaining core port (12 more) copies this
layout. F4c (tests) reads §6; F8b (API layer) reads §3 and §7.

## 1. Files created/changed (all under `packages/domain/`)

| Path | What it is |
|---|---|
| `src/db/schema/index.ts` | **edited**: all 60 `timestamp` columns → `mode: 'date'` (55 `timestamp(3)`, 2 `timestamptz(3)`: `Task.snoozedUntil`, `InboxItem.parsedSnoozedUntil`, plus 3 plain `timestamptz` on the `_prisma_migrations` housekeeping table), and the 3 `@db.Date` columns → `date({ mode: 'date' })` (`Task.scheduledDate`, `Project.dueDate`, `InboxItem.parsedScheduledDate`) — 63 temporal columns total; zero `mode: 'string'` remain. bytea hand-edit untouched (§4). |
| `src/db/types.ts` | Prisma-model row equivalents via `InferSelectModel` (Task, Tag, TaskSession, Lens, TaskUpdate, TaskAttachment, Project, Goal, User) + enum unions (Priority, Size, TaskStatus, TaskUpdateKind, Plan, ManualAccessGrant). |
| `src/db/seam.ts` | the seam contract: filter/where/orderBy/data arg types (structurally faithful to what the cores pass), include-shape types, include row types (TaskListRow, TaskLensListRow, TaskDetailRow+Full, RankedPoolRow, HydratedTask), delegate interfaces (`TaskDelegate`, `TaskSessionDelegate`, `LensDelegate`), `Entities`. |
| `src/db/client.ts` | the seam implementation: `createDb(url)`, `domainSchema`, `createEntities(db)`, `mintId()`, Prisma-where→SQL translation, include→relational-`with` builder, row projection. |
| `src/db/seam.checks.ts` | compile-time lock: every ported core's entities slice accepts the seam `Entities` (function-argument checks — see §8.4). |
| `src/db/index.ts` | barrel extended: schema + relations + types + seam + client. |
| `src/shared/time/temporal.ts` | ported verbatim except: the `@js-temporal/polyfill` import became a typed binding of Bun's global `Temporal` (no polyfill dep in packages/; minimal local interface covers exactly the used surface). |
| `src/shared/permalinks.ts` | pure helper ported (`uniquePermalink`, `taskPermalinkSource`) — see §5 (why: the tasks core does NOT mint permalinks). |
| `src/tasks/operationsCore.ts` | ported; bodies verbatim, type references swapped. Row interfaces the seam overloads reference re-exported from the seam (one definition). |
| `src/tasks/activePool.ts` | ported; `Prisma.TaskWhereInput` → seam `TaskWhereInput`. |
| `src/billing/config.ts`, `entitlement-types.ts`, `entitlements.ts` | ported; all exports present, signatures unchanged. |

## 2. USED-QUERY INVENTORY (complete — tasks core + entitlements)

Every delegate call the ported code makes. "Translation" = how
`src/db/client.ts` lowers it to Drizzle.

### Task

| # | Call | Where/include shape | Translation + notes |
|---|---|---|---|
| 6× | `findUnique` | `{ where: { id } , select? }` — guard reads: `{isDone, userId, isOnboardingSample}` (toggle), `{userId}` (snooze, updateStatus, start, completeFocus, pause) | `db.select().from(task).where(eq(id)).limit(1)`; returns the FULL row (superset; the select is only a guard-read and its result never reaches API payloads). Kept the original slices' widened `Promise<Task \| null>`. |
| 1× | `findFirst` (detail) | `getTaskData`: `where {userId, OR:[{id},{permalink:id}]}`, `include {tags, updates{orderBy createdAt asc}, project{select id,permalink,name}, goal{select id,permalink,name}, attachments{select id,filename,mimeType}}` | `db.query.task.findFirst({ where: SQL, with: {tagToTasks:{with:{tag}}, taskUpdates:{orderBy asc(createdAt)}, project:true, goal:true, taskAttachments:true} })`, then projected to `TaskDetailFullRow` (exact keys; tags via the `_TagToTask` join). |
| 1× | `findFirst` (hydrate) | `hydrateTopTaskData`: `where {id, userId}`, `include {project{select id,permalink,name, goal{select id,name,description}}, goal{select id,permalink,name,description}, sessions{orderBy startedAt asc, select startedAt,endedAt}, updates{where kind='NOTE', orderBy createdAt desc, select body,createdAt}, attachments{select id,filename,mimeType}}` | Same relational API; `with.project = { with: { goal: true } }` (nested!), `taskUpdates` carries SQL `where kind = 'NOTE'` + desc orderBy, `taskSessions` asc(startedAt). Projected to `HydratedTask` (exact keys). |
| 5× | `findMany` | (a) `getTasksData` list include (tags + project/goal `{id,name}`), `orderBy [{order asc},{priority desc},{createdAt asc}]`; (b) `getTodayTasksData` / (c) `getWeekTasksData` same + `lens{select id,name,color}` (week: `orderBy [{scheduledDate asc},{order asc},{priority desc},{createdAt asc}]`, `status {in [TODAY,UPCOMING]}`, `OR [{status TODAY},{scheduledDate {lt …}}]`); (d) `getDoneTodayData` `orderBy {completedAt desc}`, `completedAt {gte startOfLocalDay}`; (e) `fetchRankedActiveTasks` (backs `getTopTaskData` + `getTaskAlternativesData`) ranked include (project/goal only), `where = activePoolWhere(...)` | `db.query.task.findMany({ where, orderBy: SQL[], with })` per family; Prisma orderBy arrays → sequential `asc()/desc()`; projected per family (lens pill from the `len` relation — introspection named the Lens relation `len`). |
| 5× | `update` | `{where:{id}, data}` (toggle: isDone/completedAt/startedAt + optional outcome; updateStatus: status/scheduledDate/snoozedUntil) and with `select {id,status,scheduledDate,snoozedUntil}` (snooze) / `select {id,startedAt}` (start, pause) | `db.update(task).set({...data, updatedAt: new Date()}).where(eq(id)).returning()`; pruned to the select keys when given; throws `Error("Task not found.")` when the row vanished (P2025 analogue — every core pre-checks, so this is race-only). |
| 1× | `updateMany` | `startTaskCore`: `{where {userId, startedAt {not: null}}, data {startedAt: null}}` | `db.update(task).set({...data, updatedAt: new Date()}).where(SQL).returning({id})` → `{ count }`. `@updatedAt` is re-stamped here too (Prisma does this in updateMany). |
| 1× | `count` | `getOtherLensCountsData`: `{ where: activePoolWhere(...) }` (N parallel, one per accessible lens) | `db.select({value: count()}).from(task).where(SQL)` → number. **Cross-validated read-only against hand-written SQL on actionamp_dev: 4 = 4.** |

### TaskSession

| # | Call | Shape | Translation + notes |
|---|---|---|---|
| 1× | `findFirst` | `completeFocusSessionCore`: `{where {taskId, userId, endedAt: null}, orderBy {startedAt desc}, select {id, startedAt, plannedMinutes}}` | `db.select().from(taskSession).where(SQL).orderBy(desc(startedAt)).limit(1)`; pruned to the select at runtime (the slice keeps Prisma-era widened `Promise<TaskSession \| null>` — the core only reads the three selected fields). |
| 1× | `create` | `startTaskCore`: `{taskId, userId, startedAt, plannedMinutes, completed: false}` | `db.insert(taskSession).values({ id: mintId(), ..., completed: data.completed ?? false })`. **Client-side defaults live here** (§4). |
| 1× | `update` | `{where {id}, data {endedAt, completed: true}}` | `db.update(...).set(data).where(eq(id)).returning()` — TaskSession has no `updatedAt` (nothing to re-stamp). |
| 2× | `updateMany` | `startTaskCore` defensive close + `pauseTaskCore`: `{where {userId\|taskId, endedAt: null}, data {endedAt}}` | `db.update(...).set(data).where(SQL).returning({id})` → `{ count }` (idempotent no-ops are fine). |

### Lens

| # | Call | Shape | Translation + notes |
|---|---|---|---|
| 1× | `findMany` | `resolveAccessibleLenses`: `{where {userId} \| {userId, isIncluded: true}, select {id,name,color,isIncluded}}` — called by `getTodayTasksData`, `getWeekTasksData`, `getOtherLensCountsData` | `db.select().from(lens).where(SQL)` — full rows returned (superset satisfies `AccessibleLensRow[]`); no pruning needed. |
| 1× | `findFirst` | `resolveLens` (entitlements; the tasks core doesn't call it, S16 will): `{where {id, userId}, select {name, isIncluded}}` | `db.select().from(lens).where(SQL).limit(1)`. |

**Explicitly zero in this port:** `$queryRaw` (the goal brief's example didn't
apply — no raw SQL anywhere in the tasks core or entitlements), `Task.create`,
`Task.delete*`, `tag.*` (upsert lives in the projects core's `createTaskCore`,
future port), transactions (`$transaction` never used by these cores).

## 3. Seam design (what a core's `entities` looks like now)

```ts
import { createDb, createEntities } from "@actionamp/domain/db";

const db = createDb(process.env.DATABASE_URL); // postgres-js, lazy connect
const entities = createEntities(db);
// entities = { Task: TaskDelegate, TaskSession: TaskSessionDelegate, Lens: LensDelegate }
// F8b: build once, pass as EVERY core's first arg; close with db.$client.end().
```

`src/db/seam.checks.ts` pins this at compile time: every core function accepts
`createEntities(db)`'s exact type (function-argument checks, not conditional
tuples — see §8.4). F4c mocks fake the same `Entities` shape (or the cores'
per-function slices, exactly like webapp's `mockContext` pattern).

Layering: `apps/api` imports ONLY `@actionamp/domain` — never drizzle, never
postgres directly. `DomainDb` (= `PostgresJsDatabase<typeof domainSchema> &
{ $client }`) is the only DB type that ever crosses the domain boundary.

Drizzle 0.45 note: `drizzle(client, { schema })` requires the `Relations`
objects to live IN the schema map (there is no `relations` config key in this
version) — hence the exported `domainSchema = { ...tables, ...relations }`.

## 4. Client-side defaults — where they are supplied now

Per `docs/plans/introspection-report.md` §4 (DB has no default for these):

- **UUID PKs** → `mintId()` (`crypto.randomUUID()`), called in
  `TaskSession.create` (the only create in this core). Every future
  `create` path (Task.create etc.) must do the same — this is now the seam's
  job, not the DB's.
- **`@updatedAt`** → `taskUpdateSet()` re-stamps `Task.updatedAt = new Date()`
  on EVERY `Task.update` AND `Task.updateMany` (Prisma stamps both; Logbook
  sorts WONT_DO declines on this column — do not drop it). `TaskSession`,
  `Tag`, `Lens` carry no `updatedAt` column. (`AnalyticsSession.lastSeenAt`
  belongs to a future analytics delegate — its future writer must re-stamp.)
- **`createdAt` / other DB-backed defaults** → left to the real DB defaults
  (report §4.4), except `TaskSession.startedAt` where the code passes
  `new Date()` if absent (Prisma's client-side `@default(now())` parity; the
  core always passes it explicitly anyway).
- **Permalinks** → see §5.

## 5. Permalinks — the finding

**The tasks core does not mint permalinks.** It only reads `Task.permalink`
(detail lookup matches `{ OR: [{id}, {permalink: id}] }`). Minting lives in
the create paths: `webapp/src/projects/operationsCore.ts` `createTaskCore`
calls `uniquePermalink(taskPermalinkSource(description, projectPermalink),
exists)` — slug + collision-retried `-2`, `-3`… suffix against the
`Task(userId, permalink)` unique.

Action taken: the pure helper is ported NOW to
`packages/domain/src/shared/permalinks.ts` (entity-free, tested-by-port).
When the projects core ports, its seam path calls the same helper with an
`exists` callback implemented as a `Task.count({ where: { userId, permalink:
candidate } })` — do not re-implement the slug math.

## 6. Notes for F4c (tests)

- Mock target: the cores' per-function entities slices (identical to
  webapp's `operationsCore.test.ts` pattern: `vi.fn()`s cast with
  `Parameters<typeof core>[0]`), or the exported `Entities` interfaces.
  Delegate method names: `Task.findUnique/findFirst/findMany/update/
  updateMany/count`, `TaskSession.findFirst/create/update/updateMany`,
  `Lens.findFirst/findMany`.
- `Task.update` mocks: unit-test mocks REPLACE the delegate, so they record
  the core's exact payload — WITHOUT the `updatedAt` re-stamp (that lives in
  `client.ts`, below the seam). The webapp tests' `toHaveBeenCalledWith`
  data assertions port unchanged; only integration tests that run the REAL
  `createEntities` ever see the re-stamp.
- `TaskSession.create` mocks: the runtime values carry a minted uuid `id`.
- `completeFocusSessionCore` / `toggleTaskDoneCore` read `systemClock()` —
  pin with vitest fake timers, or test the pure extractions (`snoozeTarget`)
  like webapp does.
- `sort/orderBy` order is load-bearing in `findMany` args (ranked pool, week
  buckets) — assert the args, don't re-derive them.
- Cross-review verified the mock path compiles: webapp's `mockContext.ts`
  (untyped `vi.fn()` `EntitySpy` + `as Parameters<typeof core>[0]` casts +
  partial fixtures into `mockResolvedValue`) typechecks against the ported
  cores unchanged. F4c only needs to copy `webapp/src/test/mockContext.ts`
  into `packages/domain/src/test/` and adjust the import specifiers (`.js`).

## 7. Timestamp-mode decision (report §6 answer)

**All temporal columns switched to `mode: 'date'`** — every `timestamp(3)`
(without tz), both `timestamptz(3)` columns (`Task.snoozedUntil`,
`InboxItem.parsedSnoozedUntil`), the 3 plain `timestamptz` columns on
`_prisma_migrations`, and the three `@db.Date` columns
(`date({ mode: 'date' })`).

Rationale: the cores pass and read JS `Date` (Prisma semantics) — with
`mode: 'date'` the seam needs ZERO conversion at the boundary:
`InferSelectModel` rows type temporal fields as `Date` exactly like Prisma's
models; `@db.Date` arrives as a UTC-midnight `Date` exactly like Prisma
(`temporal.ts` `plainDateFromDb` still works); writes take `Date` and drizzle
serializes to the right wire form. Converting at the seam instead would have
added a second date representation through every future port for no benefit.
Consistency across ALL tables (not just the touched ones) means the 12
remaining core ports inherit the same rule: JS `Date` in, JS `Date` out.

Sharp edge (cross-review, runtime-verified): Prisma parity here depends on
going THROUGH the seam. Drizzle reads run over postgres-js's `.values()`
(raw strings) and map `timestamp` back with `+0000` — UTC, exactly like
Prisma. The RAW postgres client (`db.$client` / a bare `postgres(url)`)
parses naive `timestamp` in the process's LOCAL timezone instead — on a
non-UTC machine that is a silent shift of the server's UTC offset (seen:
5h on UTC-5). Future ports and F8b must never read temporal values via the
raw client; use the seam delegates or Drizzle queries only.

Consequence (like the bytea edit): a pure `drizzle-kit pull` regen will
differ from `src/db/schema/index.ts` by the modes; the curated file is the
truth. Record both deviations in the drift-check script when it lands.

## 8. Deviations, judgment calls, quirks (all deliberate)

1. **`@js-temporal/polyfill` → Bun's global `Temporal`.** Not installed in
   packages/ (root deps only); Bun ships Temporal. `temporal.ts` binds
   `globalThis.Temporal` through a minimal local interface covering exactly
   the used surface (`Now`, `Instant`, `PlainDate`, `PlainTime`,
   `Duration.from`). Helper signatures unchanged.
2. **`Task.findUnique` returns the full row** instead of pruning to the
   guard-select. Single-row PK fetch, result stays internal to the cores —
   this keeps the original slices' widened `Promise<Task | null>` truthful.
   (`update`-with-select DOES prune — that result reaches API payloads.)
3. **`TaskSession.findFirst`/`Lens.*` return pruned/full rows under
   Prisma-era widened types** — same simplification the original core slices
   made (cores only read fields their select carried). Documented in seam.ts
   header.
4. **`seam.checks.ts` uses function-argument checks, not `[A] extends [B]`
   conditional tuples.** The conditional form intermittently mis-resolves to
   `false` for these overload-heavy delegate interfaces depending on what
   else the file imports (TS evaluation artifact — reproduced in isolation);
   argument-position assignability is stable and is also exactly the
   relation F8b depends on.
5. **`undefined` vs `null` preserved.** Update data flows into drizzle `set`
   as-is: `undefined` omits the column (untouched), `null` writes NULL —
   Prisma semantics, no remapping.
6. **Tag order in `tags: true` is DB-return order** (join through
   `_TagToTask`); Prisma never guaranteed m2m order either. Consumers render
   chips.
7. **P2025 analogue:** a missing row on `update`/`create` throws
   `Error("Task not found.")`-style plain Errors — every core pre-checks
   existence, so this fires only on a read/write race.
8. **Schema is edited beyond the bytea fix** (the mode switch, §7) — the one
   other sanctioned deviation from generated output; regen will differ.

## 9. Verification (all gates green)

- `cd packages/domain && bunx tsc --noEmit` — clean.
- `bunx vitest run` — smoke test passes.
- `bunx oxlint packages/domain` (from repo root) — 0 warnings, 0 errors.
- `grep -rn "@prisma/client\|from \"webapp\|from 'webapp" packages/domain/src`
  — no matches (comments included).
- Runtime (read-only, actionamp_dev): `createDb`/`createEntities` build;
  `resolveAccessibleLenses`, `getTasksData` (exact row keys incl.
  tags/project/goal), `getTopTaskData`, `getDoneTodayData`, detail
  `findFirst` include + null path, hydrate `findFirst` incl. nested
  `project.goal` projection, `Task.count`, `TaskSession.findFirst`,
  `updateMany` no-op `{count:0}` all execute; `activePoolWhere` count
  cross-checked against hand-written SQL (4 = 4). No writes performed.
- Cross-review (read-only, actionamp_dev): all of the above re-executed AND
  value-compared against hand-written SQL — `resolveAccessibleLenses` sets
  match (PRO + FREE paths), pool/done-today/per-lens counts match, detail
  tags match the `_TagToTask` join, updates ordered `createdAt asc` exactly,
  hydrate `kind='NOTE'` filter + `startedAt asc` session order match, and
  temporal parity is exact at the value level (`timestamp(3)` and
  `timestamptz(3)` round-trip as the same instants Prisma would produce;
  `@db.Date` as UTC-midnight `Date`). 20-row list projection carries exactly
  `project {id,name}` / `goal {id,name}` / `lens {id,name,color}` / tags.
