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
Date-bucketed: Overdue (rose) / This week / Next week / Later / Unscheduled.
When dates have gone stale, the Overdue section exposes one **Unschedule N
overdue** recovery action. It clears dates only from incomplete Upcoming tasks
in the active Lens; tasks stay on the bench and land in Unscheduled. Each row
can move to **Today** or **Someday**; Someday clears its date.

**Cross-links, not a toggle.** Today's hero links to `/do/upcoming`
(with the bench count); Upcoming's hero links back to `/do/today`. One page
per intent — no same-page swap, no duplicated `UPCOMING` data in two shapes.

**Someday** (`/do/someday`, `lists/SomedayPage.tsx`) — muted flat list, also
under Plan. Promote-to-Today button **exists** (`handlePromote` →
`updateTaskStatus`). No promote-to-Upcoming (by design — that's the snooze
flow's job from Next/Today).

**Done?** Shipped. All three are Planning-area views per WORKFLOW.md §2.4.
