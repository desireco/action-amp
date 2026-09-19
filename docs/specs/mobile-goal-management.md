---
feature: mobile-goal-management
status: review
spec_owner: discover
build_owner: build
kind: spec
---

# Feature: Mobile goal management (end-to-end) + Plan section menu

> Records a deliberate stance reversal: mobile was scoped capture-first
> (TRIAGE.md §6) and Goals had no mobile entry point. Jake reversed this on
> 2026-09-18 — mobile is a full client now, and goal work must be possible
> end-to-end on a phone. The reversal is recorded in WORKFLOW.md Decision 6
> and TRIAGE.md §6 (both revised same day).

## Summary

Goals already render on any viewport and the backend is complete
(`goals.list/detail/create/setDone/update/delete/reorder`; linking via
`projects.update({goalId})`) — but on a phone the surface is stranded: the
mobile dock links Plan straight to `/projects`, so Goals is reachable only by
URL or the Pro-gated command palette, and neither goals screen has any
responsive styling. This spec makes the Plan section reachable from the
mobile dock via a section menu, gives the goals surfaces a responsive pass,
and makes project→goal linking usable on touch.

Pure client work (`web/`). No backend, contract, caps, or entitlement changes.

## Why

- The 2026-09-09 account review lists "Make a create project or goal
  experience on mobile" as a real next step, and notes zero goals in the
  account — the top tier of the hierarchy is unused, partly because the
  main client that's actually in hand (the phone) can't work it.
- The old lean ("Goals are deliberate. Capture-as-new-goal feels too cheap",
  TRIAGE.md OQ3) stands — this spec doesn't make goal creation cheap or
  fast from capture. It makes the *deliberate* surface (the Goals page)
  reachable. Deliberate ≠ desktop-only.
- Upcoming and Someday are similarly stranded (reachable only via Today
  hero links); the Plan section menu fixes the class, not just Goals.

## Confirmed decisions (2026-09-18)

- **Entry point: the dock's Plan item opens a section menu** (chosen over an
  in-page link row on Projects). Upcoming / Projects / Goals / Someday rise
  above the dock in the same pattern as the existing Lens menu. Costs one
  extra tap to reach Projects; makes all four Plan destinations first-class.
- **Full lifecycle on mobile** — create, edit, complete/reopen, delete,
  link/unlink projects, reorder. The screens' markup already works on touch
  (plain forms, buttons, confirm dialog); the work is entry + responsive CSS.
- **Linking stays project-side**, via the project detail's goal picker —
  rendered as a PickerSheet on **all viewports**, and no
  goal-side "add project" control appears (parity with desktop). *(Revised
  during build: the draft said "PickerSheet on mobile, desktop unchanged",
  but the codebase's popover/sheet dual pattern is option-count-driven, not
  viewport-driven — PropertyChips renders sheets for long lists on every
  viewport, and a matchMedia branch would have introduced a new pattern.
  The inline button row is retired and its styles removed.)*
- **Creation from capture/triage on mobile stays out.** OQ3's lean stands.

## Done-conditions

### Slice 1 — Plan section menu (reachability)

- Tapping the dock's Plan item navigates to **Upcoming** (the section
  default); a quick second tap opens a menu above the dock listing Upcoming
  (with count), Projects, Someday (with count), Goals — laid out so the time
  horizons (Upcoming/Someday) sit in the left column and the structure
  destinations (Projects/Goals) in the right (Jake's arrangement,
  2026-09-19); tapping an entry navigates and closes the menu. *(Revised
  2026-09-19: the draft had the single tap open the menu; Jake prefers
  tap→Upcoming with the menu on double tap — the menu is the switcher, not
  the gate. The first tap navigates immediately; the double tap lands on
  the already-open Upcoming page.)*
- The Plan item uses the Lens button's exact mechanics: `aria-expanded`,
  active highlight, opening one menu closes the other, Esc closes, and the
  dock keeps 5 slots.
- While on any `/upcoming|/projects|/goals|/someday` route, the Plan dock
  item shows the section-active state (existing `inPlan` match, unchanged).
- Desktop is pixel-identical to today (menu and its trigger exist only in
  the ≤768px chrome).

### Slice 2 — Goals surfaces at phone widths

- At 375×667 (and up to 768px): the goals card grid is a single column; the
  list header and "New goal" composer are tap-friendly and don't overflow;
  the detail header stacks with Edit / Complete / Delete wrapping under;
  linked-project rows wrap cleanly (name + Done/%/due chips); reorder ↑/↓
  buttons have ≥32px touch targets.
- No horizontal overflow on either goals route; content above the fixed
  dock is fully reachable (safe bottom padding).
- Create → complete → delete flows all work by touch, including the delete
  ConfirmDialog with the lossless re-parenting copy.

### Slice 3 — Project→goal linking on touch

- The project detail's goal picker renders as a PickerSheet (single-choice
  list including "None (standalone)") on every viewport; linking/unlinking
  works end-to-end from the sheet, and a failed relink surfaces inline in
  the Why row. The retired inline picker's styles are gone.

### Tests

- A Playwright mobile-viewport (320×568, iPhone SE — narrow enough that the
  shared grid's 320px track overflows the document without the
  single-column rule, so the overflow guard has teeth) flow covers: dock →
  Plan menu → Goals → create → open detail → link check → complete → back
  on /goals, and asserts no horizontal overflow on the goals routes.

## Non-goals

- No goal creation from capture or triage on mobile (or desktop).
- No drag-to-reorder — ↑/↓ buttons remain, with bigger touch targets.
- No new mobile work on Upcoming/Someday/Projects pages beyond menu
  reachability.
- No backend, contract, caps, or entitlement changes (FREE 1-active-goal
  -per-lens 402 → ProGate behaves exactly as on desktop).
- No native shells (ROADMAP §Icebox stance unchanged).

## Open questions

- None blocking. (Long-press or swipe as a shortcut to a specific Plan
  destination can wait for real usage patterns.)
