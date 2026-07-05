---
slug: upcoming-someday
title: "Upcoming + Someday (bench + maybe-later)"
feature_area: focus
status: shipped
spec: —
verified: 2026-07-03
---

# Upcoming + Someday

**Upcoming** (`/app/upcoming`, `lists/UpcomingPage.tsx`) — the forward-planning
view of `status=UPCOMING` tasks. Lives under the **Plan** nav section
(promoted 2026-07-05; see `WORKFLOW.md` §5.1). Date-bucketed: Overdue (rose) /
This week / Next week / Later / Unscheduled. Each row has a "Today" promote
button (reuses `updateTaskStatus`) and supports inline notes editing.

**The Today "See upcoming" toggle** is a separate, same-page swap surface on
the Today page — same `status=UPCOMING` data, flat (not bucketed), promote
without leaving Today. Two surfaces, two intents: the page is for *planning*
(horizon), the toggle is for *now* (swap one onto Today).

**Someday** (`/app/someday`, `lists/SomedayPage.tsx`) — muted flat list, also
under Plan. Promote-to-Today button **exists** (`handlePromote` →
`updateTaskStatus`). No promote-to-Upcoming (by design — that's the snooze
flow's job from Next/Today).

**Done?** Shipped. All three are Planning-area views per WORKFLOW.md §2.4.
