---
feature: friction-cleanup
status: building
spec_owner: discover
build_owner: build
---

# Feature: Friction cleanup (small honest gaps)

## Summary

Close the small, independent inconsistencies between what the canonical docs
say and what the app does, and finish the half-built list surfaces. None of
these is a feature on its own; together they remove the "this feels
unfinished" friction a careful first user notices. Each item is independently
shippable — Build can land them as separate commits.

## Why

ROADMAP.md §0 (honest state) and WORKFLOW.md §5.1 flag several decided-but-
undone items. A first user who opens the app today sees: a dead `/app/upcoming`
route, Projects/Goals with no detail view (lists only), a Today page whose
"Done today" section is a literal `TODO` comment (`TodayPage.tsx:200`), and
Someday rows with no promote action. These aren't blockers, but they're the
texture of "beta." Cleaning them is cheap and compounds the first-run-experience
fix — the product stops feeling like a prototype.

## Done-conditions

Each bullet is independently verifiable. Build may ship them in any order /
any number of commits; the spec is `done` only when all pass.

- [ ] **The `/app/upcoming` route is removed.** Per WORKFLOW.md §5.1 (decided
      2026-06-23, never done): remove the `UpcomingRoute` from `main.wasp.ts`
      and the Upcoming nav entry. **Keep** `getTasks`'s ability to query
      `status=UPCOMING` (the Today "See upcoming" toggle reuses it). The
      `UpcomingPage.tsx` file can stay or be deleted — Build's call; just no
      route to it.
- [ ] **Someday rows have a promote action.** `SomedayPage.tsx` currently has
      no row actions (`IMPLEMENTATION-CHECKLIST` 4.3 ⬜). Each row gets a
      "→ Today" affordance (reuses `updateTaskStatus`) — same control as the
      Today bench promote. No "→ Upcoming" needed (Upcoming is reached via
      snooze, not Someday).
- [ ] **The "Done today" section on Today is built.** `TodayPage.tsx:200` is a
      `TODO` rendering nothing. Implement it: query tasks with `isDone=true`
      completed today, render in a collapsed "Done today (N)" section at the
      bottom (collapsed by default per the mockups). Reuse `GroupedList` +
      `TaskRow` (muted). The stub `doneGroups` memo (currently `[]`) becomes
      a real query.
- [ ] **Project detail view exists.** A `/app/projects/:id` route (or an
      in-place anchor view per WORKFLOW.md) showing the project's task list,
      progress, and next-action — Layout 1 from `docs/mockups/project-anchor-
      layouts.html`. Minimal v1: project header + full open-task list +
      "Add task" (reuses task create). No subtask/timeline depth yet.
- [ ] **Goal detail view exists.** A `/app/goals/:id` route: goal header,
      linked projects, standalone tasks under it, aggregate progress. Minimal
      v1 — same component shape as Project detail, scoped to a Goal.
- [ ] **Breadcrumbs navigate (not just zoom).** Per BACKLOG.md's BUILD
      REQUIREMENT (2026-06-16): clicking an ancestor crumb re-anchors the view
      at that scope (navigates INTO the Goal/Project), per the universal web
      convention. Today `Breadcrumb.tsx` renders crumbs but they may not
      navigate — verify and wire if missing.
- [ ] **`wasp compile` passes.** Existing e2e suite still green (the Upcoming
      route removal may require updating `e2e/today.spec.ts` if it navigates
      there directly — check and fix).
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No drag-to-reorder** on Today/Someday (Phase 2 per IMPLEMENTATION-CHECKLIST).
- **No mobile triage swipes** (`e2e` 3.2 ⬜) — that's gesture work, separate.
- **No Convert-Task→Project** XL path (F9c) — separate, larger spec.
- **No subtasks UI** (F15) — schema supports it (`TaskUpdate`) but no UI; defer.
- **No Reports/Review-mode screen** (WORKFLOW §2.5, "least-built area") — that
  is net-new and gets its own spec; not part of "cleanup."
- **No redesign of list visuals.** Reuse existing `TaskRow`/`GroupedList`.

## Open questions

- **Project detail as route vs in-place anchor.** WORKFLOW.md / BACKLOG.md
  describe an "Open →" re-anchoring model (the project becomes the view's
  scope) rather than a separate route. Build: the simplest correct thing is a
  route (`/app/projects/:id`) that reuses the existing list components;
  discover's lean is route-first for v1 (URL-addressable, shareable, simpler
  back button), with the zoom/anchor model as a later interaction refinement.
  Pick the simpler one; note it in the review.
  **UPDATE 2026-06-27:** a route-based `ProjectDetailPage` +
  `/app/projects/:id` already exists on the unmerged `fix/what-now-surfaces-
  triaged-tasks` branch, with its own e2e. When that branch merges, this item
  is done — adopt its implementation and drop the open question. The Goal
  detail view is NOT on that branch and still needs building.

## Branch overlap (2026-06-27)

The unmerged `fix/what-now-surfaces-triaged-tasks` branch already implements:
- ✅ **Project detail view** (`ProjectDetailPage.tsx` + `/app/projects/:id`
  route + `e2e/project-detail.spec.ts`) — satisfies this spec's 4th done-condition.
- ❓ **What Now surfacing triaged tasks** — reworks `WhatNowPage.tsx`; not in
  this spec but coordinate if this spec's "Done today" change touches the same file.

Still owed by this spec (not on that branch): drop `/upcoming` route, Someday
promote action, "Done today" section, Goal detail view, breadcrumb navigation.
Re-verify the done-condition list against main after that branch merges.

## Prototypes

- Project detail layout: `docs/mockups/project-anchor-layouts.html` (Layout 1).
  Use as reference for composition, not pixel match.
