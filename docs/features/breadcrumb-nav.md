---
slug: breadcrumb-nav
title: "Breadcrumb navigation (crumbs navigate)"
feature_area: cross-cutting
status: missing
spec: breadcrumb-nav.md            # draft — written 2026-07-03
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

**Spec.** `docs/specs/breadcrumb-nav.md` — **`draft`** (written 2026-07-03; was
ad-hoc "ready" with no spec). The blocking decision is captured but unresolved:
WORKFLOW.md "zoom/anchor" model vs the route-based model the rest of the app
uses. **Discover's lean: route model** (uniform with the rest of the app; the
zoom/anchor layer is over-engineering for breadcrumbs alone — it belongs with
hard-focus mode, if that ever ships). The decision must be locked before
`ready`.

**Why it matters.** Small, but the "list ↔ detail" affordance question recurs
across surfaces; resolving it here sets the pattern.

