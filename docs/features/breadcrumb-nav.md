---
slug: breadcrumb-nav
title: "Breadcrumb navigation (crumbs navigate)"
feature_area: cross-cutting
status: missing
spec: breadcrumb-nav.md            # ready — route model locked 2026-07-03
verified: 2026-07-03
---

# Breadcrumb nav

**Wanted.** The `Breadcrumb` component works (crumbs are `<button>`s) but is
wired only into the design-system demo. Project/Goal detail pages use a `← Back`
Link instead. Per BACKLOG.md's BUILD REQUIREMENT (2026-06-16), clicking an
ancestor crumb should re-anchor the view at that scope. Includes the goal-card
hover-implies-clickable nit.

**Today.** Component exists, not wired. Spun out of `friction-cleanup` at
sign-off (2026-07-02) because wiring it is an interaction-design decision, not
a cleanup finish.

**Spec.** `docs/specs/breadcrumb-nav.md` — **`ready`** (locked 2026-07-03). The
blocking decision is resolved: **route model** — crumbs navigate to the
ancestor's existing route (`/app/projects/:id`, `/app/goals/:id`), uniform with
the rest of the app, no new view-state layer. The zoom/anchor layer is deferred
to hard-focus mode if that ever ships.

**Why it matters.** Small, but the "list ↔ detail" affordance question recurs
across surfaces; resolving it here sets the pattern.


