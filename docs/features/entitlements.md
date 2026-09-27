---
slug: entitlements
title: "Entitlement enforcement (server caps + ProGate paywall)"
feature_area: billing
status: shipped
spec: entitlement-enforcement.md   # done
verified: 2026-09-26
---

# Entitlement enforcement

**What.** The free-tier caps in PRICING.md §4 enforced server-side (the billing
boundary) + surfaced as calm "Pro feature" paywall moments client-side. Uses a
central effective-access resolver (`resolveEffectiveAccess`): expired PRO →
FREE, while admin and internal Pro/Founder/Friend grants are entitled without
rewriting Stripe plan data.

**Caps enforced** (`FREE_LIMITS = { projects: 3, goals: 1,
logbookHistoryDays: 14 }`):
- `createProject` — under-cap (3 projects/lens).
- `createGoal` — under-cap (1/lens).
- `triageInboxItem` — lens + project-cap when converting to project; parsed
  #tags skipped for FREE (`allowTags: false`).
- Lens-scoped reads via `assertLensAllowed`: FREE reads the two SEEDED lenses
  (Me + Work, keyed on the seed flags `isIncluded`/`isDefault` — never the
  name); custom lenses are Pro-only. Lens configuration stays Pro-only.
- Logbook read: `historyDays=14` for FREE (read-time only — nothing deleted);
  Pro unlimited.
- Whole-feature 402 gates: Rituals, Tags (`assertTagsAllowed`), command
  palette/search, CLI + PATs.

**Client.** `<ProGate>` — inline panel (lens gate, post-402 fallback) and
`asTrigger` (at-cap create affordance). Links to `/settings/billing` +
`/founding-100`.

**Files.** `packages/domain/src/billing/` (`entitlements.ts`, `config.ts`);
`api/src/procedures/*` (the 402 mapping);
`web/src/lib/components/ui/ProGate.svelte`.

**Done?** Shipped (entitlement-enforcement spec, done 2026-07-03; caps
amended 2026-09-26 per PRICING.md §8). Unblocks an accurate privacy policy
(legal-pages-oauth hedged its data-retention clause).
