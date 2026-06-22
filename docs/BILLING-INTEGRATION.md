# ActionAmp — Billing Integration Plan (Stripe)

> Status: PLAN v1 — not implemented. Companion to `PRICING.md` (the pricing
> *decisions*) and `FEATURES.md` (the feature caps). This file is the
> **implementation plan**: architecture, schema, endpoints, settings structure,
> and a phased build order.
> Authority for *how* billing is built. `PRICING.md` remains authority for *what*
> it costs.

---

## 0. TL;DR

- **Engine: Stripe (DECIDED).** The maker already uses Stripe.
- **No Wasp built-in payments.** Wasp 0.24 has no payment/subscription support
  in the framework (no spec constructor, no docs section, no SDK refs). We wire
  Stripe ourselves using Wasp's `api` constructor for the webhook + server
  actions for Checkout. This is standard Stripe; nothing exotic.
- **Stripe-hosted UI, minimal custom payment UI.** We use **Checkout Sessions**
  for upgrades and the **Customer Portal** for self-service management (cancel,
  card, invoices). We build almost no payment form UI ourselves — just buttons
  that create sessions and redirect.
- **Webhook is the source of truth** for entitlement. Client-facing actions only
  create sessions; the `User.plan` field is only ever mutated by verified webhook
  handlers. Never trust the client for who-is-pro.
- **Settings grows a Billing section.** Full structure in §5.

---

## 1. The architectural bet (and why it's low-risk)

```
 ┌─────────────┐         ┌──────────────────────┐         ┌──────────┐
 │  Browser    │         │  Wasp server (Node)  │         │  Stripe  │
 │ (our React) │         │                      │         │          │
 │             │  1. click "Upgrade"            │         │          │
 │  action:    │ ───────▶│ createCheckoutSession │         │          │
 │  upgrade()  │         │  (our server action)  │ ───────▶│ Checkout │
 │             │◀────────│  return { url }       │         │  Session │
 │  2. redirect│         │                      │         │          │
 │  to Stripe  │─────────┼──────────────────────┼─────────▶│ hosted   │
 │             │         │                      │         │  page    │
 │             │         │                      │  3. pay  │          │
 │             │         │                      │◀─────────│          │
 │             │         │  4. webhook → /webhooks/stripe │          │
 │             │         │  (verify sig, mutate User.plan)│          │
 │             │         │◀────────────────────────────────│          │
 └─────────────┘         └──────────────────────┘         └──────────┘
```

**Why this shape:**

- **Stripe hosts the money UI.** We never touch card numbers → trivial PCI scope
  (SAQ-A), fewer bugs, Stripe handles Apple Pay / 3DS / currencies / receipts.
- **The webhook owns truth.** A user "paying" and our DB learning about it are
  decoupled. If the checkout redirect fails, the user's session is still updated
  when the (retriable) webhook fires. No "I paid but it says free" tickets.
- **Two payment flows, both native Stripe:**
  - **Recurring Pro ($79.50/yr) + Monthly ($12.95/mo)** → Stripe **Subscriptions**.
  - **Prepaid annual ($90, non-recurring)** →
    one-time **Checkout payments** that grant a dated 12-month entitlement. See §4 for how these map to entitlement states.

---

## 2. Schema additions (the load-bearing change)

Add subscription state to the **`User`** entity (a dedicated `Subscription`
model is overkill for a solo launch — one field + two timestamps is enough).

```prisma
// In schema.prisma — model User
model User {
  id        String @id @default(uuid())
  firstName String
  lastName  String

  // ---- Billing (Stripe) ----
  plan            Plan   @default(FREE)
  stripeCustomerId String?  // set on first checkout; links to Stripe customer
  planRenewsAt     DateTime?  // null for FREE; set by webhook for PRO
  // NOTE: history/invoices live in Stripe (via the Customer Portal). We don't
  // duplicate them.
  tasks Task[]
  tags  Tag[]
}

enum Plan {
  FREE       // default; personal scope, 3 projects, 1 goal
  PRO        // recurring or prepaid active; full features
}
```

**Why an enum + `planRenewsAt` instead of a richer model:**

- Two states is all the UI cares about: FREE / paying-now.
- `planRenewsAt` lets us (a) show "renews on X", (b) detect prepaid-expiry, (c)
  serve the focus engine's "is this user pro *right now?*" check with one read.
- A cron can scan for `plan=PRO && planRenewsAt < now` to expire prepaid terms
  to FREE — or the webhook's `invoice.payment_failed` / subscription end events
  handle it live.

> *(The `FOUNDER` enum value and lifetime-entitlement path were removed
> 2026-06-22 — see PRICING.md §3 Model C.)*

> ⚠️ **Graceful degrade (from PRICING.md):** when a prepaid year ends and the
> user drops FREE, they will *exceed* the cap (more than 1 goal / 3 projects /
> work lens). The cap-enforcement layer must **soft-lock** the excess (read-only,
> "upgrade to edit") rather than delete it. Design this into the operations
> guard in §3 before billing ships — it's the easiest thing to forget.

---

## 3. The cap-enforcement boundary (security-critical)

Every operation that *creates* capped resources must check the plan **server-side**:

```ts
// src/billing/guards.ts (illustrative — not committed)
import { HttpError } from "wasp/server";
import type { Plan } from "@prisma/client";

const FREE_LIMITS = { projects: 3, goals: 1, workLens: false };

export async function assertCanCreateProject(context) {
  if (context.user!.plan === "FREE") {
    const count = await context.entities.Project.count({
      where: { userId: context.user!.id },
    });
    if (count >= FREE_LIMITS.projects) {
      throw new HttpError(402, { message: "Free plan allows 3 projects. Upgrade for unlimited." });
    }
  }
}
```

Rules:

- **Always check `context.user.plan` on the server**, never the client. The
  client only *reads* the plan for UI (dim locked things, show upgrade prompts).
- Use HTTP **402 Payment Required** for cap hits — the client maps that to an
  upgrade prompt, not a generic error.
- Work-lens access is gated the same way (`FREE → workLens=false`).

---

## 4. The entitlement state machine (who can do what, when)

| Event (from webhook) | `User.plan` | `planRenewsAt` | Client effect |
|---|---|---|---|
| New signup | `FREE` | null | personal scope, 3 projects |
| Recurring Pro `invoice.paid` | `PRO` | +1 year | full features, "renews on X" |
| Monthly `invoice.paid` | `PRO` | +1 month | full features, "renews on X" |
| Prepaid $90 checkout paid (once) | `PRO` | +1 year | full features, "expires on X" (no auto-renew) |
| `invoice.payment_failed` | grace → `FREE` | past | soft-lock excess (§2) |
| Subscription cancelled at portal | `PRO` until period end → `FREE` | unchanged until end | "your plan ends on X" |
| Prepaid year elapsed (no renewal) | `FREE` | past | soft-lock excess |

**Stripe product/pricing mapping** (configure in Stripe Dashboard, reference by
price ID in env vars — §6):

- `price_pro_yearly` → recurring $79.50/yr (Subscription)
- `price_pro_monthly` → recurring $12.95/mo (Subscription)
- `price_pro_prepaid` → one-time $90 (12-month entitlement)

> *(A `price_founder` / `FOUNDER` plan was designed but removed 2026-06-22 before
> launch — see PRICING.md §3 Model C. No Stripe product for it exists.)*

---

## 5. Settings — full structure (DECIDED: sub-routes)

Settings is a hub with **sub-routes** (confirmed 2026-06-16). Billing needs its
own page anyway because of Stripe redirects and plan cards; sub-routes keep it
shareable/bookmarkable and let each page stay focused.

```
/app/settings            → Account        (hub: identity + danger zone)
/app/settings/billing    → Billing        (the Stripe-facing page)
/app/settings/preferences → Preferences   (app behavior)
```

The existing `SettingsPage` (`/app/settings`) becomes **Account**. A shared
`SettingsLayout` renders a sub-nav (Account · Billing · Preferences) above the
active page's content, inside the AppShell. The account-name link in the
sidebar opens the Account hub.

### 5.1 Account (`/app/settings`) — mostly exists

- **Name** (first/last) — editable (today it's read-only; add edit action)
- **Email** — change via Wasp's email-auth flow
- **Password** — change / reset
- **Sign out**
- **Delete account** ⚠️ — must cancel any Stripe subscription first (Stripe
  customer deletion via API, or mark sub for cancellation at period end). This
  is a real requirement, not a nicety — otherwise orphan subs keep charging.

### 5.2 Billing (`/app/settings/billing`) — NEW, the centerpiece

Three view-states, all server-driven off `User.plan`:

**FREE user — the upgrade screen (layout simplified 2026-06-22):**

A calm 3-card layout (Yearly recommended / Monthly / Prepaid). Yearly carries
the "Best value" badge; the others are equal-weight. No founder hero, no
scarcity framing — the page embodies the "calm focus" brand.

```
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│  Monthly       │ │  Yearly        │ │  Prepaid       │
│  $12.95 / mo   │ │  $79.50 / yr   │ │  $90 / yr      │
│  No commit.    │ │  Best value ★  │ │  No auto-renew │
│  [Choose plan] │ │  [Choose plan] │ │  [Choose plan] │
└────────────────┘ └────────────────┘ └────────────────┘

[ Current: Free · 3 projects used of 3 ]      ← usage vs caps
```

- Each tappable plan = a server action creating a Checkout Session → redirect to
  Stripe. No payment form on our side.
- Usage row ("3 projects used of 3") under the plans shows where they are vs the
  free cap — motivates the upgrade.
- *(A founder-hero layout was designed 2026-06-16 but reversed 2026-06-22 when
  the Founder tier was dropped — see PRICING.md §3 Model C.)*

**PRO user:**

- Plan badge ("Pro"), since when, renews/expires date.
- **"Manage billing"** button → creates a **Customer Portal Session** → redirect.
  Portal handles card changes, invoices, cancel, download receipts. We build none
  of that UI.
- Cancel link (portal handles it; we just surface the entry point).

**Dropped-to-FREE (recent expiry / cancelled):**

- Honest state: "Your Pro plan ended on X. You're back on Free." + the upgrade
  screen above. Soft-locked resources (§2) get a one-time banner explaining
  what's read-only until they re-up.

### 5.3 Preferences (`/app/settings/preferences`) — Phase 2-ish

- Theme (dark default — F24)
- Today cap (default 5, configurable, off — F12)
- Completion sounds, momentum toggle (F17)
- *(Lenses / Shortcuts management = Phase 2 per PAGES §5 — stubs for now.)*

---

## 6. Files & config we'll add (implementation map)

```
webapp/
├── schema.prisma                      # + Plan enum, plan/stripeCustomerId/planRenewsAt on User
├── main.wasp.ts
│     + apiNamespace("/webhooks", { middleware: rawBody })  # raw body for signature verify
│     + api("POST", "/webhooks/stripe", stripeWebhook)       # the only mutation path
│     + query(getBillingStatus)                              # client reads plan + usage
│     + action(createCheckoutSession, { entities:[], auth:true })
│     + action(createPortalSession,    { entities:[], auth:true })
└── src/
    ├── billing/
    │   ├── operations.ts        # getBillingStatus, createCheckoutSession, createPortalSession
    │   ├── webhook.ts           # stripeWebhook: verify sig, handle events (§4)
    │   ├── guards.ts            # assertCanCreateProject/Goal/Lens (§3) — used by feature code
    │   ├── stripe.ts            # stripe client init + price-id lookups from env
    │   └── config.ts            # plan/limit constants (single source of truth)
    ├── app/
    │   ├── BillingPage.tsx      # /app/settings/billing — the plan cards + portal button
    │   ├── BillingPage.css
    │   └── SettingsLayout.tsx   # shared Account/Billing/Preferences sub-nav + shell
    └── (feature ops import billing/guards)

.env.server  (gitignored):
  STRIPE_SECRET_KEY=rk_...        # RESTRICTED key (rk_), never sk_ — see §8
  STRIPE_WEBHOOK_SECRET=whsec_... # per-endpoint, from Stripe CLI (dev) / Dashboard (prod)
  STRIPE_PRICE_PRO_YEARLY=price_...
  STRIPE_PRICE_PRO_MONTHLY=price_...
  STRIPE_PRICE_PRO_PREPAID=price_...
  STRIPE_PRICE_CURRENCY=usd
  # optional dev: STRIPE_CLI=true toggles localhost forwarding notes

.env / client-safe:
  STRIPE_PUBLISHABLE_KEY=pk_...   # only needed if we later use Stripe.js/Elements (we don't, yet)
```

**Stripe npm dep:** `stripe` (server only). No client Stripe lib required for
hosted Checkout + Portal (it's a redirect). Add `stripe` to
`webapp/package.json` deps (Wasp manages deps via package.json — see
`project/dependencies.md`).

---

## 7. Phased build order (how to actually ship this)

**Phase 0 — Groundwork (no Stripe calls yet)**

1. Schema: add `Plan` enum + the three billing fields. Migrate (`wasp db
   migrate-dev --name billing_fields`). Seed existing users as `FREE`.
2. `billing/config.ts` + `billing/guards.ts`: the cap rules + server guards.
   Wire guards into the *current* Task/Project/Goal operations (when they exist)
   so enforcement is real before billing is wired.
3. Refactor SettingsPage → Account; add SettingsLayout + `/app/settings/billing`
   - `/app/settings/preferences` routes (billing/preferences as stubs).

**Phase 1 — Checkout (taking money)**
4. Stripe account setup: create 3 Prices in the Dashboard; grab price IDs into
   `.env.server`.
5. `createCheckoutSession` action (auth:true) → maps a plan choice to a price
   ID, reuses/creates the Stripe customer (`stripeCustomerId`), returns a Stripe
   URL. Client redirects.
6. BillingPage FREE-state: plan cards → call action → redirect. **Test with
   Stripe CLI + test cards.**

**Phase 2 — Webhook (the truth)**
7. `apiNamespace("/webhooks", rawBody)` + `api("POST","/webhooks/stripe", ...)`.
8. Verify signature with `STRIPE_WEBHOOK_SECRET`; on `checkout.session.completed`

- `invoice.paid` + `invoice.payment_failed` + `customer.subscription.deleted`,
   mutate `User.plan`/`planRenewsAt` per §4. **Idempotency:** key off the Stripe
   event id so retries don't double-mutate.

1. `getBillingStatus` query → client reads plan + usage for the right BillingPage
   state.

**Phase 3 — Portal & cleanup**
10. `createPortalSession` action → BillingPage PRO-state "Manage billing".
11. Account deletion cancels Stripe sub first.
12. Graceful-degrade UX: soft-lock banner for expired prepaid/cancelled.

**Phase 4 — Polish**
14. Email receipts/renewal notices (via Resend, already wired) triggered from
    webhook events.
15. Usage metering UI ("3 of 3 projects") on BillingPage.

---

## 8. Security & gotchas checklist (load before coding)

- **Restricted API key (`rk_`), not secret key (`sk_`).** Scope it to exactly the
  resources we use (Customers, Checkout Sessions, Customer Portal, Subscriptions,
  Prices read, Webhook Endpoints). Rotate on incident.
- **Verify the webhook signature on every request** with the endpoint-specific
  `whsec_`. Reject on any failure. The webhook is the *only* place `plan`
  changes — if it's forgeable, billing is broken.
- **Raw request body for verification.** Wasp's JSON middleware will parse the
  body; signature verification needs the raw bytes. Use `apiNamespace` with a
  middleware that captures `req.rawBody` for the `/webhooks` group (the Wasp docs
  explicitly cite this as the use case for `apiNamespace`). **This is the #1
  integration gotcha — verify it works in dev before trusting the handler.**
- **Idempotency:** Stripe retries webhooks. Store processed event ids (a small
  `StripeEvent` table or a `processedStripeEventIds String[]` on User) and skip
  duplicates.
- **Never mutate `plan` from a client action.** Checkout actions only *create
  sessions*; the webhook alone changes entitlement.
- **Test mode end-to-end** via Stripe CLI (`stripe listen --forward-to
  localhost:3001/webhooks/stripe`) before any prod key touches the app.
- **Delete-account → cancel sub** (§5.1). Orphan subscriptions = chargebacks.
- **Clock skew:** Stripe event timestamps vs server time — compare in UTC.

---

## 9. Open decisions (before Phase 1)

1. ~~**Settings nav shape**~~ — **DECIDED: sub-routes.** See §5.
2. ~~**Billing page layout**~~ — **DECIDED: calm 3-card layout** (Yearly /
   Monthly / Prepaid). See §5.2. *(A founder-hero layout was reversed 2026-06-22
   when the Founder tier was dropped — see PRICING.md §3 Model C.)*
3. **Trial?** None planned (free tier is forever, feature-capped). Confirm we
   never want a time-limited Pro trial.
4. **Currency:** USD only at launch? *(lean: yes, USD only; expand later.)*
5. **Taxes:** Stripe Tax on/off? *(lean: off at launch for simplicity; on when
   revenue justifies it.)* *(Now enabled in checkout via `automatic_tax` as of
   the 2026-06-22 checkout hardening — revisit whether this satisfies §9.)*
