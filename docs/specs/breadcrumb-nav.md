---
id: breadcrumb-nav
kind: spec
title: "Breadcrumb navigation (crumbs navigate, not just zoom)"
status: Next
feature: breadcrumb-nav
spec_owner: discover
build_owner: build
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsNL      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:45:22Z
---

# Spec: Breadcrumb navigation

> **Status: `ready`** (locked 2026-07-03). Was `draft` pending the model
> decision; the route model is now locked below. Small surface, real decision,
> now resolved.

## Summary

The `Breadcrumb` component exists and works (crumbs are `<button>`s with
`onSelect`), but it is wired only into the design-system demo. The Project and
Goal detail pages use a `← Back` Link instead. Per the 2026-06-16 build
REQUIREMENT (2026-06-16), clicking an ancestor crumb should re-anchor the whole
view at that scope — navigate *into* the Goal or Project, not just zoom.

## Why

The component is built; the wiring isn't. The "list ↔ detail affordance"
question recurs across surfaces (this entry also catches the goal-card
hover-implies-clickable nit). Resolving it here sets the pattern for every
ancestor-navigation surface.

## Done-conditions (draft — pending the model decision)

- [ ] **The interaction model is chosen** (Open Question 1 below resolved and
      recorded in WORKFLOW.md §5). Until this is decided, the rest is moot.
- [ ] **`Breadcrumb` is wired into `ProjectDetailPage` and `GoalDetailPage`**,
      replacing the `← Back` Link.
- [ ] **Clicking an ancestor crumb re-anchors the view** at that scope (the
      crumb's scope becomes the new "current"; the breadcrumb updates).
- [ ] **The current scope's crumb is highlighted** (teal scope-active); deeper
      ancestor crumbs dim, per the design rule.
- [ ] **The "zoom to see in context" behavior stays the job of the `Z` key /
      two-finger swipe**, separate from crumb navigation.
- [ ] **Goal-card hover-implies-clickable nit** resolved in the same pass
      (the same "list ↔ detail affordance" question).
- [ ] Tests: a component test for crumb `onSelect` + an e2e asserting crumb
      click navigates; existing `← Back` e2e (if any) updated.
- [ ] `wasp compile` clean; existing suite green.

## Non-goals

- **No new modes or routes beyond what the model decision requires.** If the
  route model wins, no new routes; if zoom/anchor wins, no new routes either
  (it's a view-state change, not a route change).
- **No mobile-specific gesture work here** — two-finger swipe stays as-is.
- **No breadcrumb on the home screen** — it's a detail-page affordance.

## Decision locked (2026-07-03): the route model

The blocking call is resolved. **Breadcrumb clicks navigate to the ancestor's
existing route** (Project crumb → `/app/projects/:id`, Goal crumb →
`/app/goals/:id`). The breadcrumb is derived from the route, so it's always
consistent with the URL and the back button.

**Why route model over WORKFLOW.md's zoom/anchor.** Every other surface in the
app uses routes; the zoom/anchor model is aspirational and would need a
view-state layer separate from routing that the app does not have. Adding that
layer for breadcrumbs alone is over-engineering. If hard-focus mode (each mode
as a distinct full-screen layout, Icebox) ever ships, *that* is the right time
to introduce the zoom/anchor layer — breadcrumbs can adopt it then. A
forward-note on `work-area-merged` is the only follow-up (it's the other spec
that gestures at view-state vs route questions).

**Build implication:** no new view-state layer. Crumbs are plain links to
existing routes; the chain is derived from the current entity's `projectId` /
`goalId` (both already on the models). This is the simplest possible wiring.

## Open questions (resolved at lock)

- **Crumb derivation source.** Task → Project → Goal needs each task's
  `projectId` and that project's `goalId` — both already on the models.
  Trivial.
- **Breadcrumb on Task detail?** Yes — include Task detail (Task › Project ›
  Goal). Same affordance question, same wiring.

## Prototypes

The `Breadcrumb` component itself is built and demoed in the design-system
page; no throwaway prototype needed. What *would* help is a quick sketch of
the route-model breadcrumb on a real Project detail page (one frame), to
confirm the visual fits before wiring.

## Dependencies

- The model decision (Open Question 1) may want a forward-note on
  `work-area-merged` (the only other spec that gestures at view-state vs
  route questions).
