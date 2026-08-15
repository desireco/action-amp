---
slug: projects
title: "Projects (list + detail, inline create, progress roll-up, Resources)"
feature_area: planning
status: shipped
spec: —
verified: 2026-07-29
---

# Projects

**What.** Multi-step outcomes, always in a Lens, may sit under a Goal.
- **List** (`/do/projects`, `projects/ProjectsPage.tsx`) — active projects are
  grouped by Goal (or "Standalone") with progress, due date, and a next-action
  preview; completed projects remain in a separate Completed section until they
  are archived or deleted. Inline create (`CreateInline`).
- **Detail** (`/do/projects/:id`, `projects/ProjectDetailPage.tsx`) — tasks
  grouped by horizon (Today/Upcoming/Someday/Done), inline "Add task" (creates
  with the project's `lensId`), horizon move buttons, and a Resources review
  section for project links and notes (open, add, edit, remove). Complete and
  archive require confirmation; archive also completes the project. Deleting a project with actions lets the user
  remove them, move them to another active project, or send them to Triage.

**Files.** `projects/ProjectsPage.tsx`; `projects/ProjectDetailPage.tsx`.

**Done?** Shipped. Convert-Task→Project / XL path still open (FEATURES F9c).
