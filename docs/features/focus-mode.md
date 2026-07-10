---
slug: focus-mode
title: "Focus mode (single-task surface)"
feature_area: focus
status: shipped
spec: —
verified: 2026-07-05
---

# Focus mode

**What.** Dedicated single-task route `/app/focus` (`FocusRoute`,
`main.wasp.ts:108`), entered from Next's one-tap "Start" or from any task row.
Hides the sidebar; no counts, no list — just the one task. Esc exits.

**Shipped 2026-07-05 (Variant F).** The redesigned focus screen:
- **Two-number margin clock** — live session timer + honest total (the
  cumulative time across pause/resume segments, sourced from the
  `TaskSession` model — see `task-notes-completion-log`).
- **Summoned composer** — the notes thread is always visible; the composer
  appears on demand rather than permanently.
- **Confirm-on-complete** — the Done button was renamed to "Complete" and
  now asks for confirmation; completion writes a `TaskUpdate` with
  `kind=COMPLETED`.
- **Session accounting** — start/pause/complete maintain `TaskSession` rows
  (`schema.prisma:311`) so the clock total is honest across interruptions.
- **Dedicated route** (replaces the old overlay invocation) — `NextPage`
  and `ProjectDetailPage` `navigate("/app/focus")` into it.

**Related.** Task notes thread + completion log: see
`features/task-notes-completion-log.md`.

**Files.** `app/FocusRoute.tsx`, `app/FocusMode.tsx`; segment accounting in
`tasks/operations.ts` (`startTask`/`pauseTask`/`toggleTaskDone`).

**Done?** Shipped for the Variant F scope. Pomodoro / hard full-screen modes
remain Phase 2 (Icebox).
