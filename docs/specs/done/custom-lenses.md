---
feature: custom-lenses
status: done
shipped: 2026-07-03
spec_owner: discover
build_owner: build
---

# Feature: Custom Lenses

## Summary

Today a Lens is a hardcoded binary — Work (indigo) or Me (emerald), seeded per
user at onboarding, with no client-facing CRUD. This spec opens Lenses into a
user-defined concept: a paying user can create, name, give a purpose, and color
additional lenses (e.g. "Studio", "Side project", "Board work") and switch
between any number of them. The active-lens switcher becomes **adaptive** —
today's segmented control while the user has ≤3 lenses, swapping automatically to
a chip + popover menu once they hit 4. Lens management lives in a new **Lenses**
tab in Settings (Account · Billing · Preferences · **Lenses**).

**Entitlement, locked:** all lens *configuration* — the Lenses tab, and every
edit (create / rename / recolor / edit-purpose / delete) — is **Pro-only**. A
FREE user gets the seeded two and only those: **Me usable, Work visible-but-locked**
(today's upsell pattern — selecting Work fires `<ProGate>`); they cannot edit
either lens and never see custom lenses. Pro unlocks the Lenses tab, full CRUD,
and custom lenses (soft cap, see Open questions). This corrects the v1 draft,
which had wrongly let FREE users rename/recolor the seeded lenses.

Per AGENTS.md, this is a **structural** change: WORKFLOW.md §3 currently defines
Lens as "Work or Me." That doc wins, so it (and the cascade it governs) is
updated *alongside* this spec — see "Doc cascade" below.

## Why

- **Real constraint.** Many users carry more than two life contexts — a day job
  plus a side venture, freelance clients, a board role, a creative practice.
  Forcing all of it into "Work" defeats the lens premise (each Lens carries one
  identity + one focused surface). The schema was already designed for this
  (`@@unique([userId, name])`, "Phase 2" comments in `schema.prisma` and
  `onboarding/operations.ts`) — only the CRUD + switcher were unbuilt.
- **The switcher is the actual UX problem.** A segmented control dies at ~3
  segments; the question "how do you switch between 6 lenses calmly" is what
  makes this a design call, not a CRUD task. Solved here with an adaptive
  pattern that preserves the calm, keyboard-first, low-chrome ethos.
- **Entitlement lever.** Lenses are a natural Pro surface — context
  multiplicity is a power-user need, and FREE users rarely need more than Me to
  feel the product's core loop. So lens *configuration* of any kind (the tab,
  edits, creation) is Pro, while FREE keeps today's upsell pattern (Me usable,
  Work visible-but-locked). This slots into the existing `assertLensAllowed`
  guard with one structural fix (see §"Stable handle").

## Done-conditions

**Data model**
- [ ] A `LensKind` enum (`PERSONAL` for the seeded "Me" lens, `WORK` for the
      seeded "Work" lens, `CUSTOM` for everything else) exists on `Lens`; the
      two seeded lenses are tagged on migration.
- [ ] `Lens` gains an optional `purpose String?` (one short line: "what this
      lens is for").
- [ ] Active-lens client state moves from `localStorage["aa-lens"]` (a name) to
      `localStorage["aa-lens-id"]` (an id); a one-time migration reads the old
      name-keyed value, resolves to id, repersists, then deletes the old key.

**Settings UI (the "where")**
- [ ] A **Lenses** tab exists in `SettingsLayout.TABS` (Account · Billing ·
      Preferences · Lenses) at `/app/settings/lenses`.
- [ ] The entire tab is **Pro-gated**: a FREE user landing on
      `/app/settings/lenses` sees the shared `<ProGate>` (calm copy, no bright
      badge — per PRODUCT.md), not an editable list. They cannot edit, create,
      rename, recolor, or delete any lens.
- [ ] For Pro users, the tab lists all lenses; each row shows color dot, name,
      purpose (muted), counts (goals/projects/tasks), and the lens kind.
- [ ] A Pro user can: rename (any lens), edit purpose (any lens), recolor (any
      lens, from the fixed palette), create new (within the Pro cap), delete
      (`CUSTOM` only — never the two seeded).
- [ ] Deleting a lens with content prompts a clear confirmation stating what
      will be reassigned-to-`Me` vs. what gets archived. No silent cascade
      delete.

**Switcher (the UX)**
- [ ] With ≤3 lenses, the sidebar shows today's `<LensSwitch>` segmented
      control (unchanged).
- [ ] With ≥4 lenses, the sidebar shows a single compact chip (color dot +
      active name + caret); click or `⌘L` opens a popover listing all lenses
      (dot, name, purpose, today-count), with a `+ New lens…` row.
- [ ] The popover is fully keyboard-navigable: `↑`/`↓` move, `↵` select, `/`
      focus the inline filter, `esc` close, `⌘L` toggle. Follows `INTERACTION.md`
      popover conventions.
- [ ] Switching lens updates `<html data-lens>` exactly as today; the
      segmented→chip swap is pure presentational state on lens count, no
      routing change.
- [ ] **FREE users see exactly the seeded two** — Me (usable) and Work
      (visible-but-locked: greyed, `proLocked` chip; selecting fires
      `<ProGate>`). Custom lenses never appear in a FREE user's switcher.
      Selecting `+ New lens…` (Pro popover only) also fires `<ProGate>` for
      FREE.

**Server**
- [ ] `createLens`, `updateLens`, `deleteLens` Wasp actions exist; all are
      tenancy-scoped (`userId`), all enforce entitlements, all call the
      existing `assertUnderCap` / `assertLensAllowed` helpers.
- [ ] `assertLensAllowed` no longer keys on the literal string `"Work"` — it
      keys on `LensKind` (`PERSONAL` allowed for FREE; `WORK` + `CUSTOM`
      restricted). Verified by a test that renames the Work lens and confirms
      FREE gating still fires.
- [ ] `resolveLensName` is renamed/extended to `resolveLens` and returns
      `{ name, kind }` so the guard can branch on kind, not name.

**Cross-cutting**
- [ ] Triage's Context step radio (`TriagePage.tsx:82`) renders the full lens
      list (not just the two seeded) and uses the same adaptive pattern when
      ≥4 lenses exist.
- [ ] The mobile lens menu (`AppShell.tsx:329`) lists all lenses.
- [ ] Vitest covers: stable-handle gating after rename; create-at-cap (402);
      delete-CUSTOM-only; the active-lens id migration.
- [ ] `wasp db migrate-dev --name lens_kind_and_purpose` runs clean;
      `wasp compile` passes.

## Non-goals

- **No free-form hex color.** Color stays a curated palette key (see §"Color
  palette"). A picker is a later, separate decision; this spec adds keys, not
  raw values.
- **No lens reordering / drag order in the switcher.** Lenses sort by kind
  (seeded first) then `createdAt`. Ordering is a cosmetic follow-up.
- **No lens archiving / "hide this lens."** Delete-with-reassign is the only
  removal path.
- **No sharing / multi-user lenses.** A lens is per-user, full stop.
- **No change to Capture or Inbox scoping** — both stay universal
  (WORKFLOW.md §2.1, §3).
- **No per-lens preferences** (distinct Today caps, sounds, etc.) — those stay
  global on `User` / `Preferences`.

## Color palette

`Lens.color` is a **palette key**, not a hex value (existing design — see
`tokens.css` `--aa-lens-*`, and WORKFLOW.md §3: "identity, not decoration, and
it never borrows the reserved hues"). Today only `indigo` and `emerald` have
token ramps.

This spec adds a curated set of lens hues — each with full 5-step ramps + dark
variants, never reusing the reserved hues (teal = system, amber = Important,
violet = projects/goals, rose = errors):

- `indigo` (Work — seeded)
- `emerald` (Me — seeded)
- `slate` (neutral; good for a "General"/"Admin" lens)
- `cyan`
- `rose`-adjacent alt → **use `coral`** (must not collide with the `rose` error
  hue — distinct ramp)
- `amber`-adjacent alt → **use `honey`** (must not collide with the amber
  Important hue)
- `lime`
- `magenta`

Final palette + exact ramp values are documented in `DESIGN-SYSTEM.md` §2 (and
live in `tokens.css`); this spec locks the *mechanism* (keyed ramps), not the
swatches. Build blocks on the existing `--aa-lens-*` pattern: for each new key
`K`, add `--aa-lens-K`, `-text`, `-soft`,
`-soft-strong`, `-mid`, plus a `[data-lens="K"] { --aa-active-lens*: …; }` block
and dark-theme overrides. The color picker in Settings renders the curated set
as swatches (with reserved hues visibly absent).

## The switcher (UX detail)

Two states, picked automatically off `lenses.length`:

```
≤3 lenses  →  segmented control (today's <LensSwitch>, unchanged)
              ● Work | ● Me           (2 segments)

≥4 lenses  →  chip + popover
   sidebar:  ┌────────────────────────────┐
             │ ●  Work                ⌘L ▾ │
             └────────────────────────────┘
   ⌘L / click:
             ┌────────────────────────────┐
             │ Switch lens           ⌘L   │
             ├────────────────────────────┤
             │ ●  Work          12   ↵    │
             │    deep client work        │
             │ ●  Me           3          │
             │ ●  Studio        0         │
             │    side projects           │
             ├────────────────────────────┤
             │ +  New lens…       (Pro)   │
             └────────────────────────────┘
             ↑↓ move · ↵ select · / filter · esc
```

The adaptive rule is the *only* new switcher logic. Everything else about the
switcher (the `proLocked` chip for FREE users, the `data-lens` mirror, the
mobile bottom-dock menu, the Triage Context radio) keeps its current behavior —
just fed the full lens list instead of two entries.

**Why adaptive over chip-always:** the 2-lens case is the overwhelming default
at signup, and segmented beats a popover for "you have exactly two contexts"
(one tap vs two). Switching to chip-at-4 keeps the >3 case calm without making
early users learn a popover for a control that doesn't need one yet.

## Stable handle (the load-bearing fix)

Today `assertLensAllowed` (`entitlements.ts:82`) gates FREE users by the literal
name `"Work"`, and active-lens state lives in localStorage **by name**
(`AppShell.tsx:64`). Both are safe only because names are hardcoded. The moment
a user renames "Work" → "Studio":

- the entitlement guard stops recognizing the Work lens → FREE gating breaks;
- the localStorage key stops matching → active lens resets silently on reload.

So this spec requires:

1. **`LensKind` enum** on the seeded lenses — `WORK` and `PERSONAL` are
   stable handles that survive renames. `assertLensAllowed` branches on kind,
   not name.
2. **Active-lens state keyed by `id`**, not name. One-shot migration on app
   load: read `aa-lens` (name) → resolve via the lens list → write `aa-lens-id`
   → delete `aa-lens`.

These are not optional polish — they are what makes user-defined lenses safe at
all.

## Doc cascade

Per AGENTS.md's "structure changes start in WORKFLOW.md" rule, these doc edits
ship *with* the build, not after:

1. **`docs/WORKFLOW.md` §3** — rewrite "Every Task / Project / Goal / Resource
   belongs to exactly one **Lens** (Work or Me)" → "...belongs to exactly one
   **Lens** (a Work/Me default, plus any number of user-defined lenses on Pro)."
   Add a §5 "Decisions locked" entry recording the adaptive-switcher + Pro-only
   calls. (WORKFLOW.md is canonical — it wins, the others follow.)
2. **`docs/WORKFLOW.md` §6** — append `DATA-MODEL.md` and `TRIAGE.md` to the
   cascade list (they reference the binary).
3. **`docs/DATA-MODEL.md`** — document `LensKind`, `Lens.purpose`; update the
   §4 "where things live" if it still implies a binary.
4. **`docs/TRIAGE.md`** — note the Context step now lists the full lens set,
   adaptive pattern when ≥4.
5. **`docs/PRICING.md`** — record "Custom lenses: Pro-only, soft cap N" (N per
   the Open question below) and that FREE = seeded two (Me usable, Work locked).
6. **`docs/specs/entitlement-enforcement.md`** — note the name→kind switch in
   `assertLensAllowed` and why (rename-safety).

## Open questions

- **Pro cap.** This spec says "Pro-only" but not *how many*. Recommendation: a
  soft cap (e.g. **8 total lenses** on Pro) matching the existing soft-cap
  pattern (projects=3, goals=1). Discover to confirm the number; until then
  Build uses a `PRO_LIMITS.lenses = 8`. (FREE is fixed at the seeded two — not a
  count, a hard set: Me + Work.)
- **Delete target.** When a `CUSTOM` lens with content is deleted, are its
  tasks/projects/goals reassigned to `Me`, or archived? Recommendation: reassign
  to `Me` (matches "lossless" ethos; archive is for triage "won't do", not for
  "this lens is gone"). Edge case: a user who has deleted/renamed their `Me`
  lens — but seeded lenses can't be deleted, so `Me` always exists. Confirm.
- **Rename of the seeded lenses.** Allowed? Recommendation: **yes** — `WORK`/
  `PERSONAL` are the stable handles, so the user-facing "Work"/"Me" can be
  anything. The kind (not the name) carries the entitlement. Confirm.
- **Chip vs segmented threshold.** Spec locks at 4 (≥4 → chip). Confirm this is
  the right place to flip — 3 segments still reads cleanly on mobile, 4 starts
  to crowd.

## Prototypes

_(none yet — defer to Build; the adaptive pattern is well-specified enough to
implement directly. If Build wants a throwaway worktree to validate the popover
keymap against `INTERACTION.md`, that's the right place for one.)_
