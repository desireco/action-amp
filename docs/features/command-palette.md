---
slug: command-palette
title: "Command palette + sitewide search (⌘\\)"
feature_area: cross-cutting
status: shipped
spec: command-palette-search.md # done
verified: 2026-08-08
---

# Command palette + sitewide search

**Current verdict: shipped and browser-verified.**
The paid Wasp queries, bounded tenant-scoped ranking, compact entity/Lens index,
Fuse label matching, complete safe-command registry, shared `<ProGate>`, `/`
Search and `⌘\` Command entry, exact result anchors, accessibility behavior, and
targeted tests are wired. `wasp compile`, the command-palette test slice, the
full 900-test Vitest suite, and all four targeted Playwright journeys pass
locally. Desktop (1440×900) and touch (390×844) browser inspection verified
focus, selection, responsive layout, result context, and pointer entry.

## Locked product shape

- **One component, two entry intents.** `/` opens Search; `⌘\` (`Ctrl+\` on
  Windows/Linux) opens Command. Both use the same popover and sitewide result
  engine; there is no separate Search page or Logbook-only search box.
- **Global, not current-Lens-only.** Paid users can find records across all
  their Lenses. Every cross-Lens result shows its Lens so the jump never feels
  like unexplained context loss.
- **Jump targets.** Tasks (open, completed, and Won't do), Projects, Goals,
  project-owned Resources, live/archived Inbox records, and Lenses. Static
  destinations cover Next, Inbox, Triage, Today, Upcoming, Someday, Projects,
  Goals, Logbook, Review, and Settings.
- **Safe commands only in v1.** Capture and Toggle theme may run from the
  palette. Destructive commands and task mutations are excluded.
- **Search the words users wrote.** Task title/Context/Outcome/updates,
  Project and Goal name/description, Resource title/URL/notes, and live or
  archived Inbox text/content/source URL are searchable. Label matching is
  fuzzy; long-form matching is case-insensitive substring search in v1.
  Results are always scoped to the authenticated user.
- **Correct destinations.** Every Task result opens
  `/app/tasks/:permalink`, including completed tasks. Project and Goal results
  use their permalink routes. A Resource opens its parent Project's Resources
  section. An Inbox result opens and anchors the record in Inbox or Logbook,
  based on status. A Lens result switches the active Lens without inventing a
  route.
- **Pro boundary.** Active Pro, Founder, and admin accounts can query it. Free
  or expired-Pro users get the existing calm `<ProGate>` treatment when they
  invoke it; no silent shortcut and no raw 402.
- **Desktop-first, touch-reachable.** Keyboard is primary. A visible, quiet
  search control opens the same popover for pointer/touch users, matching
  `INTERACTION.md`.

## Required implementation surfaces

- `search/CommandPalette.tsx` + styles using the shared capture-popover overlay
  mechanics and accessible combobox/listbox semantics.
- `app/useKeyboardShortcuts.ts` + `AppShell.tsx` wiring for command-mode open,
  close, overlay precedence, and focus restoration.
- Existing paid, tenancy-safe `searchSite` backend hardened against this spec,
  including bounded relevance-safe retrieval, plus a paid compact entity-index
  query for fuzzy jump targets.
- Resource-section anchor support on Project detail; active-Lens switching for
  Lens results; route-safe navigation for every result type.
- Complete unit/component/a11y coverage and an e2e covering both entry intents,
  exact destinations, gating, and no `⌘K` Capture regression.

Exact query contracts, ranking, interaction states, entitlement behavior,
accessibility, and test matrix live in
`docs/specs/command-palette-search.md` (`done`, verified 2026-08-08).

**Implementation files.** `webapp/src/search/CommandPalette.tsx` + CSS,
`paletteRegistry.ts`, `paletteMatching.ts`, `operations.ts`,
`operationsCore.ts`, and tests; `webapp/main.wasp.ts` query registration;
`webapp/src/app/AppShell.tsx`, `useKeyboardShortcuts.ts`, and
`ShortcutCheatsheet.tsx` wiring; `webapp/src/billing/entitlements.ts` +
`entitlementHttp.ts` gate; exact-target support in Inbox, Logbook, and Project
detail; `webapp/e2e/search.spec.ts`.

## Explicitly later

Attachment OCR/binary search, saved searches, semantic/AI search, search
analytics, customizable shortcuts, recent-command sync, destructive commands,
and general record mutation from the palette. These need evidence before they
earn permanent command-surface space.

**Why it matters.** Next intentionally demotes lists. Once a user has real
history and structure, this becomes the fast, calm escape hatch—and one of the
few Pro capabilities that gets more valuable as their ActionAmp data grows.
