---
slug: billing
title: "Billing (3 Pro prices + Founding 100, server-enforced cap)"
feature_area: billing
status: shipped
spec: —              # predates duet
verified: 2026-07-03
---

# Billing

**What.** Live Stripe billing. Three Pro prices: Monthly $12.95/mo, Yearly
$79.50/yr (recommended), Prepaid $90/yr (no renew). Plus **Founding 100**
$99 lifetime, capped at 100 spots.

**Founding 100 cap** — server-enforced in `createCheckoutSession`: counts
`plan:FOUNDER` users, throws `HttpError(409)` when claimed ≥ 100. Status exposed
via `getFounding100Status`. Landing `/founding-100` shows live spots-remaining
and locks the CTA when full.

**Webhook is source of truth.** Client never mutates `plan`; the Stripe webhook
sets it. `FreeUpgradeScreen` (FREE users) shows the 3 Pro cards + the caps.
Active plan users get `ActivePlanState` with a Stripe-portal "Manage billing"
button. Payment history table present.

**Files.** `app/BillingPage.tsx`; `billing/config.ts`; `billing/operations.ts`;
`public/Founding100Page.tsx`.

**Done?** Shipped. Plan enum `FREE | PRO | FOUNDER`.

**Non-code gate (user-owned, GTM §B):** confirm Stripe prod keys (not test) +
the webhook endpoint is registered in the Stripe dashboard at
`api.actionamp.com/webhooks/stripe`.
