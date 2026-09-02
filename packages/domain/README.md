# @actionamp/domain

The platform-switch home for the app's business logic: pure **core** modules
ported out of `webapp/src/` one per feature, plus the **seam** (`src/db/`) that
lets them talk to Postgres through Drizzle while still speaking Prisma's
delegate dialect. This README is the port recipe every remaining core follows.
Port decisions and the per-query inventory live in
[`docs/plans/tasks-port-inventory.md`](../../docs/plans/tasks-port-inventory.md).

## What a core is

A core is `src/<feature>/<name>Core.ts` (+ pure helpers beside it):

- **Pure module** — no framework imports (no Wasp, no HTTP server, no React).
- **`entities` is the first argument** of every exported function; plain typed
  args second; returns data or throws. Tenancy (`userId` scoping) and
  entitlement guards stay in the API layer (F8b), except that cores always
  scope reads/writes by the `userId` passed in.
- Entitlement *decisions* are pure too: `src/billing/entitlements.ts`
  (`resolveAccessibleLenses`, `capViolation`, …).

## The seam

```ts
import { createDb, createEntities } from "@actionamp/domain/db";

const db = createDb(process.env.DATABASE_URL); // postgres-js, lazy connect
const entities = createEntities(db);           // ONE object for every core
// entities = { Task: TaskDelegate, TaskSession: TaskSessionDelegate, Lens: … }
// close with db.$client.end()
```

- `src/db/seam.ts` — the contract: filter/where/orderBy/data arg types,
  include-shape types, row types (`TaskListRow`, `HydratedTask`, …), delegate
  interfaces, `Entities`.
- `src/db/types.ts` — Prisma-model row equivalents (`InferSelectModel`) +
  enum unions.
- `src/db/client.ts` — the Drizzle implementation (`createDb`, `createEntities`)
  with **client-side defaults below the seam**: `mintId()` on every `create`,
  `updatedAt` re-stamped on every `Task.update`/`updateMany` (Prisma parity).
- `src/db/seam.checks.ts` — compile-time lock: one `expectEntities(core,
  entities)` line per core entry point; if a core slice drifts from `Entities`,
  `bunx tsc --noEmit` fails.

**The rule that follows:** cores and tests must NOT re-implement the
client-side defaults. Tests' `vi.fn()` mocks REPLACE the delegates entirely, so
`update` call assertions see the core's exact payload *without* the re-stamp —
assertions port unchanged; only the real `createEntities` ever mints ids or
stamps `updatedAt`.

## Port steps (per core)

1. Copy `webapp/src/<feature>/<name>Core.ts` → `packages/domain/src/<feature>/`.
   Bodies stay verbatim — signatures unchanged is the point.
2. Swap `@prisma/client` type imports for the seam's (`../db/index.js`).
   Row interfaces the seam's delegates also reference (shared include shapes)
   move to `src/db/seam.ts` and are re-exported from the core — one definition.
3. Fix relative imports to `.js` specifiers (NodeNext). Temporal helpers come
   from `../shared/time/temporal.js`; permalink minting from
   `../shared/permalinks.js` (never re-implement the slug math). Zero
   `webapp/` imports.
4. Inventory every delegate call the core makes (inventory §2 format) and
   extend the seam where a call is new: row type in `types.ts`, arg/filter
   types + delegate interface in `seam.ts`, `Entities` key, translation in
   `client.ts`.
5. Add one `expectEntities(<core>, entities)` line to `seam.checks.ts`.
6. Port tests: copy `webapp/src/<feature>/<name>Core.test.ts` beside the core;
   import the mock helpers from `../test/mockContext.js`; fix import
   specifiers only — assertions stay as they are in webapp (see the rule
   above). Cast mock slices with `as Parameters<typeof core>[0]` + a SAFETY
   comment.
7. Gates (all must be green):
   - `cd packages/domain && bunx --bun vitest run` — **`--bun` is required**:
     plain `bunx vitest` runs the bin through its node shebang, and this
     machine's Node 24 does not expose the `Temporal` global that
     `src/shared/time/temporal.ts` binds (Bun 1.4 does).
   - `cd packages/domain && bunx tsc --noEmit`
   - from repo root: `bunx oxlint packages/domain` — 0 warnings, 0 errors
   - `grep -rn "@prisma/client\|from \"webapp" packages/domain/src` — no hits

## Temporal rules

- Every temporal column is `mode: 'date'` — **JS `Date` in, JS `Date` out**
  (Prisma parity, zero conversion at the boundary). `@db.Date` columns arrive
  as UTC-midnight `Date`s.
- **NEVER read temporal values via `db.$client` (the raw postgres client)** —
  it parses naive `timestamp` in the process's local timezone and silently
  shifts values on non-UTC machines (inventory §7). Use the seam delegates or
  Drizzle queries only.
- `Temporal` comes from Bun's global, bound through
  `src/shared/time/temporal.js` — no polyfill dependency in packages/.

## Gotchas learned in this port

- `Task.findUnique` guard-reads return the FULL row (the `select` is advisory;
  the widened `Promise<Task | null>` stays). `update`-with-select DOES prune —
  its result reaches API payloads.
- A missing row on `update`/`create` throws a plain `Error("Task not found.")`
  (the P2025 analogue). Cores pre-check existence, so it fires only on races.
- `undefined` = leave the column untouched, `null` = write NULL — preserved
  through Drizzle `set`, no remapping.
- `TaskSession`, `Tag`, `Lens` carry no `updatedAt` — nothing to re-stamp there.
- Tag order through `tags: true` is DB-return order (m2m join); render chips,
  don't rank on it.
- `seam.checks.ts` uses function-argument assignability, not `[A] extends [B]`
  conditionals — the conditional form intermittently mis-resolves for
  overload-heavy delegate slices.

## Checklist template

```
## Port: webapp/src/<feature>/<name>Core.ts → packages/domain/src/<feature>/
- [ ] Core copied; bodies verbatim; signatures unchanged
- [ ] @prisma/client types → ../db/index.js seam types; shared rows → seam.ts
- [ ] Relative imports use .js; zero webapp/@prisma imports (grep clean)
- [ ] New delegate calls inventoried; seam.ts/types.ts/client.ts extended
- [ ] expectEntities line added to src/db/seam.checks.ts
- [ ] Tests copied beside core; only import specifiers edited
- [ ] Mocks via src/test/mockContext.js; no updatedAt expectations in data args
- [ ] bunx --bun vitest run · bunx tsc --noEmit · bunx oxlint — all green
```
