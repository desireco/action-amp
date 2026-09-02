# S6 — Goals (parity notes / P0 pre-study)

Contract header for the platform-switch port of the **Goals** surface.
Sources read: `webapp/src/goals/` (operations.ts, operationsCore.ts,
GoalsPage.tsx, GoalDetailPage.tsx + tests), `webapp/e2e/goal-planning.spec.ts`,
`webapp/main.wasp.ts`, `webapp/schema.prisma`, `docs/WORKFLOW.md` §2.4/§3,
`docs/INTERACTION.md`, `docs/specs/done/goal-planning.md` (§A–G),
`webapp/src/auth/patRoutes.ts` (CLI mirrors), `webapp/src/logbook/`,
`webapp/src/billing/`. Everything below is the checklist the port is verified
against. Exact strings, enum values, and caps are quoted from the implementation.

Structural frame (WORKFLOW §2.4): Goals are the **organizing layer** — active,
outcome-oriented ("Run a 10k"), always in a Lens (life area). Projects link to
a Goal to express WHY they matter. Goals do **not** own Tasks in current flows
(`Task.goalId` is legacy direct-goal data); **Projects are the unit that
supports a Goal**. Same lifecycle as Projects: complete / reopen / edit /
delete / re-link; completed Goals surface in the Logbook with Reopen.

## 1. Routes / screens

| Route (main.wasp.ts) | Page | Purpose |
|---|---|---|
| `/do/goals` (`GoalsRoute`) | `GoalsPage` | Lens-scoped **active** goals list (`isDone: false` only) with rollup progress + Focus line; create composer. |
| `/do/goals/:permalink` (`GoalDetailRoute`) | `GoalDetailPage` | One goal: header meta (done/total + %), `Focus: <project>` line, linked-projects list with reorder, lifecycle actions. `:permalink` resolves **id OR permalink** (`getGoalData`: `OR: [{ id }, { permalink: id }]`). |

Adjacent surfaces that participate in the contract:
- **Logbook** `/do/logbook` — completed goals (`isDone: true, completedAt: { not: null }`, `completedAt desc`, lens-scoped) as `kind: "goal"` rows, `{ id, title, completedAt, goal: null }`, rendered with a teal `Goal` kind chip + **Reopen** button → `setGoalDone({ id, isDone: false })`.
- **Project detail** (`/do/projects/:permalink`) — the *only* link-creation surface: the "Why / Link a goal" picker lists active goals of the project's Lens (see S5). The goal page never creates or links projects (the add-project-from-goal flow was removed).
- **CLI mirrors** (`webapp/src/auth/patRoutes.ts`, PAT-auth): `GET /api/cli/goal/list?lensId=`, `GET /api/cli/goal/show?id=` (id-or-permalink, no lens guard), `POST /api/cli/goal/create` (`{ name, lensId, description? }`).
- Nav: the sidebar "Plan" group (Upcoming / Projects / Goals / Someday) with `counts.goals` badge from `getAppData`.

## 2. Operations (Wasp ops → oRPC endpoints)

Ops live in `webapp/src/goals/operations.ts`; pure DB cores in
`operationsCore.ts` (no `wasp/server` import — the exact files to port).
All ops start with `if (!context.user) throw new Error("Not authenticated.")`.

### `getGoals` (query)
- In: `{ lensId: string }`. Guard: `assertLensAllowed` (FREE = Me lens only → 402 `{feature, reason}`).
- Core: `getGoalsData` — `Goal.findMany({ userId, lensId, isDone: false }, orderBy [{ name: "asc" }])`, including `projects` (`orderBy [{ order: "asc" }, { name: "asc" }]`, select `{ id, permalink, name, isDone, order }`).
- Out (per row): `{ id, permalink, name, description, projectCount, progress, nextProject }` where `progress = Math.round(projectsDone / projectsTotal * 100)` (`0` when `projectsTotal === 0`) and `nextProject` = first non-done project in sequence order (`{ id, permalink, name }`) or `null` when the goal has no projects or all are done — the "never lies" rule (goal-planning spec §E).

### `getGoal` (query)
- In: `{ id: string }` (id or permalink). Out: goal + `projects` or `null` (page shows "This goal doesn't exist — or isn't yours.").
- Core: `getGoalData` — `findFirst({ userId, OR: [{ id }, { permalink: id }] })`, `projects` ordered `[{ order: "asc" }, { name: "asc" }]`, each `{ id, permalink, name, isDone, order, dueDate, tasks: { id, isDone }[] }` (tasks feed the per-project % read).
- **No lens entitlement guard** (detail read; same no-data-loss invariant as projects).

### `createGoal` (action)
- In: `{ name: string; lensId: string; description?: string }` → Out `{ id, permalink, name }`.
- Guards: `assertLensAllowed`; FREE cap `FREE_LIMITS.goals = 1` per lens counted as `{ userId, lensId, isDone: false }`; cap message `feature: "a 2nd goal", reason: "link work to more than one outcome with Pro"` → 402.
- Core: `createGoalCore` — trims name (empty → `Error("Goal name is required.")`); mints permalink via `uniquePermalink` (slug: NFKD, lowercase, strip diacritics, non-alnum → `-`, max 72 chars, fallback `"item"`, suffix `-2`, `-3`, … unique per user); creates row.

### `setGoalDone` (action)
- In: `{ id: string; isDone: boolean }` → `{ id }`.
- Tenancy via `findUnique` + `userId !== context.user.id` → `Error("Goal not found.")`. Guard: `assertLensAllowed` only — **no cap check** (completing/reopening are hygiene). Idempotent when already in the requested state. `isDone=true` stamps `completedAt = new Date()`; `false` clears both.
- **Children untouched** — completing a goal does not auto-complete or archive its projects/tasks (explicit non-goal, spec §A/§B).

### `updateGoal` (action)
- In: `{ id: string; name?: string; description?: string }` → `{ id, name, description }`.
- Unknown/foreign id → 404 `"Goal not found."`. Name trimmed; empty → `Error("Goal name cannot be empty.")`. Description trimmed, empty → `null`.
- Prisma `P2002` (Goal has `@@unique([userId, name])`) → 409 `` `You already have a goal named "${data.name}".` `` — the client passes the raw string because the wire type rejects `null`; the op does the empty→null conversion.

### `deleteGoal` (action) — lossless default
- In: `{ id: string }` → `{ id, reparentedCount }`.
- Re-parents to `goalId = null` (standalone, same Lens): child `Project`s, legacy direct-goal `Task`s, then deletes the Goal. `reparentedCount = projectCount + taskCount` (informational — the confirm copy in the UI uses its own project count). Nothing else destroyed.
- **Latent bug — do NOT port as-is**: the op also calls `Resource.updateMany({ where: { goalId } })`, but `Resource.goalId` was dropped in migration `20260729035108_resources_project_owned` (resources are project-owned since 2026-07-29). Against the real Prisma client this raises `PrismaClientValidationError` (unknown argument `goalId`), so `deleteGoal` likely 500s at runtime — no e2e covers goal deletion. The port should omit the Resource update (resources already follow their project) and the port's tests should cover goal deletion explicitly.
- Note: goal-planning spec §C described deleteProject as lossless re-parenting too; the *implemented* project delete moved to the explicit `taskDisposition` model (see S5). Goals kept the lossless default.

### `reorderGoalProjects` (action) — sequence under a goal (spec §E)
- In: `{ goalId: string; orderedIds: string[] }` → `{ goalId }`.
- Goal must be owned (404). Every id in `orderedIds` must already be linked to this goal: `count({ id: { in: orderedIds }, goalId, userId }) === orderedIds.length` else 400 `"Every project must belong to this goal."` (rejects foreign ids / ids from another goal). Writes `order = index` per id (individual updates, not `updateMany`).

### Ops consumed from other slices
- `getAppData` → `counts.goals` for the FREE `AllowanceChip` (used vs cap 1); `getLogbook` for completed goals + Reopen; `setProjectDone` (from the Logbook) for project reopen; S5's `updateProject({ goalId })` is the link/unlink write.

### DB shape (schema.prisma)
- `Goal { id uuid; name; permalink; description?; isDone Bool = false; createdAt; completedAt?; userId (Cascade); lensId (Cascade); projects Project[]; tasks Task[] /* legacy direct-goal */; @@unique([userId, name]) /* unique goal names per user */; @@unique([userId, permalink]); @@index([userId, createdAt]) }`.
- No `archivedAt` on Goal — done/not-done is the whole lifecycle state; completed goals reappear via Logbook Reopen.
- Related: `Project.goalId String?` (`onDelete: SetNull`) + `Project.order Int @default(0)` (per-goal sequence; standalone projects keep `order = 0` and sort by name); `Task.goalId String?` (legacy, `SetNull`).

## 3. Behaviors

**Goals page (`/do/goals`)**
- Header: eyebrow `Planning`, title `Goals`, description `"{N} active · Outcomes your projects move forward."`; `AllowanceChip` (FREE: used vs cap 1; PRO: none).
- Create: `RecordCreateControl` "New goal" (at cap → upgrade gate `upgradeFeature: "New goal"`, `upgradeReason: "link work to more than one outcome"`). Composer "New goal", subtitle "Name the outcome. Add the why if it helps."; name label `Outcome`, placeholder "Grow audience"; description label `Why this matters`, placeholder "So launches do not depend on one-off posts"; submit "Create goal". Server 402 → `<ProGate feature reason>`, not a raw error.
- Card (`ProgressCard` → `/do/goals/{permalink}`): `progress` % (aggregate across linked projects), meta `"{n} project(s)"` (singular/plural), and a muted **Focus** line with `nextProject.name` — hidden entirely when `nextProject` is null ("never lies"). (Historical naming: spec/WORKFLOW wrote "Next: <name>"; the shipped surface says **"Focus:"** — the e2e asserts `Focus:`.)
- Empty state: `ListEmpty` "No goals yet." / "Goals are active outcomes — what your projects and tasks roll up to. Create one, or link a project/task to a goal during triage."
- Invalidations on create: `getGoals`, `getAppData`.

**Goal detail (`/do/goals/:permalink`)**
- Breadcrumb `Goals › {goal name}` (crumb id IS the destination route).
- Header: eyebrow `Goal`, name; meta `"{doneItems}/{totalItems} done · {progress}%"` **only when `totalItems > 0`** (must match `getGoals`' rollup so the list card and header % agree); `Focus: <link to /do/projects/{permalink}>` line — first non-done project in `[order, name]` sequence; hidden when none/all done.
- Description rendered under the header when present.
- `DetailHeaderActions`: `Edit` (toggles `InlineEntityEditForm` "Refine goal" — subtitle "Keep the outcome clear. The why can stay plain."; fields `Outcome` + `Why this matters`; Save → `updateGoal`; server trims/normalizes empty → null), `Complete`/`Reopen` (fires `setGoalDone` directly — **no confirm dialog**; after completing, navigates `/do/goals` because the goal leaves the active list; Reopen also reachable from the Logbook), `Delete` (danger → confirm).
- Delete confirm (`ConfirmDialog`, danger): with children — `"{N} item(s) will move to standalone in this Lens. The goal itself will be removed."`; without — "This goal will be removed. No items are linked to it."; confirm label "Delete goal"; on success navigates `/do/goals` and invalidates `getGoals`, `getProjects`, `getTasks`, `getLogbook`, `getAppData`.
- **Linked-projects list** (only surface with sequence editing): heading `Projects <count>`; per row: `↑` / `↓` reorder buttons (aria-label `Move {name} up|down`; disabled at the first/last position and while a reorder is in flight; buttons swap adjacent ids client-side then send the **full** `orderedIds` array — `order = index` for each), link to `/do/projects/{permalink}`, muted `Done` chip when `p.isDone`, per-project `{pct}%` (`pTotal > 0` only; done/total of that project's tasks), due chip (`formatRelativeDue`: `today`, `tomorrow`, `Nd overdue`, `in Nd`, else `Mon D`).
- Empty projects: "No supporting projects yet." / "Assign projects to this goal from their Project detail page." (linking is project-side only).
- Not-found/tenancy: `null` → "This goal doesn't exist — or isn't yours." Loading → "Loading…"; error → "Couldn't load this goal."
- **Focus advancement is derived, not written**: completing the focused project automatically promotes the next in sequence on the next read (e2e step 4 asserts this).

**Goal ↔ task rationale (read-side, focus engine)**: Next/Focus resolve a task's goal as `task.project.goal` → legacy `task.goal` → `null`; project goal wins over a conflicting legacy direct goal; one goal shown, never merged (WORKFLOW §2.3, focus-goal-context spec).

**Lens scoping**: goals always belong to exactly one Lens; the list re-scopes with the active lens; the **same-Lens invariant** for project↔goal links is enforced on the project side (S5 `updateProject`/`createProject`/`moveProject`).

## 4. Keyboard

- **No goals-specific keyset exists.** There is no chord for `/do/goals` — Goals is reached via the sidebar "Plan" nav group (Goals item), breadcrumbs, or links from Projects surfaces. `Shift+P` lands on `/do/projects` (the planning chord), not Goals.
- Global shortcuts that apply on both routes (`webapp/src/app/useKeyboardShortcuts.ts`): `⌘K` capture · `⌘\` command palette · `⌘L` lens switcher (chip + popover at ≥4 lenses, `↑↓`/`↵`/`/`/`esc`) · `/` sitewide search · `Space` → `/do` · `Shift+C` capture · `Shift+I/N/T/G/R` → Inbox/Next/Today/triaGe/Review · `?` / `⌘?` cheatsheet · `Esc` closes the topmost overlay.
- Reordering is click-only (`↑`/`↓` buttons) — no drag, no keyboard move.
- Not implemented (documented future model only — do NOT port as keys): INTERACTION.md zoom mode `Z`/`X` through Task→Project→Goal and `Enter` re-anchor at Goal scope (`ZOOM: GOAL`). Implemented navigation is breadcrumbs + links.

## 5. Edge cases + invariants

- **Entitlements**: `FREE_LIMITS.goals = 1` per lens, counted **non-done** (completing frees the slot); message `feature: "a 2nd goal", reason: "link work to more than one outcome with Pro"` → 402. FREE = Me lens only on list/create (`assertLensAllowed`); detail reads unguarded. Lifecycle toggles carry no cap check (hygiene). Cap UI is advisory; the server is the boundary.
- **Name uniqueness**: `@@unique([userId, name])` — goal names are unique per user (unlike projects); rename collision → 409 `You already have a goal named "X".`. Names trimmed; empty rejected.
- **Same-Lens invariant** (spec §F, non-negotiable): a goal and its project must share a Lens; enforced on the project-side writes (S5); cross-lens re-link rejected 400.
- **Tenancy**: every op filters by `userId`; wrong owner reads as 404/not-found.
- **Progress honesty**: `Math.round` percentage; `0` with zero projects; Focus line absent with no projects or all-done (no fabricated content). Completing a goal never touches children; completing the focused project advances Focus automatically (derived).
- **Sequence**: `Project.order` is per-goal; new linked projects seed at the end (`order = count under goal, including done` — S5 core); standalone projects sort by name; the projects *list* page stays alphabetical (sequence is a goal-scoped concept, spec §E).
- **Delete semantics**: lossless — children re-parent to standalone in the same Lens (`goalId = null`), nothing destroyed; `reparentedCount` returned for confirm copy. (See the `Resource.goalId` latent-bug note in §2 — do not port.)
- **Idempotency**: `setGoalDone` no-ops when already in the requested state.
- **Reorder guards**: goal must be owned; the id set must exactly equal the goal's linked projects (foreign ids → 400); full-array writes make it idempotent.
- **Logbook integration** (spec §D): completed goals are lens-scoped rows (`kind: "goal"`, teal Goal chip) with Reopen; the e2e scopes the row via the chip to avoid matching a linked project's parent-goal chip beside it.

## 6. Tests

### e2e — `webapp/e2e/goal-planning.spec.ts` (1 chained case, 90s timeout, "goal → link projects → complete → focus advances → logbook → reopen")
1. Create goal from `/do/goals` ("New goal" → fill placeholder "Grow audience" with "Run a 10k" → "Create goal"; waits on `/operations/create-goal`); goal name appears as a card link. (Seeded sample task cleared first via `completeTopTask`.)
2. Create two projects via triage ("Couch to 5k", "Bridge to 10k"), then link each from the **project** detail page ("Link a goal" → `.aa-project__relink-opt` option "Run a 10k"); the link surfaces as the goal name with an "Edit goal" affordance.
3. Open the goal: both projects listed under `.aa-goal__projects`; `Focus:` names the first non-done project.
4. Complete the focused project from its detail header ("Complete"); back on the goal, `Focus:` advances to the other project.
5. Complete the goal ("Complete") → redirects to `/do/goals`; the goal link is gone from the active list.
6. The Logbook shows the goal — row scoped by the teal `Goal` kind chip (to distinguish it from the linked project's parent-goal chip).
7. "Reopen" from the Logbook (waits `/operations/set-goal-done`); the goal row leaves the Logbook and the goal is visible again on `/do/goals`.

### Unit (parity signal, `webapp/src/goals/operations.test.ts` + `GoalDetailPage.test.tsx`)
- Ops: getGoals lens-scoping, aggregate progress, progress-0 + nextProject-null with no projects, rounding, nextProject-null when all done; createGoal trim + optional description; setGoalDone tenancy, stamp/clear, idempotency; updateGoal 404, empty name, trimmed description (empty→null), P2002→409; deleteGoal re-parents projects + tasks then deletes (does not destroy children); reorderGoalProjects tenancy + foreign-id rejection.
- Page: Complete-vs-Reopen labeling; Complete fires `setGoalDone({ isDone: true })`; inline edit fires `updateGoal`; delete dialog copy states the re-parenting outcome (N children) and fires `deleteGoal`; Focus line shows first non-done project as a link, hidden when all done / no projects; reorder up-button fires `reorderGoalProjects` with the swapped full order, boundary buttons disabled; **no project/task creation controls on the goal page**; breadcrumb renders `Goals` crumb (→ `/do/goals`) + active goal crumb.

---
*Do not edit `webapp/` from this slice. This header is the parity checklist for the oRPC contract port (`packages/contract/src/s6-goals/`).*
