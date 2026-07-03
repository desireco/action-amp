---
slug: upcoming-someday
title: "Upcoming + Someday (bench + maybe-later)"
feature_area: focus
status: shipped
spec: —
verified: 2026-07-03
---

# Upcoming + Someday

**Upcoming** (`/app/upcoming`, `lists/UpcomingPage.tsx`) — groups by This week /
Next week / Later. *No* promote-to-Today button on this page (rows open the
task); promotion happens via the Today "See upcoming" swap-bench. (Route kept by
explicit decision 2026-07-02 — was nearly removed.)

**Someday** (`/app/someday`, `lists/SomedayPage.tsx`) — muted flat list.
Promote-to-Today button **exists** (`handlePromote` → `updateTaskStatus`). No
promote-to-Upcoming (by design).

**Done?** Shipped. Both are Planning-area views per WORKFLOW.md §2.4.
