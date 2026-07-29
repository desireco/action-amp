---
slug: projects
title: "Projects (list + detail, inline create, progress roll-up)"
feature_area: planning
status: shipped
spec: —
verified: 2026-07-03
---

# Projects

**What.** Multi-step outcomes, always in a Lens, may sit under a Goal.
- **List** (`/app/projects`, `projects/ProjectsPage.tsx`) — grouped by Goal (or
  "Standalone"); each row shows progress bar (done/total), due date, next-action
  preview. Inline create (`CreateInline`).
- **Detail** (`/app/projects/:id`, `projects/ProjectDetailPage.tsx`) — tasks
  grouped by horizon (Today/Upcoming/Someday/Done), inline "Add task" (creates
  with the project's `lensId`), horizon move buttons, and a Resources review
  section for project links and notes (open, add, edit, remove).

**Files.** `projects/ProjectsPage.tsx`; `projects/ProjectDetailPage.tsx`.

**Done?** Shipped. Convert-Task→Project / XL path still open (FEATURES F9c).
