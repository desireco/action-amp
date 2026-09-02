# S4 — Tasks & Lists (parity notes)

> P0 pre-study for the platform switch. Source of truth read: `webapp/src/lists/`
> (TodayPage, UpcomingPage, SomedayPage, WeekPage, weekView, ListShell),
> `webapp/src/tasks/` (operations, operationsCore, TaskRowEditor,
> taskPropertyFields, TaskDetailPage), `webapp/src/simpleLists/`
> (operations, operationsCore, SimpleListChecklist), `webapp/src/app/operations.ts`
> (getAppData rollover, todayCap), `webapp/main.wasp.ts`,
> `webapp/e2e/today.spec.ts` + `webapp/e2e/simple-lists.spec.ts`,
> `docs/INTERACTION.md`, `docs/WORKFLOW.md` §2.3/§5. These notes are the
> checklist the port is verified against.

## 1. Routes / screens

| Route (main.wasp.ts) | Page | Purpose |
| --- | --- | --- |
| `/do/today` (`TodayRoute`) | `lists/TodayPage` | Global committed-for-today list (all accessible lenses), capped, grouped by Goal, Done-today section. |
| `/do/week` (`WeekRoute`) | `lists/WeekPage` | Global Monday–Sunday scheduling horizon (dated TODAY + UPCOMING tasks by weekday). |
| `/do/upcoming` (`UpcomingRoute`) | `lists/UpcomingPage` | The bench — lens-scoped `status=UPCOMING`, date-bucketed, overdue recovery. |
| `/do/someday` (`SomedayRoute`) | `lists/SomedayPage` | Parked — lens-scoped `status=SOMEDAY`, flat muted list. |
| `/do/tasks/:permalink` (`TaskDetailRoute`) | `tasks/TaskDetailPage` | Single-task URL: prose edit (title + Context), won't-do, outcome, done-task feedback. |
| `/do/projects/:permalink` (`ProjectDetailRoute`) | `projects/ProjectDetailPage` | For `type=SIMPLE_LIST` projects this page hosts `simpleLists/SimpleListChecklist` — the checklist surface covered by `simple-lists.spec.ts`. |
| `/do/today/:permalink` (`TodayTaskRoute`) | `app/NextPage` | Picked-task path used by Today's overflow "Do" button (S1's page). |

## 2. Operations (→ oRPC endpoints)

Cores: `webapp/src/tasks/operationsCore.ts`, `webapp/src/simpleLists/operationsCore.ts`,
rollover inline in `webapp/src/app/operations.ts` (`getAppData`).

**Queries**

- `getTodayTasks` — no args → `TaskLensListRow[]` (Task + tags + light
  project/goal + `lens{id,name,color}`). Where: `userId`, `lensId ∈
  resolveAccessibleLenses(user)` (the entitlement gate — **set filter, not
  assertLensAllowed**), `status: "TODAY"`, `isDone: false`. Empty accessible set
  → `[]`. Core: `getTodayTasksData`. OrderBy: `order asc, priority desc,
  createdAt asc`.
- `getWeekTasks` — no args → `TaskLensListRow[]`. Same accessible-lens filter;
  `status ∈ {TODAY, UPCOMING}`, `isDone: false`, and
  `OR: [{status: "TODAY"}, {scheduledDate: {lt: nextWeekStart}}]` — the bare
  `lt` (not `gte weekStart`) deliberately admits overdue rows. `weekStart =
  today − (dayOfWeek − 1)` in `User.timeZone` (Temporal Monday=1). Core:
  `getWeekTasksData`. OrderBy: `scheduledDate asc, order asc, priority desc,
  createdAt asc`.
- `getDoneToday` — in `{ lensId? }` → `DoneTodayRow[]`. Where: `status: "TODAY"`
  (only Today-committed completions belong here), `isDone: true`,
  `completedAt ≥ start-of-today in User.timeZone`. OrderBy `completedAt desc`.
  With `lensId`: lens-scoped + `assertLensAllowed`; without: accessible-lens set
  (this is how Today's Done section reads). Core: `getDoneTodayData`.
- `getTasks` — in `{ lensId, status?: TODAY|UPCOMING|SOMEDAY, isDone? }` →
  `TaskListRow[]`. Guard: `assertLensAllowed(context, lensId)`. Used by Upcoming
  (`status: "UPCOMING", isDone: false`) and Someday (`status: "SOMEDAY",
  isDone: false`). Core: `getTasksData`. OrderBy: `order asc, priority desc,
  createdAt asc`.
- `getTask` — in `{ id }` (id or permalink) → detail + tags + `updates` asc +
  attachments. Core: `getTaskData`. (Shared with S1.)
- `getAppData` — in `{ lensId? }` → `{ lenses[{id,name,color,isIncluded,purpose}],
  counts{inbox, today(global), upcoming(lens), someday(lens), projects, goals},
  todayCap, focusSessionMinutes, reviewPreferences{today,week,month}, timeZone }`.
  **Runs the lazy daily rollover first** (below). Today's count = global
  (accessible lenses, `status TODAY`, not done); upcoming/someday/projects/goals
  are active-lens-scoped. Counts key is `counts.today` (the page list) — the nav
  badge pool note (S1) uses `activePoolWhere` elsewhere.
- `getProjects { lensId }` / `getGoals { lensId }` — feed TaskRowEditor's
  project/goal pickers (picker scope = page's active lens, else the row's
  provenance lens).
- Simple lists — `getSimpleList { projectId }` → `ListItem[]` + attachments,
  guarded `requireSimpleListProject` (owned + `type === "SIMPLE_LIST"`, else
  `"This operation requires a Simple-list Project."`) and lens entitlement.
  OrderBy: `isDone asc, order asc, createdAt asc` (open before checked,
  stable).

**Actions**

- `updateTaskStatus` — in `{ id, status: TODAY|UPCOMING|SOMEDAY|WONT_DO,
  scheduledDate?, snoozedUntil? }` → full Task. Core `updateTaskStatusCore`
  enforces the **one-field-may-say-today rule**: `status === "TODAY" ||
  "SOMEDAY"` forces `scheduledDate = null` **and** `snoozedUntil = null`; UPCOMING
  keeps whatever was passed. (`timeZone` param kept for signature stability, not
  read.)
- `updateTaskDetails` — in `{ taskId, description?, content?, priority?, size?,
  status?: TODAY|UPCOMING|SOMEDAY, scheduledDate?, projectId?, goalId? }` →
  selected fields. Validation: `description` present → trim non-empty else
  `"Task title is required."` (structural-only calls that omit description skip
  the check); `content.trim() || null`; `status` TODAY/SOMEDAY drops
  `scheduledDate`; project: owned + `type !== "SIMPLE_LIST"` (else `"A task
  cannot live in a Simple-list Project."`) + same Lens (`"Project must be in the
  same Lens."`), and setting a project **clears goalId** (one-parent rule); goal:
  rejected when the task has a project (`"A task can't have both a project and a
  goal."`), owned + same Lens. Only passed fields are written (partial patch).
- `unscheduleOverdueTasks` — in `{ lensId }` → `{ count }`. Guard
  `assertLensAllowed`. `updateMany`: `status: "UPCOMING", isDone: false,
  scheduledDate < today (User.timeZone)` → `scheduledDate: null`. Future-dated,
  Today, Someday, and done tasks never touched.
- `toggleTaskDone { id, outcome? }`, `snoozeTask { id, preset }`,
  `setTaskOutcome { taskId, outcome }` (trim || null; independent of done state;
  writable anytime), `startTask`/`pauseTask` (via row affordances elsewhere) —
  shapes in the S1 notes; the same endpoints serve this slice.
- Simple lists — `createListItem { projectId, text, content?, sourceUrl?,
  attachments? }`: text trim, required, ≤ **500** chars
  (`MAX_LIST_ITEM_TEXT_LENGTH`), `order = (max existing order ?? -1) + 1`;
  `renameListItem { id, text }` (same normalization); `setListItemDone { id,
  isDone }` (sets/clears `completedAt`); `deleteListItem { id }`;
  `clearCompletedListItems { projectId }` → `deleteMany isDone: true`. All
  item-level ops verify the item's project is an owned SIMPLE_LIST project +
  `assertLensAllowed` on its lens.

**Entities / DB shape**: `Task` (fields in the S1 notes; `order Int @default(0)`
is the manual list order), `Project.type` (`STANDARD | SIMPLE_LIST`), `ListItem`
(`text`, `content?`, `sourceUrl?`, `isDone`, `order`, `completedAt?`,
`@@index([projectId, isDone, order])`), `User.todayCap Int @default(5)`.

## 3. Behaviors

**Today** (universal across lenses; WORKFLOW §5.11):

- Hero: title `"${tasks.length} of ${todayCap} committed"` (the **total**, so
  over-capacity reads "6 of 5 committed"), subtitle `"Day's full. Finish one to
  make room."` when `committedCount >= todayCap` else `"Keep the day small
  enough to finish."`, plus a meter of `todayCap` dots (filled =
  `min(length, cap)`). Hero links: "This week" (`/do/week`, week count) +
  "Upcoming" (`/do/upcoming`, `appData.counts.upcoming`).
- **Cap is client-side display, not a server rejection**: first `todayCap` rows
  group by Goal (`t.goal?.name ?? "General"`; a solo General group renders with
  a blank label); the overflow (`slice(todayCap)`) renders **muted** in a
  `<ul aria-label="Beyond the cap, N task(s)">` under an amber
  **"Over capacity"** banner: "N tasks beyond the cap of X. Bump one to Upcoming
  or Someday to make room." Overflow rows carry a "Do" button → picked-task path
  `/do/today/:permalink`. Cap range 3–12, default 5 (`User.todayCap`;
  `saveTodayCap` validates integer 3–12, error "Today cap must be a whole
  number between 3 and 12.").
- Rows carry a **trailing lens pill** only when the user has 2+ lenses
  (`appData.lenses.length > 1`). Row click toggles an expanded drawer with the
  TaskRowEditor.
- **Done today** section (count > 0): grouped identically, muted, Hide/Show
  toggle (default shown), each row a link to the task detail + "Leave feedback"
  button (FeedbackDialog, message prefixed "Done task feedback: \<title\>").
- Empty: "Nothing today." / "Pull one in from Upcoming, or triage something from
  the Inbox." + "See upcoming N" button when `upcomingCount > 0`.

**Daily rollover** (lazy, inside `getAppData` on every app load): if
`User.lastTodayRolloverAt`'s calendar day in `User.timeZone` ≠ today (or null) →
`updateMany { userId, status: "TODAY", isDone: false } → status: "UPCOMING"`,
then stamp `lastTodayRolloverAt = now`. Done tasks untouched (keep status for
Logbook); `startedAt` preserved (interrupted Now task resurfaces #1 on Next);
idempotent within a day; no cron. `getAppData` also throttled-stamps
`lastActiveAt` (15-min window, best-effort).

**Upcoming** (lens-scoped bench; WORKFLOW §5.1): hero "`N` on the bench";
subtitle adapts — "`N` overdue — these slipped past their date." /
"The bench. Snoozed or scheduled — pull one onto Today when it's time." /
"Tasks with a future date land here."; cross-link "Today" count → `/do/today`.
Client-side buckets in fixed order: **Overdue** (dated diff < 0, rose-tinted
group, top), **This week** (0–7), **Next week** (8–14), **Later** (>14),
**Snoozed** (no `scheduledDate` but `snoozedUntil` set), **Unscheduled**
(neither). Empty groups hidden. Overdue recovery banner: "Clear past dates.
Tasks stay on the bench without an overdue label." + button "Unschedule N
overdue" → `unscheduleOverdueTasks`. Empty: "Nothing upcoming." / "Tasks with a
future date land here. Add a due date from triage or edit a task to schedule
it." + "Go to Inbox".

**Someday**: header "Someday" under Planning eyebrow, "`N` parked · Kept without
asking for attention today."; flat muted list (no groups); row drawer reveals
TaskRowEditor. No "→ Upcoming" affordance (single promote path via the When
chip). Empty: "Nothing parked." / "Someday is for things you want to keep but
stop nagging about. Send a task here from triage or by changing its status."

**Week**: hero "`N` scheduled" + "Give work a day. Today stays small and
deliberate." + "Today" button. Seven Monday–Sunday groups (empty days kept),
labels "Monday, Sep 1" style; today's label prefixed "Today · ". Pure bucketing
(`weekView.bucketWeekTasks`): dated inside the week → its weekday; dated before
the week (overdue) → **Today bucket**; `status TODAY` undated → Today bucket;
undated UPCOMING not in the pool (skipped defensively). Lens pill when 2+ lenses.

**TaskRowEditor** (chips-only, reshaped 2026-08-31 — commit `7ba935b`):
the expanded-row drawer renders `PropertyChips` where **every pick saves
immediately** (`updateTaskDetails`); an **Edit** ghost button navigates to
`/do/tasks/:permalink` with `state.returnTo` (current URL). Done rows render
`null`. Fields (`taskPropertyFields`):

- **When** (`status`): Today ("on the table now") / Upcoming ("the bench") /
  Someday ("maybe later"). This is now the promote/demote path (the old
  "Move to Upcoming" button + confirm dialog were removed in `48c1cb6`).
- **Priority**: Low ("when you can") / Normal ("default") / Important ("today
  matters"). Chip variant `important` when IMPORTANT.
- **Size**: S "15 min" / M "30 min" / L "1 hr" / XL "2 hr+".
- **Project**: bottom-sheet picker of the picker-lens's projects (meta shows the
  project's goal name), allowNone "No project".
- **Due** (only when `status !== "TODAY"` — a Today row must never render two
  "today" signals): preset popover none/today/tomorrow/`weekday-1..6` +
  `weekday-0` (Sunday)/next-week (next Monday)/next-month, resolving to local
  calendar dates; unset renders a quiet "+ Due". **Picking a due date on a
  SOMEDAY task auto-promotes `status → UPCOMING`** (editor adds the patch).
- **Goal** (only when no project — one-parent rule): picker of lens goals;
  allowNone only when already set; unset renders "+ Goal".
- Invalid enum picks are dropped at the boundary (`chipPickToTaskPatch`
  validates against the closed sets) — never reach the op. Failed writes: chips
  revert via invalidation refetch (honest no-stick signal). WONT_DO rows never
  render an editor (anything not TODAY/SOMEDAY reads as Upcoming).

**Task detail** (`/do/tasks/:permalink`): prose edit only — title input +
"Context" textarea buffered in local state; "Save task" disabled unless title
non-empty **and** something changed; help line "Save writes the title and
notes."; Cancel/Back → `returnTo` (guarded to `/do`-prefixed state). Breadcrumb
goal → project → task (else "← Back"); permalink chip `/tasks/<permalink>`;
"Added \<Mon D, YYYY>". Property-key shortcuts stay live here (below). Done
tasks are read-only: static chips, Context as markdown, attachment thumbs,
**Outcome** editable afterwards via `setTaskOutcome` (Edit/Add outcome,
⌘↵ saves), and inline feedback (textarea ≤ **4000** chars with live
`n/4000` counter). **Won't do**: X-button "Mark as won't do" → ConfirmDialog
("Mark as won't do?" / "It leaves your lists and surfaces in the Logbook, where
you can restore it." / confirm "Mark won't do" / cancel "Keep task", danger) →
`updateTaskStatus {status: "WONT_DO"}` → navigate back. Hidden when done or
already WONT_DO; one-way from here (restore lives in the Logbook).
"Inset project resource" (PickerSheet) appends a markdown link
`[title](url or /do/projects/<permalink>#resource-<id>)` to Context — only for
project-filed tasks with resources.

**Simple-list checklist** (SimpleListChecklist, at the project URL): add form
"Add an item…" (Enter submits; input refocuses after add); sections **Open**
then **"Checked N"**; checkbox aria-labels `Check <text>` / `Reopen <text>`;
clicking a title (or `E`) enters inline rename (Enter saves — empty no-op — Esc
cancels); "Remove" button per row; "Clear checked" (only when checked > 0) →
ConfirmDialog "Clear checked items?" / "Permanently remove N checked item(s)."
(danger, confirm "Clear checked") → `clearCompletedListItems`; empty state
"List clear. / Add the first thing you want to remember."; items may carry
captured `content` (linkified), a safe `sourceUrl` (http/https only, "Open
source" link), and attachment thumbs. Completion stays inside the list — never
feeds Today, focus, Review, or Logbook.

## 4. Keyboard

**Global** (`app/useKeyboardShortcuts.ts`): `⇧T` → `/do/today`; `⇧N` → `/do`;
`⇧P` → Planning (`/do/projects`, per `AppShell.NAV_ROUTE.planning`); `⇧I` Inbox,
`⇧G` Triage, `⇧R` Review; `Space` →
`/do` (bare page chrome only); `⌘K` capture; `⌘L` lens; `/` search; `?`/`⌘?`
cheatsheet; `Esc` topmost overlay.

**Property keys** (`components/ui/usePropertyKeys.ts`, active on TaskDetailPage
and triage; the canonical PropertyChips keymap, TRIAGE.md §7.4/§7.6):

- `[` size down, `]` size up — cycle `S ↔ M ↔ L ↔ XL` (wraps).
- `-` priority down, `=` priority up — cycle `LOW ↔ NORMAL ↔ IMPORTANT` (wraps).
- `H` cycle When — `TODAY → UPCOMING → SOMEDAY → TODAY` (wraps).

Guards: no-op while typing in INPUT/TEXTAREA/SELECT/contenteditable, while a
meta/ctrl/alt chord is held, while a chip popover/sheet is open
(`onOpenChange`), or when disabled (done tasks on the detail page).

**Simple-list surface** (SimpleListChecklist; matches INTERACTION.md exactly):
`N` focus the add input · `J`/`K` move selection down/up (clamped, ordered =
open then checked) · `Space` toggle the selected item · `E` rename selected ·
`Delete`/`Backspace` delete selected · `Esc` cancel edit + deselect. Suppressed
while typing, while the clear-confirm dialog is open, or while saving.

**Task detail**: `⌘↵` in the Outcome textarea saves the outcome. Row drawers and
chips are pointer-driven (no per-row keys in lists today).

## 5. Edge cases + invariants

- **Cap**: `todayCap` default 5, integer range 3–12 (`TODAY_CAP_MIN/MAX`,
  `TODAY_CAP_DEFAULT` exported from `app/operations.ts`); enforced client-side
  only — the server never rejects over-cap commits (the amber banner is the
  forcing function). TodayPage falls back to `TODAY_CAP_DEFAULT` while
  `getAppData` is loading.
- **One-field-may-say-today rule** (both `updateTaskStatus` and
  `updateTaskDetails`): committing to TODAY or parking in SOMEDAY nulls
  `scheduledDate` and `snoozedUntil`; only UPCOMING carries bench scheduling.
  Mirrored in the UI: no Due chip on TODAY rows; TaskRow meta suppresses a
  duplicate today pill.
- **Done-today scoping**: only `status === "TODAY"` rows (`getDoneToday`) —
  completion from focus leaves `status` untouched, so an Upcoming task finished
  via focus never appears in Today's Done section.
- **WONT_DO**: drops out of every active list (positive status filters exclude
  it), surfaces in the Logbook ("Won't do" section, restore there); `updatedAt`
  is the only decline timestamp. One-way from the detail page.
- **One-parent rule**: task has project XOR direct goal; assigning a project
  clears the goal; goal assignment rejected when a project exists; both parents
  must be in the task's Lens; SIMPLE_LIST projects reject tasks outright.
- **Entitlement**: lens-scoped reads (`getTasks`, `unscheduleOverdueTasks`) use
  `assertLensAllowed` (FREE = included lens only, 402 otherwise, keyed on
  `isIncluded`); universal reads (Today/Week/Done-today) use the
  accessible-lens **set filter** (`resolveAccessibleLenses`), so a downgraded
  user's cross-lens rows disappear without per-task 402s. Empty accessible set →
  `[]`, never Prisma `in: []`.
- **Rollover** is timezone-correct (`User.timeZone`, UTC fallback) and global
  (`where: { userId, status: "TODAY" }` — no lens filter).
- **Date/time**: `scheduledDate` is date-only (`@db.Date`), compared as
  UTC-midnight Dates via `plainDateToDb` against today-in-`User.timeZone`;
  bucketing on the client uses `calendarDayDifference(currentPlainDate(),
  plainDateFromValue(date))` in the system zone; `snoozedUntil` is an exact
  timestamptz instant. All via `webapp/src/shared/time/temporal.ts`.
- **Week pool subtlety**: overdue (`scheduledDate < weekStart`) rows stay in the
  pool and land in the Today bucket; a TODAY commit without a date still counts
  (status arm of the OR) — keeps Today badge and Week counts from diverging.
- Task `permalink` is `@@unique([userId, permalink])`; `getTask` matches id or
  permalink; rows navigate with `permalink ?? id`.
- Simple-list invariants: text ≤ 500 chars (server-validated); `order` =
  max+1; ops require an owned SIMPLE_LIST project (server guard — the UI
  boundary is not the guard); FREE-lens gating applies through the project's lens.
- List ordering everywhere: `order asc, priority desc, createdAt asc` (Week
  prepends `scheduledDate asc`); Done-today `completedAt desc`.

## 6. e2e coverage

**`webapp/e2e/today.spec.ts`** (helper caveat: avoid leading "Today" in task
text — capture NL parsing strips it as a date keyword):

1. "F12: Today is capped at 5 — a 6th item is flagged as over-capacity" —
   triage 6 items (`Focus task 1..6`) to Today → `/do/today` shows heading
   `/of 5 committed/`, an "Over capacity" banner, and
   `[aria-label^='Beyond the cap']`.
2. "'Move to Upcoming' demotes; Upcoming's 'Today' promotes back" — after
   clearing the seed, triage "Swap me around" to Today → demote via "Move to
   Upcoming" (row button + confirm dialog) → row count 0 on Today → visible on
   `/do/upcoming` → per-row "Today" button promotes → gone from Upcoming → back
   on `/do/today`.
   **Spec drift**: those selectors predate the chips-only row editor reshape
   (2026-08-31, `7ba935b`/`48c1cb6`) — demote/promote is now the **When chip**
   (status pick Upcoming/Today) in the expanded row drawer. Port the
   behavior (Today ↔ Upcoming round-trip), re-bind selectors.

**`webapp/e2e/simple-lists.spec.ts`**:

1. "a Simple-list Project is created, opened, and checked off in place" —
   create "Packing" from `/do/projects` (New project → composer → "Simple list"
   radio → Create project) → open → URL `/do/projects/packing` + "List" badge →
   add "Passport" via "Add an item" + Enter → checkbox `Check passport` appears
   → click → becomes `Reopen passport` → "Clear checked"
   (`.aa-simple-list__clear`) → dialog "Clear checked items?" → "Clear checked"
   → "List clear." visible.
2. "triage files a captured thought into a Simple list in one step" — capture
   "Oat milk" (⌘K) → `/do/inbox/review` → pick type "List item" (lens pills swap
   for the list picker) → combobox "Add to list" → option "Groceries · <Lens>" →
   "Add to Groceries" → item gone from triage → checkbox `Check oat milk` on
   `/do/projects/groceries`.

Shared helpers: `signupNewUser` (DB-seeded user + `/login?devEmail=` autologin),
`triageOneItem` (capture → wizard → Ready; `when: "today"|"someday"` via the
When chip), `completeTopTask` (focus-loop cleanup of up to 3 seeded starter
tasks), `createListProject`.
