---
slug: goals
title: "Goals (list + detail, aggregate progress)"
feature_area: planning
status: shipped
spec: friction-cleanup.md        # done — Goal detail
verified: 2026-07-03
---

# Goals

**What.** The organizing layer (active outcomes, replaces PARA "Areas").
- **List** (`/app/goals`, `goals/GoalsPage.tsx`) — card grid; aggregate progress
  %, project count, task count. Inline create.
- **Detail** (`/app/goals/:id`, `goals/GoalDetailPage.tsx`) — header shows
  aggregate progress, lists linked Projects (each → project detail), standalone
  tasks grouped by horizon, inline task create (`createTask` takes `goalId`).

**Progress roll-up formula** (in both `getGoals` and the detail page): each
project counts as a single binary unit (done/not-done) + each standalone task as
a unit; project-internal tasks are **not** counted (avoids double-count).

**Files.** `goals/GoalsPage.tsx`; `goals/GoalDetailPage.tsx`; `getGoal` op.

**Done?** Shipped (Goal detail under friction-cleanup, done 2026-07-02).
