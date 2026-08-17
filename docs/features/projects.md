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
section for project links and notes (open, add, edit, remove). Captured
images carried onto the project by triage (`ProjectAttachment`, 2026-08-16)
render as display-only thumbs under the header — same thumbs + lightbox as
the task detail page, bytes served by the owner-gated `/api/attachments/:id`.
**Task media on this page** (2026-08-17): the **Next-step hero** leads with a
square cover of the first image (`AttachmentCover`, +N badge when more
follow); grouped task rows show small leading thumbs (`AttachmentThumbs`
`xs`, 28px) in front of the title — clickable to the shared lightbox, outside
the row's clickable region so the click opens the image, not the task menu
(`TaskRow`'s new `leading` slot).Complete and
archive require confirmation; archive also completes the project. Deleting a project with actions lets the user
remove them, move them to another active project, or send them to Triage.
Projects can also move to another Life-area Lens; their actions and history
move with them and their prior Goal link is cleared.

**Files.** `projects/ProjectsPage.tsx`; `projects/ProjectDetailPage.tsx`.

**Done?** Shipped. Convert-Task→Project / XL path still open (FEATURES F9c).
