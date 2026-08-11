---
slug: focus-mode
title: "Focus mode (single-task surface)"
feature_area: focus
status: shipped
spec: —
verified: 2026-08-10
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

**Added 2026-08-10 (Goal rationale — focus-goal-context spec).** Focus shows a
quiet **Goal rationale** block directly below the Task title and above the
editable Task details, in the existing centered column. Resolution:
`task.project.goal` → legacy `task.goal` → none. With a described Goal it
renders `Why does this matter?` / the trimmed description / `Goal · <name>`
(quiet violet — the Project/Goal identity hue). With a description-less Goal it
renders `Why does this matter?` / `Toward <Goal name>.` (no duplicate
attribution). With no Goal it renders nothing. The block is passive: no card,
icon, link, disclosure, animation, badge, or action. Focus **does not repeat**
the matcher "why now" rationale or the paused-work continuity summary — its
timer and activity thread already provide live and historical execution
context. Normalized by the shared pure `app/taskContext.ts` (`resolveGoal`);
mapped by `app/focusTaskView.ts` (`toFocusTask.goalContext`).

**Related.** Task notes thread + completion log: see
`features/task-notes-completion-log.md`.

**Files.** `app/FocusPage.tsx`, `components/ui/FocusMode.tsx`; Goal mapping in
`app/focusTaskView.ts`; pure normalization in `app/taskContext.ts`; segment
accounting in `tasks/operations.ts` (`startTask`/`pauseTask`/`toggleTaskDone`).

**Verified 2026-08-10.** `app/focusTaskView.test.ts` (Goal precedence +
trimming), `components/ui/FocusMode.test.tsx` (described / Toward fallback /
absent states; matcher rationale + continuity not repeated), `wasp compile`.

**Done?** Shipped. Focus timer and explicit action hierarchy are live; broader
hard-mode work remains separate.
