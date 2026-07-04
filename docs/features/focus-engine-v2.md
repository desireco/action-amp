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
2026-07-03). The review found three definition gaps:

1. **Depends on a tag-management UI that doesn't exist.** The matcher leans on
   reserved tag names (`~15m`, `low-energy`, …) but there's no tag UI today —
   tags are only created via `@`-parsing at triage. The missing UI is a
   prerequisite, not an open question. Tracked as a spec to write
   (`tag-management`).
2. **The moment bar is under-designed for the home screen.** Placement, format,
   collapse, default-inference left to Build — too much undefined for the
   wedge surface. A mockup must be locked before `ready`.
3. **The fallback-invariant test claim is wrong.** Adding within-tier re-rank
   changes the comparator; existing tests need rewriting, not re-passing.

**Gate (still in force):** the matcher-validation manual test must reach a
BUILD verdict before this pulls.

**Why it matters.** This + the transparent "why this?" line is what makes the
$79.50 price coherent. Until the matcher surprises, the price is "off the
category's curve."

