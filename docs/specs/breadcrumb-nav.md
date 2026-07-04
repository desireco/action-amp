---
id: breadcrumb-nav
kind: spec
title: "Breadcrumb navigation (crumbs navigate, not just zoom)"
status: draft                # was ad-hoc "ready" with no spec; blocking decision unresolved
feature: breadcrumb-nav
spec_owner: discover
build_owner: build
created: 2026-07-03
---

# Spec: Breadcrumb navigation

> **Status: `draft`.** This was tracked as `ready` in ROADMAP/BACKLOG with no
> spec file. Promoted to a real spec 2026-07-03 — but the blocking
> interaction-design decision (zoom/anchor model vs route model) is unresolved,
> so it cannot be `ready` until that call is made here. Small surface, real
> decision.

## Summary

The `Breadcrumb` component exists and works (crumbs are `<button>`s with
`onSelect`), but it is wired only into the design-system demo. The Project and
Goal detail pages use a `← Back` Link instead. Per BACKLOG.md's BUILD
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
      ancestor crumbs dim, per the design rule in BACKLOG.md.
- [ ] **The "zoom to see in context" behavior stays the job of the `Z` key /
      two-finger swipe**, separate from crumb navigation (per BACKLOG.md).
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

## Open questions (must resolve before `ready`)

### 1. The blocking decision: zoom/anchor vs route

The two models disagree on what "navigate into an ancestor" means. This is the
spec's reason for being `draft`.

- **Option A — WORKFLOW.md "zoom/anchor" model.** Clicking a crumb re-anchors
  the *view* at that scope without a route change. The Goal/Project becomes
  the new home context; the breadcrumb updates; the URL may not change (or
  changes only the querystring). Pro: matches the WORKFLOW.md §5 mental model
  ("zoom/anchor"); preserves the "modal, not menu" principle. Con: diverges
  from how the rest of the app works (every other navigation is a route);
  breaks back-button expectations if the URL doesn't change; invents a
  view-state layer the app doesn't currently have.
- **Option B — route model (what the rest of the app uses).** Clicking a
  crumb navigates to the ancestor's existing route: Project crumb →
  `/app/projects/:id`, Goal crumb → `/app/goals/:id`. The breadcrumb is
  derived from the route, so it's always consistent with the URL and the
  back button. Pro: uniform with every other navigation in the app;
  back-button-correct; no new view-state layer. Con: doesn't deliver the
  "re-anchor the whole view" feel WORKFLOW.md §5 describes — it's just
  navigation to a list/detail page.

  **Discover's lean: Option B (route model).** Every other surface in the
  app uses routes; the WORKFLOW §5 zoom/anchor model is aspirational and
  would need its own architectural layer (view-state separate from route)
  that does not exist. Adding that layer for breadcrumbs alone is
  over-engineering. If hard-focus mode (each mode as a distinct full-screen
  layout, Icebox) ever ships, *that* is the right time to introduce the
  zoom/anchor layer — and breadcrumbs can adopt it then. Today, route model.

  This is a Discover call, not Build's. **It must be locked here before
  `ready`.**

### 2. Crumb derivation source

Where does the breadcrumb chain come from? Task → Project → Goal needs each
task's `projectId` and that project's `goalId` — both already on the models.
Trivial once the model decision is made; noted for completeness.

### 3. Breadcrumb on Task detail?

Task detail (`/app/tasks/:id`) currently uses `← Back` too. Including it in
this spec (Task › Project › Goal) or limiting to Project/Goal detail? Lean:
include Task detail — it's the same affordance question.

## Prototypes

The `Breadcrumb` component itself is built and demoed in the design-system
page; no throwaway prototype needed. What *would* help is a quick sketch of
the route-model breadcrumb on a real Project detail page (one frame), to
confirm the visual fits before wiring.

## Dependencies

- The model decision (Open Question 1) may want a forward-note on
  `work-area-merged` (the only other spec that gestures at view-state vs
  route questions).
