---
feature: command-palette-search
status: ready
spec_owner: discover
build_owner: build
---

# Feature: Command palette + Logbook search

## Summary

Add the two Pro-tier "power" features the pricing page already sells but that
don't exist: a command palette (fuzzy jump to any task/project/goal/view +
run actions), and full-text search across **all of the user's tasks — open
and completed**. Both are the features most likely to justify the $79.50/yr
price to an existing user who has built up real structure, and shipping them
makes the Pro tier honest (it currently advertises features that aren't
there). Because they're Pro-only on paper, this spec also wires the
entitlement gate (depends on `entitlement-enforcement`).

### Two product calls, resolved up front

1. **Capture owns `⌘K`; the command palette uses `⌘\`.** Capture is the first
   move in ActionAmp and is locked to `⌘K` (2026-06-30). The palette should
   keep the separate `⌘\` binding already shown in the app/page docs rather
   than displacing capture. Update the cheatsheet + FEATURES.md §6 if the
   palette ships with additional discoverability copy.
2. **Search covers open *and* completed tasks, not Logbook-only.** The earlier
   "Logbook-only" framing was backwards: a user with 200 tasks who wants to
   find the open "Email Sarah" task isn't helped by searching only completed
   items. The "Next is a chooser, not a list" principle governs the *home
   screen* — it doesn't forbid search elsewhere. Search is a Planning/Review
   tool, and it spans the whole library.

## Done-conditions

- [ ] **The command palette opens on `⌘\`.** A new `CommandPalette` overlay
      (same overlay shell as `CapturePopover` — reuse `Overlays.css` patterns).
      Registered in `useKeyboardShortcuts.ts`. `⌘K` remains capture. Disabled
      while typing in inputs (same rule as the global handler).
- [ ] **The palette fuzzy-searches and jumps.** Typing matches against: all
      Tasks (open + done — description), Projects (name), Goals (name), and a
      fixed set of view/action targets ("Today", "Next", "Inbox",
      "Logbook", "Settings", "Toggle theme"). Arrow/Enter selects; the selected
      item navigates (tasks → `/app/tasks/:id` or `/app/logbook` if done,
      projects → `/app/projects/:id`, views → their route). Esc closes.
- [ ] **Full-text search exists across all the user's tasks.** A new server
      query `searchTasks({ query })` doing a case-insensitive `contains`
      search over Tasks' `description` + `content`, scoped to the user,
      returning both open and completed (with a done/open flag so the UI can
      distinguish). Surfaced as a search box that the palette and/or a
      Planning-area page can call. **Not Logbook-only** — see the Summary's
      second product call.
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
- [ ] **Tests:** a Vitest case for `searchTasks` (match, no-match,
      cross-user isolation via userId scoping, open-vs-done flag returned).
      A component test for the palette's open/filter/select/navigate is
      nice-to-have. An e2e asserting `⌘\` opens the palette is required.
- [ ] **`wasp compile` passes. Existing suite green** — note: any test or e2e
      that asserts `⌘K` → capture should remain valid. The cheatsheet copy
      (`ShortcutCheatsheet`) and FEATURES.md §6 are updated to reflect the new
      palette binding.
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No search over task `updates[]` (the activity log).** `description` +
  `content` only for v1.
- **No saved searches / smart lists.**
- **No AI/semantic search.** Plain fuzzy substring. (AI is explicitly Phase 2.)
- **No command palette actions beyond navigation + the fixed view list.**
  "Run any action" (start timer, set energy) is F20's full vision; v1 is jump.
- **No mobile-specific UI.** Desktop-first; mobile gets the same overlay.
- **No reclaiming `⌘K` from capture.** Capture keeps the stable global chord.

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
