# S8 wiring — Logbook on the new stack

Slice: **S8 (Logbook)**. Deliverables landed as fragments plus this note.
Parity checklist: `packages/contract/src/s8-logbook/README.md` (the P0 notes).
Everything below is what the integrator (or the current tree) needs.

## 1. Composition lines

Per the slice contract the fragments are delivered uncomposed; per the S5/S6
precedent the lines were applied and verified during this batch's e2e gate.
If they are ever reverted, these are the whole integration:

**`packages/contract/src/router.ts`**

```ts
import { logbookContract } from "./logbook.js";

export const contractRouter = {
  // …existing surfaces…
  logbook: logbookContract,
};
```

**`apps/api/src/router.ts`**

```ts
import { logbookProcedures } from "./procedures/logbook.js";

export const router = {
  // …existing surfaces…
  logbook: logbookProcedures,
};
```

**`packages/contract/src/index.ts`** — additive exports of the slice's own
schemas only (applied): `logbookContract`, `LogbookSchema`,
`LogbookTaskSchema`, `LogbookWontDoSchema`, `LogbookProjectSchema`,
`LogbookGoalSchema`, `LogbookArchivedSchema` from `./logbook.js`.

**`packages/domain/package.json`** — additive export map (applied):
`"./logbook": "./src/logbook/index.ts"`.

## 2. Wire surface

- `/rpc/logbook/data` — POST, input `{ lensId?: string }`, output the five
  categories (`tasks`, `wontDo`, `projects`, `goals`, `archived`; temporals as
  ISO strings). One read; the Logbook is read-mostly.

**Restore/Reopen drive EXISTING ops** (no new writes):

| Row kind | Button | Endpoint |
|---|---|---|
| archived | Restore ("Send back to the inbox") | `/rpc/inbox/restore` (`{ inboxItemId }`) — S2/S3's fragment already had `restore`; nothing added |
| wont-do | Restore ("Reactivate — returns to Upcoming") | `/rpc/tasks/updateStatus` (`{ id, status: "UPCOMING" }`) — never straight onto Today |
| goal | Reopen ("Return to active goals") | `/rpc/goals/setDone` (`{ id, isDone: false }`) |
| project | Reopen ("Return to active projects") | `/rpc/projects/setDone` (`{ id, isDone: false }`) |

Cache-invalidation parity: the webapp invalidated six sibling query keys per
action. The new stack has no shared query cache — each store re-fetches on
route mount, so the store re-loads the Logbook after every action and the
other surfaces refresh on their next visit. Observed behavior is the same.

## 3. Entitlement + known gaps (P0 §5)

- **The webapp gap is CLOSED, not ported:** the webapp's `getLogbook` op had no
  `assertLensAllowed` (a FREE user could read Work-lens history by direct
  navigation). The port's `/rpc/logbook/data` ADDS the guard — parity with the
  CLI route's `gateLens`. 402 carries `{ feature, reason }` (declared
  `PAYMENT_REQUIRED`).
- `lensId` optional — absent, the server resolves the primary lens
  (`orderBy [{ isDefault: "desc" }, { createdAt: "asc" }]`, the S5/S6
  convention; the active-lens picker is a later slice).
- No accessible lens → `200` with all five arrays empty. Unlike the CLI
  route's empty path (which omits `wontDo` — bug noted in the P0 notes), the
  web shape always carries all five keys. The CLI route itself is S18's.
- Unbounded reads ported as-is (no take/limit) — fine at current scale.

## 4. Seam extensions (additive)

`getLogbookData` ported to `packages/domain/src/logbook/operationsCore.ts`
(bodies verbatim; the seam's S8 select/row types carry the five projected
reads, since they reach API payloads):

- `seam.ts`: `TaskLogbookSelect/Row`, `TaskWontDoSelect/Row`,
  `ProjectLogbookSelect/Row`, `GoalLogbookSelect/Row`,
  `InboxItemLogbookSelect/Row`; new `findMany` overloads on the
  Task/Project/Goal/InboxItem delegates; `GoalWhereInput.completedAt`,
  `ProjectWhereInput.completedAt`, `InboxItemOrderBy.archivedAt` (the webapp
  core passed `completedAt: { not: null }` and `orderBy archivedAt` straight
  to Prisma — the seam now expresses them).
- `client.ts`: translations for the same (goal/project scalar+relation
  projections, the archived-notes scalar select without the attachment join,
  `archivedAt` order column).
- `seam.checks.ts`: `expectEntities(getLogbookData, entities)`.

## 5. Web surface

- Route `src/routes/do/logbook/+page.svelte` → `LogbookView.svelte`
  (thin host, every /do route convention).
- Store `src/lib/stores/logbook.svelte.ts` — data + the four actions; day
  grouping (`Today / Yesterday / weekday < 7d / locale date`,
  `round((todayMidnight − targetMidnight) / 86_400_000)`) is client-side,
  local-time, exactly as webapp.
- `BrandMark.svelte` (own file — first port of the teal check into the new
  stack), `ArchiveMark` inline svg, `Markdown.svelte` (see §6), CSS port at
  `src/lib/styles/logbook.css`. Header/empty-state copy is byte-exact
  (`aa-list-header` classes come from `projects.css`, same import
  GoalsView uses).
- `?item=<id>` deep-link (sitewide search → archived note): scrollIntoView
  center, smooth (auto under `prefers-reduced-motion`), `.is-search-target`
  ring; only fires when the id is in the loaded groups.
- **No page keyset** (P0 §4): palette-only access (⌘\ → "Logbook") — the
  palette is S9's; Restore/Reopen stay pointer-only.

## 6. Markdown (deliberate deviation, documented)

webapp renders `outcome` via react-markdown + remark-gfm. The new stack
carries no markdown dependency and this slice adds none: `Markdown.svelte`
HTML-escapes first, then re-renders a conservative subset (paragraphs, `-`/`1.`
lists, bold/italic/strike, inline code, links — new tab, hardened). Same
safety property, smaller feature set; outcome notes are short prose. The
`.aa-md` styling rides in `logbook.css` scoped to the outcome row.

## 7. e2e

`apps/web/e2e/logbook.spec.ts` — the webapp wont-do roundtrip ported green:
loginAs(DEV_EMAIL) → capture+triage via `/rpc` (inbox/create → tasks/appData
for the lens → inbox/triage `upcoming`) → open from `/do/upcoming` (row →
Edit ghost) → detail page `×` → confirm "Mark won't do" → gone from the bench
→ `/do/logbook` waits on `/rpc/logbook/data` and asserts ok (the historical
500 regression) → row + "Won't do" chip → Restore → row gone → task back on
`/do/upcoming`. Adaptation: the new detail page's returnTo is `/do`, so the
"gone from the bench" check navigates to `/do/upcoming` explicitly.

**S5/S6 fixme note:** `goal-planning.spec.ts`'s `test.fixme("completed goals
appear in the Logbook and reopen from there")` is now IMPLEMENTABLE —
`/do/logbook` renders the teal `Goal` chip row and Reopen drives
`/rpc/goals/setDone` (`isDone: false`), the endpoint their Complete step
already exercises. Per the batch rule their spec was NOT edited; un-skip it
when convenient (assert: completed goal's name visible in a `.aa-logbook-row`
with a `Goal` chip → Reopen → row gone → goal back on `/do/goals`).
