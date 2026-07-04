---
slug: focus-engine-v2
title: "Focus engine v2 (moment-aware matcher)"
feature_area: focus
status: missing
spec: focus-engine-v2.md          # ready — GATED
verified: 2026-07-03
---

# Focus engine v2

**Wanted.** The moment-aware matcher: time-available + energy refinement **on
top of** the existing priority sort (FEATURES.md F10's planned layer). Re-ranks
*within* a priority tier only — never demotes priority. Pro-gated.

**Today.** The shipped `getTopTask` is an honest priority sort (priority → size
→ age). No moment/energy factor.

**Spec.** `docs/specs/focus-engine-v2.md` (`ready`, **gated**).

**⚠ Gate (must run first):** the zero-cost ~20-person manual matcher test —
`docs/research/matcher-test-runbook.md`. The roast found the matcher is the only
real moat but currently the weakest shipped part. The test decides: build
as-spec'd, reshape, or icebox. **Do not build before the test produces a
signal.**

**Why it matters.** This + the transparent "why this?" line is what makes the
$79.50 price coherent. Until the matcher surprises, the price is "off the
category's curve."
