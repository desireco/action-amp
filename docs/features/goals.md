---
slug: goals
title: "Goals (list + detail, aggregate progress)"
feature_area: planning
status: shipped
spec: goal-planning.md           # done — lifecycle + alignment
verified: 2026-09-18
---

# Goals

**What.** The organizing layer (active outcomes, replaces PARA "Areas").
- **List** (`/goals`, `web/src/lib/components/goals/GoalsView.svelte`) — card
  grid; aggregate project progress, project count, current Focus project.
  Inline create; FREE cap (1 active goal per lens) renders the Pro gate.
  Goal cards carry their own soft-round radius (`--aa-radius-goal`, ≈25% of
  the card height) — shape as identity, separating outcomes from projects.
- **Detail** (`/goals/:permalink`, `GoalDetailView.svelte`) — header shows
  aggregate progress and the current Focus project; lists linked Projects
  (each → project detail) with ↑/↓ sequence editing; inline edit; Complete /
  Reopen; lossless Delete (children re-parent to standalone). Completed
  goals surface in the Logbook with Reopen.
- **Mobile (2026-09-18)** — full lifecycle on a phone: the dock's Plan item
  opens a section menu (Upcoming / Projects / Goals / Someday), both goals
  surfaces are responsive, and project→goal linking uses a PickerSheet on
  every viewport. Spec: `docs/specs/mobile-goal-management.md`.

**Progress roll-up formula** (list cards and detail header agree): each
project counts as a single binary unit (done/not-done). Project-internal
tasks are not counted directly at the Goal layer.

**Linking is project-side** — a Project declares its goal (same-Lens
invariant); the goal surface never creates or claims projects. Tasks link
to goals only as legacy data; `Task.goalId` is not a goal-management
surface.

**Files.** `web/src/lib/components/goals/` (GoalsView, GoalDetailView);
`web/src/lib/stores/goals.svelte.ts`; `packages/domain/src/goals/`;
`packages/contract/src/goals.ts`; e2e `web/e2e/goal-planning.spec.ts`.

**Done?** Shipped (goal lifecycle under goal-planning, done 2026-07-05;
mobile end-to-end under mobile-goal-management, 2026-09-18).
