# S8 — Logbook (P0 parity notes)

> Pre-study header for the platform-switch port. Sources read: `webapp/src/logbook/`
> (`LogbookPage.tsx`, `operations.ts`, `operationsCore.ts`, `operations.test.ts`),
> `webapp/e2e/logbook.spec.ts`, `webapp/main.wasp.ts`, `webapp/schema.prisma`
> (`TaskSession`, `TaskUpdate`), `webapp/src/auth/patRoutes.ts` (`cliLogbook`),
> `docs/features/logbook.md`, `docs/INTERACTION.md`. This file is the checklist
> the port is verified against.

## 1. Routes / screens

| Route (main.wasp.ts) | Page | Purpose |
|---|---|---|
| `LogbookRoute` → `/do/logbook` | `webapp/src/logbook/LogbookPage.tsx` | The record of things no longer active, grouped by day. Read-mostly; Restore/Reopen actions only. |
| `/do/logbook?item=<inboxItemId>` | same page | Deep-link target from sitewide search for an **archived InboxItem**: scrolls the row into view and highlights it (`.is-search-target`). |

CLI mirror (same pure core): `GET /api/cli/logbook` (`cliLogbook` in
`webapp/src/auth/patRoutes.ts`), query `?lensId` optional.

## 2. Operations (→ oRPC endpoints)

| Wasp op | Kind | Input | Output | Core |
|---|---|---|---|---|
| `getLogbook` (`logbook/operations.ts`) | query | `{ lensId: string }` | `{ tasks: LogEntry[], wontDo: LogEntry[], projects: LogEntry[], goals: LogEntry[], archived: LogEntry[] }` | `getLogbookData(entities, { userId, lensId })` in `logbook/operationsCore.ts` |
| `restoreArchivedItem` (`inbox/operations.ts`) | action | `{ inboxItemId: string }` | `{ id }` — sets `status: "UNPROCESSED", archivedAt: null` | inline in the Wasp op (no core) |
| `updateTaskStatus` (`tasks/operations.ts`) | action | `{ id, status: "UPCOMING" }` (status enum: `"TODAY" \| "UPCOMING" \| "SOMEDAY" \| "WONT_DO"`) | updated Task | `updateTaskStatusCore` in `tasks/operationsCore.ts` |
| `setGoalDone` (`goals/operations.ts`) | action | `{ id, isDone: false }` | reopened Goal | inline |
| `setProjectDone` (`projects/operations.ts`) | action | `{ id, isDone: false }` | reopened Project | core in `projects/operationsCore.ts` |

Wasp registration: `query(getLogbook, { entities: ["Task", "Project", "Goal",
"InboxItem"], auth: true })`.

`LogEntry` shapes returned by `getLogbookData` (exact):
- tasks: `{ id, title (=description), completedAt, size, outcome, project: {id,name}|null, kind: "task" }`
- wontDo: `{ id, title, completedAt (=updatedAt!), size, project, kind: "wont-do" }`
- projects: `{ id, title (=name), completedAt, goal: {id,name}|null, kind: "project" }`
- goals: `{ id, title, completedAt, goal: null, kind: "goal" }` (always `goal: null`)
- archived: `{ id, title (=text), archivedAt, kind: "archived" }`

Client cache invalidation after each action (parity for the port's cache layer):
restore archived → `getLogbook`, `getInboxItems`, `getAppData`; reopen goal →
`getLogbook`, `getGoals`, `getAppData`; reopen project → `getLogbook`,
`getProjects`, `getAppData`; restore wont-do → `getLogbook`, `getTasks`,
`getTopTask`, `getProjects`, `getProject`, `getAppData`.

## 3. Behaviors

**What's logged — five categories, one merged timeline:**
1. Completed Tasks — `isDone: true, completedAt: { not: null }`, lens-scoped.
2. Won't-do Tasks — `status: "WONT_DO"` (the non-destructive decline), ordered
   by `updatedAt` desc (not completedAt — there was a historical 500 here when
   the query read a non-existent `archivedAt` column; the e2e guards it).
3. Completed Projects — `isDone: true, completedAt not null`, **`type: "STANDARD"`
   only** (Simple-list projects are never completable, kept out).
4. Completed Goals — same shape as projects; `goal: null` in the row.
5. Archived InboxItems — `status: "ARCHIVED"`, sorted `archivedAt` desc.
   **Universal: no lensId filter** — archived notes belong to the user, not a
   context, and show in every lens's Logbook.

**Grouping:** all kinds merged client-side, sorted `when` desc
(`b.when - a.when`), grouped into `GroupedList` sections by day label:
`Today` / `Yesterday` / weekday name (if < 7 days ago) / locale
"month day, year". Day diff = `round((todayMidnight - targetMidnight) / 86_400_000)`.

**Row rendering:** BrandMark check icon for every kind except `archived`
(custom `ArchiveMark` box svg); chips — Goal = teal, Project = violet,
Archived = muted, Won't do = muted; task rows additionally show a violet
project-name chip and a teal goal chip when linked; completed tasks render
their `outcome` ("what happened") as markdown below the title.

**Actions per kind:** archived → `Restore` (title "Send back to the inbox");
wont-do → `Restore` (title "Reactivate — returns to Upcoming"); goal/project →
`Reopen`. Restoring a wont-do always lands on `UPCOMING` — the safe default
horizon; it never jumps straight onto Today. The Logbook is the only place
wont-do reactivation lives (task detail decline is one-way).
`updateTaskStatusCore` date-drop rule: `TODAY`/`SOMEDAY` null out
`scheduledDate` and `snoozedUntil` (UPCOMING keeps passed values).

**TaskSession / TaskUpdate (schema context):** the Logbook does **not**
surface focus time or update notes today. `TaskSession` (startedAt, endedAt,
plannedMinutes 25|45, completed) is focus accounting for the focus clock and
task detail; `TaskUpdate` (kind `NOTE` | `COMPLETED`) is the task timeline,
surfaced via search note matching (S9). Parity rule: don't invent time
accounting in the port's Logbook.

**Header:** eyebrow "Review", title "Logbook", description "Done and archived
work, grouped by day."

## 4. Keyboard

The Logbook page has **no page-specific keyset** (not a mode in
`docs/INTERACTION.md`; §"Permanently delete (from Logbook trash)" is future
aspirational text — no trash exists). It is reached via global shortcuts and
the palette:

- `⌘\` / `Ctrl+\` → command palette → "Logbook" command (aliases `archive`,
  `done`, `history`) → `/do/logbook`.
- `Space` → Next (`/do`), `Esc` → close overlay, `⇧I/N/T/G/P/R` nav chords —
  all apply while on the page.
- Restore/Reopen buttons are pointer-only (no single-key activation).

## 5. Edge cases + invariants

- **Entitlement gap (known):** `getLogbook` (web op) has **no
  `assertLensAllowed`** guard — a FREE user reaching the Work-lens Logbook by
  direct navigation reads Work history. The code comments say a CLI/next route
  should add it; the CLI route *does* gate (`gateLens`). Port decision: add the
  lens guard to the oRPC endpoint (parity with the CLI route, closes the gap).
- **CLI lens defaulting:** `?lensId` explicit → gated (404 "No such lens for
  this account." / 402 violation); omitted → first accessible lens; **no
  accessible lenses → 200 with empty arrays** `{ tasks: [], projects: [],
  goals: [], archived: [] }` (note: missing `wontDo` key in that empty path).
- **Query gating:** the web query is disabled until the active lens resolves
  (`{ enabled: !!lens }`, args `undefined` before that).
- **Empty state:** `ListEmpty` — title "Nothing here yet.", text "Completed
  work and archived notes land here — a calm record, not a guilt trip. Check
  off a task or archive a note and it'll show up." (calm-tone copy is a
  product invariant).
- **Unbounded read:** all five `findMany` calls have **no take/limit** — the
  whole history loads every time. Fine at current scale; a port may paginate
  but must preserve the grouped-by-day presentation.
- **?item= anchor:** `requestAnimationFrame` → `scrollIntoView({ block:
  "center", behavior: "smooth" })`, `auto` when `prefers-reduced-motion:
  reduce`; only fires when the id is present in loaded groups; row gets class
  `is-search-target`.
- Date boundaries are **local-time, client-computed** (grouping is a client
  concern; server only orders). TZ parity: grouping must run in the browser
  locale/TZ, not server TZ.
- SIMPLE_LIST projects can never appear as completed projects (filter, above).

## 6. Tests

**e2e — `webapp/e2e/logbook.spec.ts` (1 test):**
- "declining a task surfaces it in Logbook; Restore returns it to Upcoming":
  signup → triage one item to a task → open from `/do/upcoming` row → Edit →
  task detail (`/do/tasks/…`) → click "Mark as won't do" → confirm "Mark won't
  do" → redirected to `/do/upcoming`, task gone → `/do/logbook` responds ok
  (`/operations/get-logbook` — regression: once 500'd) → row visible with
  "Won't do" chip → click Restore → row count 0 → task visible again on
  `/do/upcoming`.

**Unit — `webapp/src/logbook/operations.test.ts` (4 cases):**
- throws "Not authenticated." without a user.
- fetches done tasks + projects + goals (lens-scoped where clauses verified
  exactly, incl. select shapes) + archived notes (universal where
  `{ userId, status: "ARCHIVED" }`); return shape with `kind` tags and
  `goal: null` on goals.
- returns all-empty arrays when nothing is done/archived (incl. `wontDo: []`).
- returns wont-do tasks: second `Task.findMany` call uses
  `{ userId, lensId, status: "WONT_DO" }` ordered `updatedAt` desc; row maps
  `completedAt: updatedAt`, `kind: "wont-do"`.
