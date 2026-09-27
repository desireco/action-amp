---
kind: bug
status: done
priority: P3
feature: design-system
parent: docs/DESIGN-SYSTEM.md

# Design-token lint sweep — complete (2026-09-26)

---

`scripts/check-design-tokens.sh` is **green**: every color, font-size, and
border-radius in `web/src` comes from tokens (or tokens.css itself). The gate
runs in `npm run lint` and now blocks honestly.

## How the remainder was decided (Jake's session, 2026-09-26)

The calibrated remainder couldn't be bulk-swept (recorded below in the
original analysis); it needed four DESIGN-SYSTEM decisions, all landed:

1. **`--aa-text-2xs: 0.625rem`** (fixed) — a sub-xs micro step for badge
   labels, glyph counters, tiny overlines. The sidebar's CURRENT LENS overline
   keeps its exact 10px; the search PRO badge grows 8→10; TaskRow's ✓ glyph
   grows 9→10 (its dot grows with it, so the pairing holds).
2. **`--aa-text-on-scrim` + `--aa-wash-on-primary`** — constant whites for
   content on dark scrims / brand surfaces. Replaces Overlays.css's
   "the one place a raw color is allowed" exception with tokens.
3. **`--aa-radius-none: 0`** — structural squares (share page's ghost inputs,
   settings' flush footer bar) are expressible. Off-grid radii snapped:
   7px→sm, 10px→md (task title input + textarea together), 2px→xs.
4. **Marketing type joined the fluid scale** — publicLayout (14 raw sizes),
   onboarding (16), founding100 (6) mapped by numeric proximity + semantics;
   the desktop/mobile media-query sisters were deleted (the clamp ramps cover
   them). Heroes read slightly smaller at wide viewports (44→40px at the
   2xl cap) — the collapse's recorded, accepted trade.

Also: the gate's own comment blessed em-relative font sizes but its regex
still flagged them — em is now exempt (logbook's `0.85em` code chips track
their clamp-sized parent by design).

## Landed in

- `004b394` — token additions, gate fix, in-app surfaces (51 → 36)
- `450a7b7` — marketing surfaces (36 → 0)

Visual pass per surface: app shell (overline/PRO/FAB), welcome/onboarding,
founding-100, public markdown — hierarchy intact, nothing broken.

## Original analysis (kept for the record)

The remainder could not be bulk-swept mechanically, for three reasons:

1. **The type scale was calibrated to collapse, not to match.** Mapping
   0.95rem → base, 17px → lg etc. changes rendered size slightly — a
   deliberate visual change belonging to `docs/DESIGN-SYSTEM.md`, not a lint
   fix. (Resolved by decision 4.)
2. **The off-scale radii had no token.** `0`, `2px`, `7px`, `10px` needed new
   tokens or a snap decision. (Resolved by decision 3.)
3. **Three raw colors needed tokens that didn't exist yet**: the constant
   light-on-ink `#fff` ×2 (Overlays × on a capture attachment's dark chip)
   and a white-alpha tint (app-shell keycap wash). (Resolved by decision 2.)
