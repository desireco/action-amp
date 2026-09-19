# Review: mobile-goal-management

<!-- Build owns this file. Discover reads it to sign off. -->

Spec: `docs/specs/mobile-goal-management.md` · Commits `fdb2d9f`,
`8a96262`, `465915d`, `60bf79a`, `f0a4019`, `b8d0564`, `1070e91`.

## What changed

Mobile stopped being a capture terminal for goals — the full lifecycle
(create, edit, complete/reopen, delete, link, reorder) now works by thumb.
No backend, contract, cap, or entitlement changes; everything rides the
existing `goals.*` + `projects.update` procedures.

- **Plan section menu** (`Shell.svelte` + `app-shell.css`) — the dock's Plan
  item is a toggle that raises Upcoming (count) / Projects / Goals / Someday
  (count) above the dock, in the Lens menu's exact pattern (mutual
  exclusion, `aria-expanded`, Esc in the close cascade). Fixes the class
  problem: Upcoming/Someday were near-stranded too. Desktop chrome unchanged.
- **Goals responsive pass** (`goals.css`) — single-column grid at ≤768 (the
  320px minmax track overflowed a phone frame), header wrap, detail drops
  its double inset, ↑/↓ reorder buttons get ≥32px touch targets, long
  project names wrap instead of pushing the row wide.
- **Goal relink via PickerSheet** (`ProjectDetailView.svelte`) — the inline
  button row is retired; linking uses the shared single-choice sheet
  (incl. "None (standalone)") on every viewport. Failed relinks surface
  inline in the Why row. Dead `aa-relink-picker` styles removed.
- **Docs** — the stance reversal is recorded where the old position lived:
  WORKFLOW.md Decision 6 (dock amendment, dated), TRIAGE.md §6 (the
  planning carve-out + platform table row), new spec, refreshed
  `docs/features/goals.md` (was still pointing at webapp paths).

## Spec deviations

One, recorded in the spec itself: slice 3 drafted "PickerSheet on mobile,
desktop unchanged" — built as a sheet on **all** viewports because the
codebase's popover/sheet dual pattern is option-count-driven
(`PropertyChips`), not viewport-driven; a `matchMedia` branch would have
introduced a brand-new pattern to the codebase.

## Verification

- `web/e2e/mobile-goals.spec.ts` — the full thumb flow at 375×667 (Plan
  menu → create → complete → PickerSheet link) with a no-horizontal-overflow
  guard, plus Plan/Lens menu mutual exclusion. `goal-planning.spec.ts`
  updated off the retired inline picker. **Full suite: 80/80 passed.**
- Visual pass at 375×667 through the dev server: Plan menu (2×2, counts,
  icons), goals list (single column, "New goal" inline), goal detail
  (actions wrap, project row + chips + reorder arrows), PickerSheet
  (anchored, current highlighted) — 0px horizontal overflow everywhere, and
  the last goal card scrolls clear of the dock (the 136px shell padding
  holds).
- `oxlint` clean, `svelte-check` 0 errors. Note: `npm run lint`'s
  design-token gate fails on **main** with 93 pre-existing violations —
  none introduced by this work (app-shell.css carries 4, on untouched
  pre-existing lines); that regression predates this spec and is worth its
  own cleanup pass.

## Open items for Discover

- Sign-off on the Plan-menu interaction (one extra tap to reach Projects).
- The 93 pre-existing design-token violations on main (separate cleanup).

## Addendum — review + cleanup pass (2026-09-19)

A full code-review pass over the seven commits surfaced one real bug and
a handful of cleanups; all fixed in the review-fix commit:

- **P1 (bug): the goals-list responsive rules never loaded on /goals.**
  goals.css (single-column grid, header wrap, create control) is imported
  only by GoalDetailView, and the SPA's per-route CSS splitting meant a
  direct phone visit to /goals never fetched it — the rules were inert
  until a goal detail was visited in the same session. The 375px test
  viewport masked it (the shared 320px grid track collapses on its own
  above ~368px). Fixed with one import in GoalsView; the spec's viewport
  moved to **320×568** so the overflow guard genuinely catches a
  regression (verified: removing the import now fails the test with
  "/goals overflows horizontally").
- **P2: Capture FAB sat under the dock menus.** Both menus span the full
  width above the dock; the half-built `is-hidden-while-lens-open` hook
  from the Sept 2 port is now wired properly — CaptureFab takes a
  `hidden` prop, Shell passes `mobileLensOpen || mobilePlanOpen`, and the
  dead `is-lens-open` dock class is gone. Verified in the browser for
  both menus.
- **P2: orphaned `.aa-relink-opt:focus-visible`** selector removed from
  the shared focus-ring group in projects.css.
- **P3 docs:** features/goals.md "on touch" → "on every viewport"; the
  commit list above now includes `1070e91`; the token-violation note now
  says "none introduced by this work" (app-shell.css carries 4 on
  untouched lines); the s6-goals parity README's link step notes the new
  PickerSheet selector instead of rewriting its webapp-era record.
- **Deferred:** extracting the four Plan destinations into a shared
  array feeding both the sidebar and the menu (P3) — pays off only when
  the section gains a fifth destination. The menu hiding zero counts
  while the sidebar renders them is deliberate (calm tone; matches the
  lens menu's quieter precedent).
