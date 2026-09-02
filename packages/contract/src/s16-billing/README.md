# S16 — Billing + entitlements (P0 parity notes)

> Pre-study header for the platform-switch port. Sources read: `webapp/src/billing/`
> (`config.ts`, `stripe.ts`, `operations.ts`, `webhook.ts`, `webhookMiddleware.ts`,
> `entitlements.ts`, `entitlementHttp.ts`, `entitlement-types.ts`, `statusMiddleware.ts`,
> `useEntitled.ts`, `entitlements.ops.test.ts`, `webhook.test.ts`, `operations.test.ts`),
> `webapp/e2e/entitlements.spec.ts`, `webapp/main.wasp.ts` (billing ops + `/webhooks/stripe`
> + `/founding-100/status`), `webapp/schema.prisma` (`Payment`, `Plan`, `PaymentStatus`,
> `ManualAccessGrant`, User billing fields), `docs/BILLING-INTEGRATION.md`,
> `docs/PRICING.md`, `docs/features/billing.md`, the gate call sites in
> `goals|projects|tasks|lenses|inbox|resources|search|simpleLists|logbook/operations.ts`
> + `auth/cliMint.ts` + `auth/patRoutes.ts` + `auth/patMiddleware.ts`. This file is the
> checklist the port is verified against. (There is no `webapp/BILLING-INTEGRATION.md`;
> the doc lives at `docs/BILLING-INTEGRATION.md` only.)

## 1. Routes / endpoints / operations

| Surface | Method + path (or Wasp op) | Auth | Purpose |
|---|---|---|---|
| Stripe webhook | `POST /webhooks/stripe` (`stripeWebhook`, `webhook.ts`) | Stripe signature (`stripeWebhookMiddleware` swaps `express.json` → `express.raw({type:"*/*"})`) | The ONLY writer of `User.plan` / `planRenewsAt`. Signature-verified; idempotent. |
| Checkout | Wasp action `createCheckoutSession` (`billing/operations.ts`) | session (`auth: true`) | Creates a Stripe Checkout Session, returns `{ url }`. Never mutates `plan`. |
| Customer portal | Wasp action `createCustomerPortalSession` | session | Stripe Billing Portal session, returns `{ url }`. |
| Billing status | Wasp query `getBillingStatus` | session | `{ plan, planRenewsAt, isPaid, isFounder, payments }` — payments = last 50, `createdAt desc`. |
| Founding-100 status (query) | Wasp query `getFounding100Status` | **public** (`auth: false`) | `{ cap: 100, reserved: 2, claimed, remaining, isFull }`. |
| Founding-100 status (REST) | `GET /founding-100/status` (`founding100StatusHandler`) | public + `publicStatusMiddleware` (CORS widened to `https://actionamp.com`, `Cache-Control: public, max-age=60`) | Same payload as the query, for the Astro marketing site. |
| Billing page | `/do/settings/billing` (`BillingPage`) | session | FREE → 3-card upgrade; PRO/FOUNDER → plan badge + "Manage billing" (portal); expired → honest drop-to-Free state. |
| Founding-100 landing | `/founding-100` + `/founding-100/welcome` | public | Live spots-remaining; CTA locked when `isFull`; thank-you page is the founder checkout `success_url`. |
| CLI gate | `patMiddleware` + `patRoutes.ts` + `cliMint.ts` | PAT | `cliAccessViolation` → 402 `{error, feature, reason}` before ANY `/api/cli/*` route (see S18). |

Checkout URL flows (exact):
- `priceKey` ∈ `"proYearly" | "proMonthly" | "proPrepaid" | "founder"`.
- Recurring (yearly/monthly) → `mode: "subscription"`, `line_items: [{price: getPriceId(key), quantity: 1}]`,
  `subscription_data.metadata = { userId, priceKey }`. One-time (prepaid/founder) →
  `mode: "payment"` + `invoice_creation: { enabled: true }`. Founder charges inline
  `price_data` (`usd`, `FOUNDING_100_PRICE_CENTS = 9900`, product name
  `"Founding 100 — Lifetime Pro"`) — no dashboard Price object.
- `success_url`: founder → `${WASP_WEB_CLIENT_URL}/founding-100/welcome`; others →
  `${origin}/do/settings/billing?checkout=success`. `cancel_url`: founder → `${origin}/founding-100`;
  others → `${origin}/do/settings/billing?checkout=cancelled`.
- Session `metadata: { userId, priceKey }`; `allow_promotion_codes: true`; `automatic_tax` OFF.
- Customer: reuse `User.stripeCustomerId`, else create Stripe customer with
  `metadata: { userId }` and persist the id.
- Founder cap enforcement server-side: count users matching
  `FOUNDER_MEMBERSHIP_WHERE` = `OR: [{plan:"FOUNDER"}, {manualAccessGrant:"FOUNDER"}]`;
  `claimed >= 98` (PUBLIC cap = 100 − 2 partner reserve) → `HttpError(409, "All public
  Founding memberships have been claimed.")`. Soft cap, per-request count, no lock.
- Portal: `billingPortal.sessions.create({ customer: stripeCustomerId, return_url:
  ${origin}/do/settings/billing })`. No `stripeCustomerId` → throws
  `"No billing account found for this user."`.
- `CHECKOUT_STARTED` analytics event recorded (fire-and-forget) with
  `route: "/founding-100"` (founder) or `"/do/settings/billing"`.

## 2. Data shapes

**User billing fields (schema.prisma):** `plan Plan @default(FREE)`,
`stripeCustomerId String?`, `planRenewsAt DateTime?` (null for FREE + FOUNDER),
`isAdmin Boolean @default(false)` (staff bypass), `manualAccessGrant ManualAccessGrant?`
(`PRO | FOUNDER | FRIEND`) + `manualGrantAt`.

**Enums:** `Plan { FREE PRO FOUNDER }`; `PaymentStatus { PENDING SUCCEEDED FAILED REFUNDED }`.

**Payment model:** `id, createdAt, userId (SetNull on user delete — reconciliation
history survives account deletion), stripePaymentIntentId @unique, stripeInvoiceId @unique,
stripeCheckoutSessionId (not unique), amount Int (cents), currency @default("usd"),
plan Plan, description String, status PaymentStatus @default(PENDING), paidAt DateTime?`.

**Entitlement core (`billing/config.ts` constants — copy exactly):**
- `FREE_LIMITS = { projects: 3, goals: 1, workLens: false }` (per **lens**, counted on
  **non-done** entities only).
- `PRO_LIMITS = { lenses: 8 }` (soft cap; FREE has no lens count — it has a hard set:
  the two seeded, Me usable + Work visible-but-locked).
- `isPaidPlan(plan)` = `PRO | FOUNDER`; `isPlanActive`: FOUNDER always true; PRO true
  iff `planRenewsAt > now` (expired PRO behaves as FREE); FREE false.
- `PLAN_LABEL`: Free / Pro / Founding Member.
- Founding 100: `CAP=100`, `LAUNCH_PARTNER_RESERVE=2`, `PUBLIC_CAP=98`,
  `PRICE_CENTS=9900`.

**Entitlement messages (exact copy — these strings reach users in 402 bodies):**
- `WORK_LENS_MESSAGE = { feature: "another Lens", reason: "organize more areas of your life with Pro" }`
- `CUSTOM_LENSES_MESSAGE = { feature: "Custom lenses", reason: "add more life contexts — a Studio, a side project, a board role — with Pro" }`
- `CLI_ACCESS_MESSAGE = { feature: "CLI and API access", reason: "use ActionAmp from the terminal or with an agent" }`
- `SITEWIDE_SEARCH_MESSAGE = { feature: "Command palette and search", reason: "find and move through all your ActionAmp work from one place" }`
- Cap messages (inline at call sites): projects `{ feature: "a 4th project", reason:
  "organize more than 3 projects with Pro" }`; goals `{ feature: "a 2nd goal", reason:
  "link work to more than one outcome with Pro" }`; Pro lens cap `{ feature: "a 9th lens",
  reason: "more life contexts unlock with Pro" }` (built from
  `` `a ${PRO_LIMITS.lenses + 1}th lens` `` in `lenses/operations.ts`).

**402 response body shape (both HttpError path and PAT path):**
`{ error: "<feature> is a Pro feature.", feature: <feature>, reason: <reason> }`.

**PRICING_ENTITLEMENT (webhook.ts priceKey map):** `pro_yearly` → PRO +365d "Pro Yearly";
`pro_monthly` → PRO +30d "Pro Monthly"; `pro_prepaid` → PRO +365d "Pro Prepaid (12 mo)";
`founder` → FOUNDER `renewalMs: null` (planRenewsAt stays null) "Founding 100 (lifetime)".

## 3. Behaviors — webhooks, gates, edge cases

### 3.1 Stripe webhook (`stripeWebhook`) — every event + effect

Guard rails: `STRIPE_WEBHOOK_SECRET` unset → **500** "Webhook secret not configured.";
Stripe client null → **500** "Stripe client not configured."; missing `stripe-signature`
header → **400** "Missing stripe-signature header."; bad signature → **400**
`Webhook Error: <msg>`; handler throw → **500** "Webhook handler error."; unknown event
type → logged + **200** (no mutation). Success → **200** `{ received: true }`. Raw body
must be bytes (Buffer) for `constructEvent` — the express.raw middleware is load-bearing.

| Event | Behavior |
|---|---|
| `checkout.session.completed` | `mode === "subscription"` → skip (invoice.paid owns it). Missing `metadata.userId`/`priceKey` → skip+log. Already a Payment with this `stripeCheckoutSessionId` → skip (idempotency). Unknown priceKey → skip+log. Else: `User.update({ plan, planRenewsAt: renewalMs ? now+renewalMs : null, stripeCustomerId: session.customer })`, create Payment (`amount: amount_total ?? 0`, `currency ?? "usd"`, status SUCCEEDED, `paidAt: now`, both stripe ids), fire `PAYMENT_CONFIRMED` analytics. |
| `invoice.paid` | Idempotency on `stripeInvoiceId`. Resolve priceKey+userId from the invoice's subscription metadata (one `subscriptions.retrieve` call; on failure fall back to first invoice line's `price.metadata.actionamp_plan`, then to customerId lookup via `User.stripeCustomerId`); no userId resolvable → skip+log. Unknown priceKey → PRO defaults ("Pro Subscription", +30d). `User.update({ plan, planRenewsAt: FOUNDER ? null : now+renewalMs })` + Payment row (amount `amount_paid ?? 0`) + `PAYMENT_CONFIRMED`. Handles v22 `parent.subscription_details.subscription` AND legacy bare `subscription` / `payment_intent` fields. |
| `invoice.payment_failed` | Find user by customer; no user → skip+log. **Does NOT revoke the plan** (grace period — Stripe retries). Creates Payment row with `status: FAILED`, `description: "Payment failed"`, `amount: amount_due ?? 0`. |
| `customer.subscription.updated` | Safety net only. Terminal statuses (`canceled`, `unpaid`, `incomplete_expired`) → `User.update({ planRenewsAt: new Date() })` (expire now). Any other status (incl. `cancel_at_period_end`) → **no action** — plan stays active until `.deleted`. userId from subscription metadata, else customer lookup. |
| `customer.subscription.deleted` | userId from subscription metadata (missing → skip+log). `User.update({ planRenewsAt: new Date() })` — plan field is left as-is; expiry is what downgrades. |

Idempotency mechanism: Payment-row lookups on `stripeCheckoutSessionId` /
`stripeInvoiceId` (both `@unique` where it matters). There is no separate event-id table.

### 3.2 Entitlement decision core (`entitlements.ts`, pure — no server imports)

`resolveEffectiveAccess(user)` precedence: `isAdmin` → `{access:"ADMIN", source:"admin",
isEntitled:true}`; then `manualAccessGrant` → `{access:<grant>, source:"manual",
isEntitled:true}`; then active Stripe plan → `{access: PRO|FOUNDER, source:"stripe",
isEntitled:true}`; else `{access:"FREE", source:"none", isEntitled:false}`. Every gate
funnels through this:

- `capViolation(user, currentCount, cap, msg)` — entitled → null; `currentCount >= cap` → msg.
  Counts **non-done** entities (`isDone: false`), so finishing work frees a slot.
- `lensViolation(user, lens, msg)` — entitled → null; `lens && !lens.isIncluded` → msg.
  **Branches on `isIncluded`, NEVER the lens name** (rename-safety: a Pro user renaming
  "Work" → "Studio" cannot escape FREE gating).
- `lensConfigViolation(user, msg)` — any lens create/rename/recolor/edit-purpose/delete
  is Pro-only for non-entitled users.
- `cliAccessViolation` / `sitewideSearchViolation` — whole-account gates.
- `resolveLens(entities, userId, lensId)` — tenancy-safe `Lens.findFirst({ where: { id, userId } })`
  selecting `{ name, isIncluded }`; null for unknown/not-owned.
- `resolveAccessibleLenses(entities, user, userId)` — the readable-lens SET filter for
  global cross-lens views (Today, today/done, logbook default): entitled → all user's
  lenses; else `{ userId, isIncluded: true }` only. Returns full rows
  `{ id, name, color, isIncluded }`.

### 3.3 Gate points (where 402s fire) — the port must reproduce every one

Server op wrappers (via `entitlementHttp.ts` → `HttpError(402, "<feature> is a Pro
feature.", { feature, reason })`; Wasp honors status only for real `HttpError` instances):
- `goals/operations.ts`: `createGoal`, `updateGoal` (lens gate), cap gate
  (`FREE_LIMITS.goals`); `deleteGoal` lens gate.
- `projects/operations.ts`: `createProject` + `moveProject`/`updateProject` (lens),
  `createTask` (resolved-lens via injected `assertLens`), cap gate
  (`FREE_LIMITS.projects`, msg "a 4th project").
- `tasks/operations.ts`: `getTasks`, `createTask`/`updateTask`-family lens gates;
  `getTodayTasks` + `getTopTask` use `resolveAccessibleLenses` (set filter, no throw).
- `lenses/operations.ts`: `createLens`/`updateLens`/`deleteLens` →
  `assertLensConfigAllowed` + `assertUnderCap(PRO_LIMITS.lenses)`.
- `inbox/operations.ts` (`triageInboxItem`): injected `assertLens` + `assertProjectCap`.
- `resources/operations.ts`: create/update/delete lens gate on the owning project's lens.
- `simpleLists/operations.ts`: add-item lens gate via the project's lens.
- `search/operations.ts`: `searchSite` + `getCommandPaletteIndex` →
  `assertSitewideSearchAccess` (Pro-only palette + sitewide search).
- `logbook/operations.ts`: **known gap** — web `getLogbook` has NO lens guard (documented
  in code); the CLI route does gate. Port decision from S8: add the guard.
- CLI surfaces: `auth/cliMint.ts` (`mintCliToken` action → `assertCliAccess`),
  `/api/pat/issue` (`cliAccessViolation` → 402), and `patMiddleware` (402 for a FREE
  account's token on EVERY `/api/cli/*` request).

Client mirrors: `useEntitled()` (boolean from auth user via `resolveEffectiveAccess`) +
`extractEntitlementMessage(err)` (reads `.data` / `.response.data` / `.message.data` /
top-level `feature`/`reason` off a thrown 402, with calm fallbacks "That" /
"This is a Pro feature.").

### 3.4 Edge cases + invariants

- FREE plan matrix (PRICING.md §4, code-enforced): Capture/Inbox/Tasks/Next engine
  unlimited; Lens = included "Me" only (Work visible-but-locked); Projects 3 per lens;
  Goals 1 per lens; palette + sitewide search + CLI/API = Pro; Pro lenses soft-capped at 8.
- Simple lists count as projects for the 3-cap (2026-08-18 decision).
- Over-cap after downgrade → **soft-lock** the excess (read-only), never delete.
- Expired PRO (`planRenewsAt` past) is treated as FREE everywhere via `isPlanActive`.
- FOUNDER never expires; `manualAccessGrant` never replaces Stripe `plan`, it only adds
  access; FRIEND grants access but does NOT count toward Founding-100.
- `assertStandardProject` (entitlementHttp): 404 "Project not found." for unknown;
  400 "This action requires a standard Project. Add checklist items directly in the list."
  for SIMPLE_LIST — a product-type guard, separate from entitlement.
- Founding-100 count includes billed + manual founders, never friends; `remaining`
  floors at 0; `isFull` at `claimed >= 98`.

## 4. e2e + unit assertions

**e2e — `webapp/e2e/entitlements.spec.ts` (1 test):** signup (FREE) → wait for lens
tabs (`tab name /^me\b.*\d/i` visible) → click Work tab → "Pro feature" text visible +
"see plans" link visible → Me tab STILL `aria-selected="true"` (the lens did not switch;
client gate + server 402 boundary).

**Unit — `entitlements.ops.test.ts`:** real guards run against mocked entities:
`createProject` resolves lens tenancy-safely (`Lens.findFirst({ where: { id, userId } })`),
counts `{ userId, lensId, isDone: false }`, 402s (real `statusCode: 402`) at cap 3 with
`.create` never called; same for the goal cap (1) and lens rules.

**Unit — `webhook.test.ts` (24 cases):** the guard rails (500/400/200-unhandled) and
per-event behaviors listed in §3.1 — subscription-mode skip, missing-metadata skip,
session/invoice idempotency skips, PRO-prepaid grant + customer stamp + Payment row,
FOUNDER grant with `planRenewsAt` null, subscription-metadata read, customerId fallback,
no-user skip, FAILED row without plan change, terminal-status expiry, `.deleted` expiry.

**Unit — `operations.test.ts`:** Founding-100 membership count includes billed + manual
founders, never friends.

## 5. Env vars / secrets (names only)

`STRIPE_SECRET_KEY` (restricted `rk_` key; client singleton — null when unset, warns at
startup), `STRIPE_WEBHOOK_SECRET` (per-endpoint `whsec_`), `STRIPE_PRICE_PRO_YEARLY`,
`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_PREPAID`, `STRIPE_PRICE_FOUNDER` (price
IDs; `getPriceId` throws "Missing env var for price key: <key>" at checkout time),
`WASP_WEB_CLIENT_URL` (origin for success/cancel/return URLs; fallback
`http://localhost:4000`). Docs also list `STRIPE_PRICE_CURRENCY` and optional
`STRIPE_PUBLISHABLE_KEY`/`STRIPE_CLI` as future/unused.
