---
slug: upcoming-someday
title: "Upcoming + Someday (bench + maybe-later)"
feature_area: focus
status: shipped
spec: —
verified: 2026-07-03
---

# Upcoming + Someday

**Upcoming** (`/app/upcoming`, `lists/UpcomingPage.tsx`) — the single
forward-planning view of `status=UPCOMING` tasks. Lives under the **Plan**
nav section (promoted 2026-07-05; same-page Today swap toggle dropped later
that day — one surface was clearer than two; see `WORKFLOW.md` §5.1).
Date-bucketed: Overdue (rose) / This week / Next week / Later / Unscheduled.
Each row has a "Today" promote button (reuses `updateTaskStatus`) and
supports inline notes editing.

**Cross-links, not a toggle.** Today's hero links to `/app/upcoming`
(with the bench count); Upcoming's hero links back to `/app/today`. One page
per intent — no same-page swap, no duplicated `UPCOMING` data in two shapes.

**Someday** (`/app/someday`, `lists/SomedayPage.tsx`) — muted flat list, also
under Plan. Promote-to-Today button **exists** (`handlePromote` →
`updateTaskStatus`). No promote-to-Upcoming (by design — that's the snooze
flow's job from Next/Today).

**Done?** Shipped. All three are Planning-area views per WORKFLOW.md §2.4.
