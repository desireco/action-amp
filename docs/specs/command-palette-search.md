---
feature: command-palette-search
status: ready
spec_owner: discover
build_owner: build
---

# Feature: Command palette + Logbook search

## Summary

Add the two Pro-tier "power" features the pricing page already sells but that
don't exist: a `⌘\` command palette (fuzzy jump to any task/project/goal/view
+ run actions), and full-text search across the Logbook. Both are the features
most likely to justify the $79.50/yr price to an existing user who has built
up real structure. Because they're Pro-only on paper, this spec also wires the
entitlement gate (depends on `entitlement-enforcement`).

## Why

The audit found the command palette and search are **Pro-only in PRICING.md §4
but don't exist at all** — there's nothing to gate. They rank highly because
they're the *retention* features: a user who has captured hundreds of tasks
needs to find and jump to them, and "I can finally search my own history" is
the moment Pro becomes worth it. Shipping them also makes the Pro tier honest
(it currently advertises features that aren't there). `⌘\` is chosen over
`⌘K` (which is already capture) per FEATURES.md F20.

## Done-conditions

- [ ] **The command palette opens on `⌘\`.** A new `CommandPalette` overlay
      (same overlay shell as `CapturePopover` — reuse `Overlays.css` patterns).
      Registered in `useKeyboardShortcuts.ts` alongside the existing `⌘K`/
      `⌘/` capture binding. Disabled while typing in inputs (same rule as the
      global handler).
- [ ] **The palette fuzzy-searches and jumps.** Typing matches against: open
      Tasks (description), Projects (name), Goals (name), and a fixed set of
      view/action targets ("Today", "What Now", "Inbox", "Logbook",
      "Settings", "Toggle theme"). Arrow/Enter selects; the selected item
      navigates (tasks → `/app/tasks/:id`, projects → `/app/projects/:id`,
      views → their route). Esc closes.
- [ ] **Logbook full-text search exists.** A new server query
      `searchLogbook({ query })` (or a param on `getLogbook`) doing a
      case-insensitive `contains` search over completed Tasks' `description`
      + `content`, scoped to the user. Surfaced as a search box on the
      Logbook page (`LogbookPage.tsx`) that filters the list live (or on Enter).
- [ ] **Both features are gated to paid plans.** Uses
      `isPlanActive(context.user.plan, context.user.planRenewsAt)` on the
      server query, and the client hides/disables the `⌘\` hint + search box
      for FREE users with a calm "Pro" affordance. **Depends on
      `entitlement-enforcement` landing first** (or this spec adds the gate
      itself if that one hasn't shipped — note in review).
- [ ] **Fuzzy matching uses a lib, not hand-rolled.** `fuse.js` (already a
      common choice; tiny) or equivalent. No bespoke edit-distance code.
- [ ] **Keyboard-first, mouse-optional.** Every palette action reachable
      without the mouse (arrow nav + Enter), per PRODUCT.md "keyboard-first."
- [ ] **Tests:** a Vitest case for `searchLogbook` (match, no-match,
      cross-user isolation via userId scoping). A component test for the
      palette's open/filter/select/navigate is nice-to-have.
- [ ] **`wasp compile` passes. Existing suite green.**
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No search across *open* tasks / Inbox in v1.** Logbook only for now; open-
  task search muddies the "What Now is a chooser, not a list" thesis. The
  command palette's jump-to-task covers the active-set need.
- **No saved searches / smart lists.**
- **No search over task `updates[]` (the activity log).** `description` +
  `content` only for v1.
- **No AI/semantic search.** Plain fuzzy substring. (AI is explicitly Phase 2.)
- **No command palette actions beyond navigation + the fixed view list.**
  "Run any action" (start timer, set energy) is F20's full vision; v1 is jump.
- **No mobile-specific UI.** Desktop-first; mobile gets the same overlay.

## Open questions

- **Gating ownership.** If `entitlement-enforcement` has already shipped, this
  spec reuses its `isPlanActive` guard. If not, Build should add the minimal
  guard for these two features inline and flag that `entitlement-enforcement`
  still owes the create-caps. Either is fine; state which path was taken.
- **Where the search box lives.** Lean: on the Logbook page header (simplest,
  scoped). Alternative: inside the command palette as a "search logbook" mode.
  Build picks the simpler; Discover leans the header box.

## Prototypes

_(none — standard overlay + a list; reuse the existing overlay shell. The
Logbook search box reuses existing input styling.)_
