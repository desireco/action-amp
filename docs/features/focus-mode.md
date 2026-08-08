---
slug: focus-mode
title: "Focus mode (single-task surface)"
feature_area: focus
status: shipped
spec: —
verified: 2026-08-07
---

# Focus mode

**What.** Dedicated single-task route `/app/focus` (`FocusRoute`,
`main.wasp.ts:108`), entered from Next's one-tap "Start" or from any task row.
Hides the sidebar; no counts, no list — just the one task. Esc exits.

**Revised 2026-08-07 (centered focus session).** The focus screen:

- **Centered countdown ring** — one 25- or 45-minute Pomodoro control replaces
  both the detached margin clock and ambiguous completion circle. The ring owns
  time and pause/resume only.
- **Explicit Task actions** — Add note, Pause, and Complete task sit together
  below the title and clarification. Completion no longer hides behind a circle.
- **One inline composer** — the notes thread is always visible; the composer
  appears on demand rather than permanently. Add note opens a progress prompt.
  Complete opens the same notes-area surface with a leading **How did it go?**
  question and optional Outcome. **Keep working** dismisses it; **Complete
  task** finishes without a modal or backdrop. Completion writes a `TaskUpdate`
  with `kind=COMPLETED`.
- **Recorded sessions** — start stores `plannedMinutes`; countdown completion
  closes the row with `completed=true`; manual pause closes it incomplete. A
  completed focus session never completes the Task. Completed sessions appear
  as a small timer symbol and count inside the ring, scoped to the current Task.
- **Dedicated route** (replaces the old overlay invocation) — `NextPage`
  and `ProjectDetailPage` `navigate("/app/focus")` into it.

**Related.** Task notes thread + completion log: see
`features/task-notes-completion-log.md`.

**Files.** `app/FocusRoute.tsx`, `app/FocusMode.tsx`; segment accounting in
`tasks/operations.ts` (`startTask`/`pauseTask`/`toggleTaskDone`).

**Done?** Shipped. Focus timer and explicit action hierarchy are live; broader
hard-mode work remains separate.
