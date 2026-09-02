# S5 — Projects (parity notes / P0 pre-study)

Contract header for the platform-switch port of the **Projects** surface.
Sources read: `webapp/src/projects/` (operations.ts, operationsCore.ts,
ProjectsPage.tsx, ProjectDetailPage.tsx + tests), `webapp/e2e/project-detail.spec.ts`,
`webapp/main.wasp.ts`, `webapp/schema.prisma`, `docs/WORKFLOW.md` §2.4/§2.6/§3,
`docs/INTERACTION.md`, `docs/specs/done/goal-planning.md`, `webapp/src/auth/patRoutes.ts`
(CLI mirrors), `webapp/src/simpleLists/`, `webapp/src/resources/`, `webapp/src/billing/`.
Everything below is the checklist the port is verified against. Exact strings,
enum values, and caps are quoted from the implementation.

## 1. Routes / screens

| Route (main.wasp.ts) | Page | Purpose |
|---|---|---|
| `/do/projects` (`ProjectsRoute`) | `ProjectsPage` | Lens-scoped project list: active cards + collapsible "completed" and "archived" sections; create composer; triage `Shift+P` bridge target. |
| `/do/projects/:permalink` (`ProjectDetailRoute`) | `ProjectDetailPage` | Work surface for one project: identity + Why (goal) + progress + Next-step hero + horizon-grouped tasks + resources + lifecycle actions. `:permalink` resolves **id OR permalink** (`getProjectData`: `OR: [{ id }, { permalink: id }]`). |

Adjacent surfaces that participate in the contract:
- **Logbook** `/do/logbook` — completed `type: "STANDARD"` projects (`isDone: true, completedAt: { not: null }`, ordered `completedAt desc`) as `kind: "project"` rows with a **Reopen** action (`setProjectDone({ id, isDone: false })`).
- **Triage bridge** — triage's `Shift+P` navigates to `/do/projects` with router state `{ fromInboxItemId, initialName }`: the create form opens pre-filled and submit calls `triageInboxItem({ inboxItemId, decision: "project", lensId, name })` (always creates a `STANDARD` project), not `createProject`. Nav state is captured in a ref and cleared on mount so refresh doesn't re-trigger.
- **CLI mirrors** (`webapp/src/auth/patRoutes.ts`, PAT-auth): `GET /api/cli/project/list?lensId=`, `GET /api/cli/project/show?id=` (id-or-permalink, no lens guard), `POST /api/cli/project/create` (`{ name, lensId, goalId?, description?, type? }`), `POST /api/cli/project/add-task` (`{ description, lensId, projectId?, goalId? }`).

## 2. Operations (Wasp ops → oRPC endpoints)

Ops live in `webapp/src/projects/operations.ts`; pure DB cores in
`operationsCore.ts` (no `wasp/server` import — the exact files to port).
All ops start with `if (!context.user) throw new Error("Not authenticated.")`.

### `getProjects` (query)
- In: `{ lensId: string; includeCompleted?: boolean; includeArchived?: boolean }`.
- Guard: `assertLensAllowed` (FREE = Me lens only → 402 `{feature, reason}`).
- Core: `getProjectsData`. Where `{ userId, lensId }` + `archivedAt: null` / `isDone: false` unless the include flags; `orderBy: [{ name: "asc" }]`.
- Out (per row): `{ id, permalink, name, description, dueDate, isDone, type, completedAt, archivedAt, goal: {id,name}|null, openCount, doneCount, openItems, checkedItems, nextAction, resources[] }`.
  - `nextAction` = first task where `isDone: false, status: { not: "WONT_DO" }`, `orderBy [{priority: "desc"}, {createdAt: "asc"}]`, `take: 1` (null if none).
  - `openCount` excludes `WONT_DO`; `openItems`/`checkedItems` count `ListItem`s (SIMPLE_LIST rows); `doneCount` from a second done-totals query (defaults 0 on miss).
  - `resources`: `{ id, title, url, notes, createdAt }`, `createdAt desc`.
  - Note: the page calls it with `includeCompleted: true, includeArchived: true` and re-filters client-side into active/completed/archived.

### `createProject` (action)
- In: `{ name: string; lensId: string; goalId?: string; description?: string; type?: "STANDARD" | "SIMPLE_LIST" }` → Out `{ id, permalink, name }`.
- Guards: `assertLensAllowed`; FREE cap `FREE_LIMITS.projects = 3` per lens counted as `{ userId, lensId, isDone: false }` (finishing frees a slot); cap message `feature: "a 4th project", reason: "organize more than 3 projects with Pro"` → 402.
- Core: `createProjectCore` — trims name (empty → `Error("Project name is required.")`); `SIMPLE_LIST` + `goalId` → `Error("A Simple-list Project cannot sit under a Goal.")`; seeds `order = count(projects under goal, including done)` when `goalId` set, else `order = 0`; mints permalink via `uniquePermalink` (slug: NFKD, lowercase, strip diacritics, non-alnum → `-`, max 72 chars, fallback `"item"`, suffix `-2`, `-3`, … until unique per user); creates row.

### `getProject` (query)
- In: `{ id: string }` (id or permalink). Out: full project **or `null`** (page shows "This project doesn't exist — or isn't yours.").
- Core: `getProjectData` — `findFirst({ userId, OR:[{id},{permalink:id}] })`, includes `goal {id, permalink, name}`, `tasks` (`orderBy [{isDone: "asc"}, {priority: "desc"}, {createdAt: "asc"}]`, fields incl. `content`, `status`, `scheduledDate`, `snoozedUntil`, `completedAt`, `attachments {id, filename, mimeType}`), `resources` (createdAt desc, with attachments), `attachments` (ProjectAttachment). Returns `lensId` + `order` so new tasks scope to the **project's** lens, not the active sidebar lens.
- **No lens entitlement guard on detail reads** (a FREE user may keep using a Work-lens project created before downgrade — no-data-loss invariant).

### `createTask` (action, projects namespace — "add task" on detail page)
- In: `{ description: string; lensId: string; projectId?: string; goalId?: string }` → Out `{ id, permalink }`.
- Guard: `assertStandardProject(projectId)` — 404 `"Project not found."` if missing/foreign; 400 `"This action requires a standard Project. Add checklist items directly in the list."` if `SIMPLE_LIST`.
- Core: `createTaskCore` — trims description (empty → error); `projectId && goalId` → `Error("Task can only be attached to one parent.")`; resolves lens from parent (projectId → project.lensId, else goalId → goal.lensId, else passed lensId) then runs injected `assertLens` on the **resolved** lens; creates with defaults `status: "UPCOMING"`, `priority: "NORMAL"`, `size: "M"`, `content: null`; task permalink source is `${projectPermalink}-${description}` when project-scoped.

### `setProjectDone` (action)
- In: `{ id, isDone }` → `{ id }`. Tenancy via `findUnique` + `userId !== context.user.id` → `Error("Project not found.")`. Guard: `assertLensAllowed` only (no cap — lifecycle is hygiene). Idempotent (no-op if already in state). Sets `completedAt = new Date()` on done, `null` on reopen. **Children untouched.**

### `archiveProject` (action)
- In: `{ id }` → `{ id }`. Sets `archivedAt = new Date()`, `isDone = true`, `completedAt = completedAt ?? new Date()`. Idempotent when already archived. Guard: `assertLensAllowed`.

### `moveProject` (action)
- In: `{ id, targetLensId }` → `{ id, movedTaskCount }`.
- Same-lens target → no-op `{ movedTaskCount: 0 }`. Unknown project/lens → 404 (`"Project not found."` / `"Destination Lens not found."`). Guards `assertLensAllowed` on **both** lenses.
- Moves all child tasks (`lensId = target`, **`goalId = null`** — goals are lens-scoped so the old-lens goal link is severed) and the project itself (`lensId = target, goalId = null`).

### `updateProject` (action)
- In: `{ id; name?; description?; goalId?: string | null; dueDate?: Date | null; type?: "STANDARD" | "SIMPLE_LIST" }` → `{ id, name, description, goalId }`.
- Name: trim, empty → `Error("Project name cannot be empty.")`. Description: trim, empty → `null`.
- `type` conversion only while empty: `taskCount > 0` → 400 `"Move or remove this project's actions before changing its type."`; else `listItemCount > 0` → 400 `"Clear this list before changing its type."`.
- `dueDate` on SIMPLE_LIST → 400 `"A Simple-list Project has no due date."`.
- `goalId` re-link: `SIMPLE_LIST` + non-null goal → 400 `"A Simple-list Project cannot sit under a Goal."`; unknown goal → 404; **same-Lens invariant** → 400 `"A project and its goal must be in the same Lens."`; `null` = unlink to standalone.
- Prisma `P2002` → 409 `` `You already have a project named "${name}".` `` (note: `Project` has **no** `@@unique([userId, name])` — only `@@unique([userId, permalink])` — so this catch is effectively vestigial; do not "fix" by adding a name-unique without deciding parity).

### `deleteProject` (action)
- In: `{ id; taskDisposition?: "delete" | "reassign" | "triage"; targetProjectId?: string }` → `{ id, affectedTaskCount }`. Default disposition `"delete"`.
- `reassign`: requires `targetProjectId` (400 `"Choose a project for these actions."`); target must be owned, **same lens**, `isDone: false`, `archivedAt: null` (else 404 `"Destination project not found."`); tasks `updateMany` `{ projectId: target, goalId: null }`.
- `triage`: per task creates `InboxItem { text: description, content, parsedTags: [] }`, then deletes the tasks.
- `delete`: hard-deletes the tasks.
- **Resources are always deleted** with the project (project-owned). Returns `affectedTaskCount` = tasks in the project at delete time.

### `updateTask` (action, projects namespace — re-file a task's parent)
- In: `{ id; projectId?: string | null; goalId?: string | null }` → `{ id, projectId, goalId }`.
- One-parent rule: both set → `Error("Task can only be attached to one parent.")`; setting `projectId` clears `goalId` and vice versa (on commit too).
- `SIMPLE_LIST` target → 400 `"A task cannot live in a Simple-list Project."`; cross-lens → 400 `"A task and its project must be in the same Lens."` / `"A task and its goal must be in the same Lens."`; unknown parents → 404.

### Resource ops (used by the detail page; `webapp/src/resources/operations.ts`)
- `createResource` `{ projectId, title, url?, notes?, attachments?: {filename, mimeType, dataBase64}[] }` → `{ id, title }`; `updateResource` `{ id, title?, url?, notes? }`; `deleteResource` `{ id }` → `{ id }`.
- Guards: project tenancy; `SIMPLE_LIST` → 400 `"A Simple-list Project keeps only checklist items."`; `assertLensAllowed` on the project's lens.

### Ops consumed from other slices
- `updateTaskStatus({ id, status })` and `startTask({ id })` (tasks ops) for horizon moves and the Start button (`startTask` → navigate `/do/focus`).
- `getGoals({ lensId })` for the re-link picker (active goals only — `isDone: false`); `getLenses()` for the Move picker; `getAppData` for `counts.projects` (FREE AllowanceChip); `getProjectsForResolver` (inbox op — non-done, non-archived projects across **all** lenses, name-asc then recent-activity sort — feeds capture's `#` sigil and triage pickers; SIMPLE_LIST projects are excluded from capture targets).

### DB shapes (schema.prisma)
- `Project { id uuid; name; permalink; description?; dueDate DateTime? @db.Date; isDone Bool = false; type ProjectType = STANDARD (STANDARD | SIMPLE_LIST); order Int = 0 (per-Goal sequence, goal-planning spec §E; standalone sorts by name); createdAt; completedAt?; archivedAt?; userId (Cascade); lensId (Cascade); goalId? (Goal, SetNull); tasks Task[]; resources Resource[]; attachments ProjectAttachment[]; listItems ListItem[]; @@unique([userId, permalink]); @@index([userId, createdAt]); @@index([userId, archivedAt]) }`. Container for Tasks + Resources only, **never nested**.
- `Resource { id; title; url?; notes?; createdAt; userId; projectId required (Cascade); attachments ResourceAttachment[] }` — filed under exactly one project (no loose resources; `goalId` dropped 2026-07-29).
- `ProjectAttachment / ResourceAttachment { id; filename; mimeType; size; data Bytes; createdAt }` — triage-carried images.
- `ListItem { id; text; content?; sourceUrl?; isDone = false; order = 0; completedAt?; …; projectId required (Cascade) }` — SIMPLE_LIST contents.
- `Task` (relevant fields): `projectId?` (SetNull) — null = "General"/standalone in its lens; `goalId?` (SetNull) legacy direct-goal; `status TaskStatus (TODAY | UPCOMING | SOMEDAY | WONT_DO)`; `priority (LOW | NORMAL | IMPORTANT)`; `size (S | M | L | XL)`.

## 3. Behaviors

**Projects page (`/do/projects`)**
- Header: eyebrow `Planning`, title `Projects`, description `"{N} active · Outcomes that need more than one step."`; `AllowanceChip` (FREE: used vs cap 3; PRO: none).
- Create: `RecordCreateControl` "New project" (at cap → upgrade gate `upgradeFeature: "New project"`, `upgradeReason: "organize more of your work"`). Composer "New project" with two kinds: `project` ("Project" — "Tasks, focus, and progress.") and `list` ("Simple list" — "Add items directly and check them off."). Fields: name label "Project", placeholder "Ship product v2"; description label "What makes it done", placeholder "The concrete result this project should create". Server 402 → `<ProGate feature reason>` panel, not a raw error.
- Active card (`ProgressCard` → `/do/projects/{permalink}`): progress `% = round(done / (done+open))`, label `"{done}/{total} done"` (SIMPLE_LIST: `"{checked}/{total} checked"`); meta line `List | {goal.name} | "Standalone"` · `"{n} open"` (· `"{n} done"` for non-lists) · due chip (`formatRelativeDue`: `today`, `tomorrow`, `Nd overdue`, `in Nd`, else `Mon D`). Focus slot: `Focus` + nextAction description in amber when a next action exists; else `Status` / `"No next action"` muted; SIMPLE_LIST cards show `List` / `"Check items off directly"`.
- Sections: `Show/Hide completed (N)` and `Show/Hide archived (N)` collapsible toggles (completed/archived cards render muted with `Completed` / `Archived` meta, focusValue `"Manage, archive, or delete"` / `"Archived"`).
- Empty state: `ListEmpty` "No projects yet." / "Projects are outcomes that need more than one step. Create one here, or promote a big task during triage."
- Query invalidation on create: `getProjects`, `getProjectsForResolver`, `getAppData`, `getInboxItems`.

**Project detail (`/do/projects/:permalink`)**
- Breadcrumb `Projects › [Goal] › Project` (crumb id IS the destination route; "Projects" root always present).
- Identity rail: violet dot + `Project` | `List` (violet = project/goal identity hue, never CTA). Name, description, project attachment thumbs (lightbox).
- **Why section** (STANDARD only): eyebrow `Why`; linked goal name → `/do/goals/{permalink}` with "Edit goal" button; or "Link a goal" affordance when unlinked. Picker lists `None (standalone)` + active goals in the project's lens; errors surface inline.
- Progress band (violet fill): `"{done} of {total} done"` + due chip; hidden when 0 tasks (due chip may show alone).
- **Next-step hero**: first open `TODAY` task — title, first-image cover, size → duration map `{S: "15 min", M: "30 min", L: "1 hr", XL: "2 hr+" }`, actions `Not now` (demotes to UPCOMING via `updateTaskStatus`) and `Start` (`startTask` → `/do/focus`, same loop as home). Hidden when project done. When the hero task is the *only* Today task, the Today group below is skipped.
- Calm cue (zero open Today + ≥1 open Upcoming): `"Nothing queued for today. Promote one from Upcoming below."` — never auto-promotes (Today is a commitment).
- Action row: `Add task` (primary; STANDARD + not-done only; toggles `CreateInline` placeholder `"What needs doing?"`), `Edit` (ghost, desktop ≥721px), `⋯ OverflowMenu` "Project actions": `Move` (always) · `Edit` (mobile only) · `Complete`/`Reopen` (hidden when archived or SIMPLE_LIST; Complete confirms: "It will stay in your completed projects list, where you can edit, archive, or delete it. Its tasks will not change.") · `Archive` (hidden when archived; confirms: "This will complete the project and hide it from your Projects and Logbook. Its task history will be kept.") · `Delete` (danger, always).
- Tasks grouped `Today / Upcoming / Someday / Done` from `activeTasks` (all tasks minus `WONT_DO` — declined tasks vanish from this surface and live in the Logbook). Momentum stats: `Open`, `Done this week` (`completedAt` within 7×86,400,000 ms), `Today`. Rows: done rows strip `size` + `scheduledDate` (settled look); `SOMEDAY`/done rows muted; open-row click toggles inline `TaskRowEditor` (property chips; Project chip reassigns, "No project" unlinks; one-parent rule hides the Goal chip); done-row click → `/do/tasks/{permalink}` with `state.returnTo`; attachment thumbs (`xs`) lead rows.
- Task-group empty: "No tasks yet." / "Add the first step — a task lands on Upcoming and shows on Next."
- **SIMPLE_LIST project**: `SimpleListChecklist` replaces task sections entirely (no Add task, no Why, no progress lifecycle). Items: active before completed, stable order; `N`/control adds; rename, delete, check/uncheck; completion never feeds Today/focus/Review/Logbook.
- **Resources** section (always, STANDARD only enforced server-side): "Add resource" → BottomSheet form (Title required, Link optional `type=url`, Notes optional `rows=4`); rows: external link (target=_blank rel=noopener) or plain title, notes, attachment thumbs, Edit/Remove (Remove confirms: "Tasks and their Context links stay unchanged."); `#resource-{id}` URL hash scrolls the row into view (respects `prefers-reduced-motion`) — search deep-link target.
- **Delete flows**: 0 tasks → ConfirmDialog "Delete this project?" / "This project will be removed. No tasks are in it." · ≥1 task → BottomSheet "What should happen to these tasks?" (`"{N} task(s) are still in "{name}".`) with three explicit dispositions: danger "Remove tasks and delete project"; "Move tasks to" select (sibling projects, same lens, non-done, non-archived) + "Move tasks and delete project"; "Send tasks to Triage and delete project".
- **Move flow**: `PickerSheet` "Move project to another Lens" (other lenses with color chip; empty message "There are no other Life-area Lenses to move this project to."); failure → ConfirmDialog "Couldn't move project".
- Completing navigates away to `/do/projects` (project leaves the active list; Reopen reachable via Logbook).
- Not-found/tenancy rendering: `null` from `getProject` → "This project doesn't exist — or isn't yours."
- Lens scoping: list follows the active lens; the detail page uses the project's own `lensId` for task creation and goal pickers.

**Lifecycle (WORKFLOW §2.4, locked 2026-07-05)**: complete (confirm) / reopen / edit / archive (completes, confirm) / delete / re-link. Completed projects stay visible under "completed" until archived or deleted. Archive also implies done. Deletion with tasks is always an explicit disposition (remove / reassign / triage).

## 4. Keyboard

Global (`webapp/src/app/useKeyboardShortcuts.ts`, wired app-wide):
- `Shift+P` → nav destination `planning` → `/do/projects` (`AppShell.NAV_ROUTE.planning = "/do/projects"`). This is the surface's entry chord.
- `⌘K` capture · `⌘\` command palette · `⌘L` lens switcher · `/` search (all work in text fields except `/`) · `Space` → `/do` (Next) · `Shift+C` capture · `?` / `⌘?` cheatsheet · `Esc` close topmost overlay. `Shift+I/N/T/G/R` → Inbox/Next/Today/triaGe/Review.
- From triage, `Shift+P` is the "convert to project" bridge (navigates here with prefill; WORKFLOW §2.4 "the one bridge"). Triage Classify step: `4` = Project type (`1` Task · `2` List item · `3` Resource · `4` Project · `5` Delete · `/` Lens picker · `Enter` continue).

Simple-list keyset (SIMPLE_LIST project page, `SimpleListChecklist`; INTERACTION.md "SIMPLE LIST surface"):
- `N` add (focus the add input) · `J`/`K` move selection down/up (clamped) · `Space` toggle completion of the selected item · `E` rename selected (Enter saves, `Esc` cancels) · `Delete`/`Backspace` delete selected · `Esc` cancel edit + deselect. All suppressed while typing in an input, while a confirm is open, or while saving. Click also selects; checkbox click toggles.

Not implemented (documented future model only — do NOT port as keys): INTERACTION.md's zoom mode `Z`/`X` (Task→Project→Goal) and `Enter` re-anchor at Project scope. The implemented navigation is the breadcrumb + links.

## 5. Edge cases + invariants

- **Entitlements**: `FREE_LIMITS.projects = 3` per lens, counted **non-done** (completing frees a slot); FREE = Me lens only (`assertLensAllowed` → 402 with `{feature: "a 4th project", reason: "organize more than 3 projects with Pro"}`). Cap UI (`AllowanceChip`, upgrade-gated create) is advisory; the server is the boundary. Detail reads are **never** lens-gated (no data loss on downgrade). Lifecycle toggles (`setProjectDone`, `archiveProject`) are not cap-gated (hygiene).
- **Same-Lens invariant**: project↔goal and task↔project/goal links must share a Lens — enforced on create, re-link (`updateProject`, `updateTask`), and `moveProject` (which severs the goal link instead).
- **One-parent rule**: a task is filed under a Project XOR a Goal (or neither); setting one clears the other; both in one call → error.
- **SIMPLE_LIST invariants** (WORKFLOW §2.4/§2.6/§3): no goal, no tasks, no resources, no due date, no completion lifecycle; archive + delete remain; delete removes its list items (cascade); type switch allowed only when the project has zero tasks AND zero list items. Server rejects cross-type writes (the UI boundary is not the guard).
- **Sorting**: list page `name asc` (goal-scoped sequence `order asc, name asc` is a Goal-page concern — see S6); detail tasks `isDone asc, priority desc, createdAt asc`; resources `createdAt desc`; `nextAction` `priority desc, createdAt asc` take 1; resolver list `name asc` then most-recent-child-activity.
- **Deletion semantics**: explicit `taskDisposition` (default `delete`); reassign target must be a sibling (same lens, active, unarchived) and tasks lose `goalId`; triage disposition recreates each task as an InboxItem (`text`, `content`, `parsedTags: []`) then deletes; resources always deleted; `affectedTaskCount` returned.
- **WONT_DO** tasks are excluded from open counts, `nextAction`, and the whole detail-page surface (Logbook-only until restored).
- **Progress honesty**: `total === 0 → 0%`, band hidden with no tasks; nothing fabricated ("never lies").
- **Permalinks**: slugified unique per user; project tasks prefix the project permalink; detail resolves id OR permalink.
- **Tenancy**: every query/update filters `userId`; wrong-owner reads look like 404/not-found.
- **Project names are NOT unique per user** (only permalinks are) — unlike Goals. Keep this asymmetry unless parity is re-decided.
- Logbook note: the completed-projects query filters `isDone: true, completedAt not null, type: "STANDARD"` but does **not** filter `archivedAt` — archived projects can still appear in the Logbook query despite the archive dialog copy ("hide it from your … Logbook"). Reproduce-or-fix during the port; the dialog copy currently overpromises.

## 6. Tests

### e2e — `webapp/e2e/project-detail.spec.ts` (3 cases)
1. **"opening a project shows its tasks; add + horizon move work"** — project created via triage; opening it from `/do/projects` shows the name as heading; "Add task" → fill "What needs doing?" → Create → task visible; the row has **no** completion circle (`.aa-task-row__circle` count 0 — completing happens in focus mode, not by ticking a row); row "Today" button promotes it; with exactly one Today task a Next-step hero with a `Start` button appears.
2. **"lifecycle actions sit behind ⋯; Edit and Add task stay visible (desktop)"** — Add task + Edit buttons visible; Delete not directly visible; "Project actions" ⋯ menu exposes Move + Archive; Archive opens the "Archive this project?" confirm.
3. **"declining a project task from its page removes it from the project"** — add task → row title click → Edit → lands on `/do/tasks/…` → "Mark as won't do" → confirm "Mark won't do" → back on the project page (returnTo) the declined task is gone (decline = removal from the project surface, not a re-file into Someday).

### Unit (parity signal, `webapp/src/projects/operations.test.ts` + `ProjectDetailPage.test.tsx`)
- Ops: getProjects lens-scoping + count merge + nextAction-null; createProject trim + order seeding (standalone order=0); createTask resolves the persisted project's lens; setProjectDone idempotent + tenancy; moveProject ownership; updateProject 404s, empty-name, cross-lens re-link rejection, P2002→409, unlink; deleteProject dispositions (delete + triage with notes); updateTask one-parent + cross-lens rejection + goalId clearing.
- Page: search destination resource anchor scroll; inline row editor replaces Move picker; done rows hide size/due metadata; WONT_DO excluded from all groups/stats (project with only declined task reads empty); goal picker lists active goals in the project's lens and fires `updateProject`; violet goal link; "None (standalone)"; lifecycle confirms; no Archive/Reopen on archived projects; all three delete dispositions offered; Next-step hero rules (exactly-one vs multiple Today, Start → focus route, Not now demotes, absent with zero Today tasks).

---
*Do not edit `webapp/` from this slice. This header is the parity checklist for the oRPC contract port (`packages/contract/src/s5-projects/`).*
