---
slug: task-notes-completion-log
title: "Task notes and completion log"
feature_area: focus
status: shipped
spec: task-notes-completion-log.md
verified: 2026-07-05
---

# Task notes and completion log

**Shipped 2026-07-05.** A task carries an append-only notes/activity thread
backed by `TaskUpdate`, and completing a task from Focus writes a typed
completion event into the same thread.

**Today.**
- `TaskUpdate` has a `kind` discriminator (`TaskUpdateKind = NOTE | COMPLETED`,
  `schema.prisma`); default `NOTE`.
- Server ops in `tasks/operations.ts` write notes and the completion event;
  the existing `Task.completedAt` is preserved for Today/Review reads.
- Focus mode (`/app/focus`) renders the notes thread + summoned composer, and
  asks for an optional completion note on Done (confirm-on-complete).
- Notes can also be captured during triage and edited from task rows — same
  writer, same model.
- This is the focused slice extracted from the broader `work-area-merged.md`
  spec; route merging, NOT_DOING, and task archive remain out of scope.

**Spec.** `docs/specs/task-notes-completion-log.md` — `done`.

**Why it matters.** Before this, `TaskUpdate` existed in the schema but no
operation ever created a note and no UI rendered the thread — a task was a
title plus a checkbox. The thread + typed completion event make focus-mode
work legible (what you did, how it went) without dragging in the full Work
Area merge, and they unblock the v2 activity review in
`weekly-monthly-review`.
