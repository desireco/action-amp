---
slug: upcoming-someday
title: "Upcoming + Someday (bench + maybe-later)"
feature_area: focus
status: shipped
spec: —
verified: 2026-07-10
---

# Upcoming + Someday

**Upcoming** (`/do/upcoming`, `lists/UpcomingPage.tsx`) — the single
forward-planning view of `status=UPCOMING` tasks. Lives under the **Plan**
nav section (promoted 2026-07-05; same-page Today swap toggle dropped later
that day — one surface was clearer than two; see `WORKFLOW.md` §5.1).
Calendar-scheduled tasks are bucketed as Overdue (rose) / This week / Next
week / Later. Exact-time deferrals appear as Snoozed; tasks with neither
`scheduledDate` nor `snoozedUntil` appear as Unscheduled.
When dates have gone stale, the Overdue section exposes one **Unschedule N
overdue** recovery action. It clears schedules only from incomplete Upcoming tasks
in the active Lens; tasks stay on the bench and land in Unscheduled. Each row
can move to **Today** or **Someday**; Someday clears its date.

**Cross-links, not a toggle.** Today's hero links to `/do/upcoming`
(with the bench count); Upcoming's hero links back to `/do/today`. One page
per intent — no same-page swap, no duplicated `UPCOMING` data in two shapes.

**This week** (`/do/week`, `lists/WeekPage.tsx`) is a separate global
Monday–Sunday schedule reached from Today's hero. It pools `UPCOMING` and
`TODAY` tasks across accessible Lenses, grouped by weekday, so a task remains
visible after it is promoted onto Today. **Pool rule** (fixed 2026-08-17,
field semantics revised 2026-08-22):
a `TODAY` commit is due *today* — today is inside this week — so it enters
the pool regardless of `scheduledDate`; anything scheduled before the week
ends also enters, with overdue rows bucketed
under Today rather than hidden. Bucketing lives in the pure `lists/weekView.ts`
(scheduled → its weekday, overdue/unscheduled-Today → the Today bucket,
unscheduled
Upcoming stays out). It is not the Week review and does
not introduce another task status.

**Someday** (`/do/someday`, `lists/SomedayPage.tsx`) — muted flat list, also
under Plan. Promote-to-Today button **exists** (`handlePromote` →
`updateTaskStatus`). No promote-to-Upcoming (by design — that's the snooze
flow's job from Next/Today).

**Done?** Shipped. All three are Planning-area views per WORKFLOW.md §2.4.
