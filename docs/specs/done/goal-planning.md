---
feature: goal-planning
status: done
shipped: 2026-07-05
spec_owner: discover
build_owner: build
---

# Feature: Goal planning & Project alignment

> Catalog: `docs/features/goal-planning.md`. Status drives the loop — Build
> pulls `ready`, Discover reads `reviews/goal-planning.md` when it flips to
> `review`.

## Summary

The Planning area today is **read-mostly**. You can create Goals and Projects
and read their roll-ups, but you cannot complete, reopen, edit, delete, or
re-link them, and you cannot start a Project from inside a Goal. The
`isDone`/`completedAt` columns on `Goal` and `Project` are write-only by hand —
the Logbook queries `isDone=true` projects but no UI ever sets the flag. This
spec closes the lifecycle + alignment holes and adds one lightweight planning
affordance: an explicit **sequence** of Projects under a Goal, with the first
one surfaced as "the next project toward this goal."

It is **structural completion of an already-shipped surface**, not a new area.
No new routes, no new modes, no new top-level entities. It does not touch the
`getTopTask` matcher (independent of `focus-engine-v2`).

## Why

**The problem.** A user who plans in ActionAmp hits a wall the moment they want
to *change* a plan: finishing a goal, renaming it, moving a project to a
different goal, or deleting one. The only way to reshape the hierarchy today is
to recreate entities through triage. That makes Planning feel like a snapshot,
not a workspace — which undercuts the "GTD+PARA structure at scale" leg of the
differentiation named in `ROADMAP.md §"The threat the docs under-price."`

**Who has it.** Anyone who adopts the hierarchy at all — and the matcher/data
suggest that's the user most likely to value the structure depth that justifies
the $79.50 price.

**Evidence it's real (in-repo, not vibes):**
- `grep updateProject|updateGoal|completeProject|completeGoal|deleteProject|deleteGoal` → **zero matches** anywhere in `webapp/src`.
- `Project.isDone`/`completedAt` and `Goal.isDone`/`completedAt` exist on the model and are read by `getLogbook` and `getGoals`, but **no UI action writes them**.
- `ProjectDetailPage` and `GoalDetailPage` headers have no Done/Edit/Delete control — only "Add task."
- The only supported `goalId` assignment path for active work is Project →
  Goal. Triage can align a new Project to a Goal; Tasks do not align directly
  to Goals.
- The docs already promise this and we owe it: PAGES.md **D2** ("Edit/delete Goal"), **P7** ("Create/edit Goal inline"), **D1** (Project header shows "parent Goal" — implies it's editable).

**Scope fork, resolved with the user (2026-07-03):** "CRUD + intent/sequencing" —
close the lifecycle/alignment holes AND add the project-sequence affordance. Not
the full planning canvas. Done semantics = explicit + user-driven, not derived.

**Priority fork, resolved with the user (2026-07-03):** same tier as
`resources-project-owned` and `breadcrumb-nav` — the "Then" tier, gated on
≥1 paying non-founder user. This is depth/polish on a shipped surface, not
validation-critical; it sits behind the gauntlet (observability, retention,
matcher, command-palette).

## Done-conditions

> Predicates a judge can verify against reality. Grouped for readability; all
> must pass. Build is free to split these across multiple commits, but the spec
> is not `done` until every box is checked.
>
> **Implementation guide (2026-07-04).** This feature is large enough that Build
> should not try to land it as one amorphous "planning" pass. Pull it in the
> slices below, in order. Each slice should leave the app coherent, even though
> the overall spec only flips `done` after all slices land.

### Slice 1 — Lifecycle becomes real

**Goal:** Goals and Projects can be explicitly completed and reopened, and
completed Goals show up in the Logbook. This is the smallest slice that fixes
the worst "barely done" feeling: the models already have `isDone` and
`completedAt`, but the app cannot write or restore them.

Build:
- `setGoalDone({ id, isDone })`
- `setProjectDone({ id, isDone })`
- `getLogbook` goal rows
- Logbook `Reopen` controls for completed Goals and Projects
- Header actions on Goal/Project detail: `Complete` when active, `Reopen` when
  completed

Verification:
- Operation tests for done/reopen timestamps and tenancy.
- Logbook test for the new `kind: "goal"` rows.
- UI smoke/e2e: complete Goal → appears in Logbook → reopen → appears in Goals.

Do **not** include edit/delete/relink/order in this slice.

### Slice 2 — Plans become mutable

**Goal:** A user can correct and reshape the Goal → Project hierarchy after
creation without recreating work through triage.

Build:
- `updateGoal({ id, name?, description? })`
- `updateProject({ id, name?, description?, goalId?, dueDate? })`
- Inline edit affordances on Goal and Project detail headers
- Project parent Goal picker with unlink support
- `deleteGoal({ id })` with lossless re-parenting of child Projects and
  standalone Tasks
- `deleteProject({ id })` with lossless re-parenting of child Tasks
- Confirm sheets that state exactly what will move

Verification:
- Operation tests for empty names, duplicate-name errors where practical,
  tenancy, same-Lens re-link rejection, and delete-with-children re-parenting.
- UI smoke/e2e: relink a Project to another Goal; delete a Project and confirm
  its Tasks still exist as standalone.

Do **not** include project ordering in this slice.

### Slice 3 — Goal pages become planning surfaces

**Goal:** A Goal detail page is no longer just a roll-up. It can start and
sequence the Projects that make the Goal real.

Build:
- Add Project from inside a Goal (`createProject` with the Goal's `lensId` and
  `goalId`)
- `Project.order Int @default(0)` if the model still lacks it
- `reorderGoalProjects({ goalId, orderedIds })`
- Goal detail linked-projects list ordered by `order`, with quiet up/down
  controls
- "Next: <project name>" line on Goal cards and Goal detail header, using the
  first non-done Project by sequence

Verification:
- Migration if `Project.order` is added.
- Operation tests for reorder ownership/same-goal validation.
- E2E: add two Projects from a Goal, reorder, complete first Project, see the
  next line advance.

### Slice 4 — Task filing closes the loop

**Goal:** Existing standalone tasks can be moved between unlinked, Goal-owned,
and Project-owned states.

Build:
- Extend or add task update operation for `goalId` / `projectId` filing
- Same-Lens invariant across Task, Goal, and Project
- Minimal task-detail filing UI, or the smallest existing surface that can
  expose the move without creating a new route

Verification:
- Operation tests for same-Lens rejection and mutual exclusivity of
  `projectId`/`goalId`.
- UI smoke/e2e: move a standalone Goal task into a Project and confirm it leaves
  the Goal standalone list and appears on Project detail.

This is last because the app is still materially better after Slices 1–3, while
task filing touches the separate Task detail surface.

### A. Goal & Project lifecycle (server ops)

- [ ] An authenticated operation `setGoalDone({ id, isDone })` exists. When
      `isDone=true`: sets `Goal.isDone=true`, stamps `Goal.completedAt=now()`,
      returns `{ id }`. When `isDone=false`: clears both. Tenancy-safe
      (`userId` guard). Errors on unknown id. *(Mirror the
      `toggleTaskDone` pattern in `tasks/operations.ts:103–112`.)*
- [ ] An authenticated operation `setProjectDone({ id, isDone })` exists with
      the same shape against `Project`.
- [ ] Neither op is plan-gated. Completing/reopening are **hygiene**, not power
      features — `assertLensAllowed` is the only entitlement call, and only to
      keep the existing FREE-Work-lens invariant honest on the read-back path
      (no cap check on a lifecycle toggle).
- [ ] `getGoals` (`goals/operations.ts`) still filters `isDone: false` and its
      roll-up is project-only — a completed goal simply stops appearing in
      the active list.
- [ ] `getProjects` filters `isDone: false` and is likewise unchanged.

### B. Goal & Project lifecycle (UI)

- [ ] `GoalDetailPage` header has a **Complete goal** action (call
      `setGoalDone`), and after completion the goal is no longer in the
      `/do/goals` list and appears in `/do/logbook`.
- [ ] `ProjectDetailPage` header has a **Complete project** action with the
      same end-to-end behavior (disappears from `/do/projects`, appears in
      Logbook).
- [ ] Both headers expose **Reopen** when the entity is already done
      (reachable via Logbook; see §D).
- [ ] Completing a Goal does **not** auto-complete or archive its child
      Projects (explicit non-goal — see below). Children are left
      exactly as they are.

### C. Edit + Delete + Re-link

- [ ] An operation `updateGoal({ id, name?, description? })` exists. `name`
      is trimmed and rejected if empty or if it duplicates another
      `Goal` name for this user (`@@unique([userId, name])` constraint).
      `description` may be set to `null`.
- [ ] An operation `updateProject({ id, name?, description?, goalId?, dueDate? })`
      exists with the same name-uniqueness rule against `Project`.
      `goalId` may be set to a different goal **in the same Lens**, set to
      `null` (unlinked), or left unchanged. **Cross-Lens re-link is rejected**
      with a clear error (a goal and its project must share a Lens — structural
      invariant; see DATA-MODEL comment at `schema.prisma:14–22`).
- [ ] `GoalDetailPage` and `ProjectDetailPage` headers allow inline edit of
      name + description (an edit affordance, not a separate route).
- [ ] **Re-link UI:** `ProjectDetailPage` shows the current parent Goal and
      lets the user change it (or unlink) via an existing-picker-style control.
      Goal options are limited to the project's own Lens.
- [ ] **Move task between projects:** Tasks can move between Projects or
      standalone within the same Lens. They do not align directly to Goals.
- [ ] **Delete (lossless default):** `deleteGoal({ id })` re-parents its child
      Projects to `goalId=null` (same Lens), then deletes the Goal. It also
      clears any legacy direct-goal Tasks. `deleteProject({ id })` re-parents
      child Tasks to `projectId=null` (same Lens), then deletes the Project.
      Neither destroys Tasks or Resources.
- [ ] Delete is gated behind an explicit confirm whose copy states the
      re-parenting outcome ("N tasks will move to standalone in this Lens") —
      no surprise data movement.

### D. Logbook integration (Goal completion visible + restorable)

- [ ] `getLogbook` (`logbook/operations.ts`) returns completed **Goals** as a
      fourth `kind: "goal"` row type, with `{ id, title, completedAt, goal:
      null }`, lens-scoped like tasks/projects.
- [ ] `LogbookPage` renders completed Goals with a distinct affordance (e.g.
      a violet "Goal" chip, mirroring the existing "Project" chip) and a
      **Reopen** action that calls `setGoalDone({ id, isDone: false })`.
- [ ] Completed Projects already appear in the Logbook by query; this spec
      adds the matching **Reopen** affordance there for projects too.

### E. Project sequence under a Goal

- [ ] `Project` gains an ordering field. **Preferred: reuse the existing
      `order: Int @default(0)`** already present on `Task` (schema line ~190)
      rather than adding a new column — verify `Project` lacks one first; if
      it lacks one, add `order Int @default(0)` to `Project` and migrate.
      The ordering is **per-Goal** (projects with no goal sort by name as
      today; projects with a goal sort by `order` then name).
- [ ] `getGoal` returns a project's `order`; `getProjects` returns `order`
      and the Projects list honors it when the projects are grouped under a
      goal (the projects *list* page can remain alphabetical — sequence is a
      Goal-scoped concept).
- [ ] **Reorder UI:** on `GoalDetailPage`, the linked-projects list has
      up/down (or drag) reordering that calls an operation
      `reorderGoalProjects({ goalId, orderedIds })` which writes `order = index`
      for each id, tenancy-checked. Rejects ids not belonging to this goal.
- [ ] **"Next project" surfacing:** the first non-done project in the goal's
      sequence is shown as a single line on (a) the goal card on
      `/do/goals` ("Next: <project name>") and (b) the `GoalDetailPage`
      header. When all projects under the goal are done or there are none,
      the line is absent (no fabricated content — the "never lies" rule from
      `focus-why-transparent`).
- [ ] Completing the "next" project promotes the next one in sequence
      automatically (no user action required beyond completing the project).

### F. Invariants & guards (non-negotiable)

- [ ] **Same-Lens invariant:** a Goal and its Project must share a Lens; no
      op in this spec can break it. Re-link across Lenses is rejected.
- [ ] **Tenancy:** every new op filters/updates by `userId === context.user.id`.
- [ ] **No matcher impact:** `getTopTask` query shape is unchanged (diff it).
      Sequence/order is a Planning concern; the focus engine ignores it.
- [ ] **Calm UI rules (AGENTS.md):** new controls are quiet (ghost/secondary
      variants), no new accent colors, no streaks/badges. The "Next:" line is
      a single muted line, not a banner.
- [ ] No new top-level route in `main.wasp.ts`; only new `action`s/`query`ies
      registered for the new ops.

### G. Tests

- [ ] Unit tests for each new op covering: happy path, tenancy (wrong-user →
      throws), cross-Lens re-link → throws, name-duplicate → throws,
      delete-with-children re-parents correctly (assert child `goalId`/`projectId`
      became null, child still exists, same Lens).
- [ ] Component/integration: completing a goal removes it from the list and
      shows in the Logbook; reopening restores it; re-link updates the parent
      label on `ProjectDetailPage`; reorder persists across reload.
- [ ] At least one Playwright e2e: create goal → add project from goal page →
      reorder → complete project → see "next" line advance → complete goal →
      appears in Logbook → reopen. Existing e2e suite stays green.

## Non-goals

- **No goal-to-goal dependencies.** A Goal does not link to another Goal.
- **No derived "done."** Goal/Project done is explicit, user-driven. We do not
  auto-complete a goal when its children are all done (real users "call it"
  over unfinished children all the time — that's the whole point).
- **No child archiving on goal completion.** Completing a goal leaves children
  in place. Archiving is the existing triage pattern; we don't conflate them.
- **No bulk operations.** F7 (bulk clarify) stays deferred.
- **No AI goal breakdown.** The `cli` goal-breakdown skill is a separate lane.
- **No new top-level route, nav entry, or mode.** Pure Planning-area work.
- **No drag-between-horizons.** That belongs to the `work-area-merged` lane.
- **No plan-gating on the new ops** (other than the existing FREE-Work-lens
  read invariant). Charging for "rename a project" would be hostile.

## Open questions

- _(none — forks resolved 2026-07-03; deferred decisions marked inline above.)_

  Build's discretion items (no Discover input needed):
  - The exact edit affordance (inline-edit vs. modal) — match whichever the
    codebase already uses for task description editing.
  - Whether `updateTask` is a new op or an extension of the existing task
    mutation path — Build knows that surface best.
  - Whether to add a `Project.order` column or reuse an existing one — verify
    against `schema.prisma` first; pick the smaller migration.

## Prototypes

- _(none — no throwaway prototype needed. The pages this touches already
  exist; the work is ops + header controls + one reorderable list, all
  verifiable against the live app. If Build wants a mockup of the goal-header
  layout before implementing, request one and Discover will produce it in a
  disposable worktree per the duet protocol.)_
