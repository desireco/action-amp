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
- **List** (`/app/goals`, `goals/GoalsPage.tsx`) — card grid; aggregate project
  progress, project count, current Focus project. Inline create.
- **Detail** (`/app/goals/:permalink`, `goals/GoalDetailPage.tsx`) — header
  shows aggregate progress and the current Focus project; lists linked Projects
  (each → project detail). Goals do not create or own Tasks directly.

**Progress roll-up formula** (in both `getGoals` and the detail page): each
project counts as a single binary unit (done/not-done). Project-internal tasks
are not counted directly at the Goal layer.

**Files.** `goals/GoalsPage.tsx`; `goals/GoalDetailPage.tsx`; `getGoal` op.

**Done?** Shipped (Goal detail under friction-cleanup, done 2026-07-02).
