---
slug: entitlements
title: "Entitlement enforcement (server caps + ProGate paywall)"
feature_area: billing
status: shipped
spec: entitlement-enforcement.md   # done
verified: 2026-07-03
---

# Entitlement enforcement

**What.** The free-tier caps in PRICING.md §4 enforced server-side (the billing
boundary) + surfaced as calm "Pro feature" paywall moments client-side. Uses a
central effective-access resolver: expired PRO → FREE, while admin and internal
Pro/Founder/Friend grants are entitled without rewriting Stripe plan data.

**Caps enforced** (`FREE_LIMITS = { projects: 3, goals: 1, workLens: false }`):
- `createProject` — under-cap (3 projects/lens).
- `createGoal` — under-cap (1/lens).
- `triageInboxItem` — lens + project-cap when converting to project.
- Lens-scoped reads via `assertLensAllowed`: `getTasks`, `getDoneToday`,
  `getTopTask`. FREE = Me lens only (Work visible-but-locked).

**Client.** `<ProGate>` (`components/ui/ProGate.tsx`) — inline panel (Work-lens
gate, post-402 fallback) and `asTrigger` (at-cap create affordance). Links to
`/do/settings/billing` + `/founding-100`.

**Files.** `billing/entitlements.ts`; `billing/entitlementHttp.ts`;
`billing/useEntitled.ts`; `components/ui/ProGate.tsx`.

**Done?** Shipped (entitlement-enforcement spec, done 2026-07-03). Unblocks an
accurate privacy policy (legal-pages-oauth hedged its data-retention clause).
