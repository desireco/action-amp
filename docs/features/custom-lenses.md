---
slug: custom-lenses
title: "Custom Lenses (user-defined contexts)"
feature_area: foundation
status: shipped
spec: custom-lenses.md
verified: 2026-07-05
---

# Custom Lenses

**Shipped 2026-07-03–05.** User-defined lenses beyond the seeded Work/Me, with
per-lens identity color, kind taxonomy, and Pro-tier CRUD.

**Today.** Full CRUD on `/do/settings/lenses` (Pro), seeded kinds +
purpose in onboarding + `getAppData`, adaptive switcher (chip+popover at ≥4
lenses) with `⌘L`, active-lens state keyed by `id` (not name), entitlement
gated on `LensKind` (Work lens visible-but-locked for FREE). Six curated hue
ramps in `tokens.css`. FREE gets a `<ProGate>` moment on the Work lens + lens
config. `isAdmin` staff/dev bypass in the entitlement layer for testing.

**Spec.** `docs/specs/done/custom-lenses.md` (shipped); review at
`docs/reviews/custom-lenses.md`.

**Why it matters.** Lenses are the top of the ActionAmp hierarchy
(Lens → Goal → Project → Task). Custom lenses let a user model multiple
contexts (Work / Me / Side-project) with calm visual identity, without
diluting the focus loop — the active lens still scopes What Now to one
context at a time.
