---
slug: focus-engine-v2
title: "Focus engine v2 (moment-aware matcher)"
feature_area: focus
status: missing
spec: focus-engine-v2.md          # draft — flipped from ready 2026-07-03
depends_on: tag-management.md     # the moment tags need a UI that doesn't exist
gated_by: matcher-validation.md   # the manual matcher test must reach BUILD first
verified: 2026-07-03
---

# Focus engine v2

**Wanted.** The moment-aware matcher: time-available + energy refinement **on
top of** the existing priority sort (FEATURES.md F10's planned layer). Re-ranks
*within* a priority tier only — never demotes priority. Pro-gated.

**Today.** The shipped `getTopTask` is an honest priority sort (priority → size
→ age). No moment/energy factor.

**Spec.** `docs/specs/focus-engine-v2.md` — **`draft`** (flipped from `ready`
2026-07-03). The review found three definition gaps; **two are now resolved**:

1. **Depends on a tag-management UI that doesn't exist.** The matcher leans on
   reserved tag names (`~15m`, `low-energy`, …) but there's no tag UI today.
   **Resolution: `tag-management` spec is now `ready`** — ships first, then
   this can pull.
2. ~~**The moment bar is under-designed for the home screen.**~~ **RESOLVED
   2026-07-04** — mockup locked at `docs/mockups/moment-bar.html`. Placement
   (above card), format (two segmented controls), collapse (default-collapsed
   to one quiet line), inference (time-of-day, stated explicitly) all decided.
3. ~~**The fallback-invariant test claim is wrong.**~~ **RESOLVED 2026-07-04**
   — done-condition rewritten (existing tests updated, not re-passed).

**Only the matcher-test gate remains** (plus `tag-management` shipping).
Run `docs/specs/matcher-validation.md` → BUILD verdict → pull.

**Why it matters.** This + the transparent "why this?" line is what makes the
$79.50 price coherent. Until the matcher surprises, the price is "off the
category's curve."

