# S16 wiring — Billing + entitlements

> Status: DELIVERED (this batch). P0 checklist:
> `packages/contract/src/s16-billing/README.md` (§1–§5 are the parity bar).
> Fragments: `packages/contract/src/billing.ts`,
> `packages/domain/src/billing/{webhookCore,checkoutCore}.ts` (+ tests),
> `apps/api/src/procedures/{billing,billingCore}.ts`,
> `apps/api/src/webhooks-stripe.ts`, `apps/api/src/billing/stripe.ts`,
> `apps/api/src/seed-billing.ts`, `apps/web` Billing tab + ProGate completion +
> founding-100 checkout wiring, `apps/web/e2e/billing.spec.ts`.

## 1. Contract + procedures (fragment → composition)

- `packages/contract/src/billing.ts`: `billingContract = { createCheckoutSession,
  createCustomerPortalSession, getBillingStatus }` (+ `BillingStatusSchema`,
  `BillingPaymentSchema`, `CheckoutPriceKeySchema`, `CheckoutErrorMap`).
  The public Founding-100 count stays where S15 shipped it
  (`public.getFounding100Status` + `GET /founding-100/status`).
- Composition lines (the S12/S13/S15 "temporary gate wiring" convention — live
  so the slice's own e2e can reach the surface):
  - `packages/contract/src/router.ts`: `billing: billingContract, // S16`
  - `packages/contract/src/index.ts`: additive export block
  - `apps/api/src/router.ts`: `billing: billingProcedures, // S16`
  - `apps/api/src/index.ts`: `app.route("/", createStripeWebhookRoute({ db,
    entities })) // S16` — mounts `POST /webhooks/stripe`.
- Wire paths: `POST /rpc/billing/{createCheckoutSession,
  createCustomerPortalSession,getBillingStatus}` and
  `POST /webhooks/stripe` (raw, signature-authed).
- Errors: founder cap → the DECLARED `CONFLICT` (409) with the webapp string
  verbatim ("All public Founding memberships have been claimed."); Stripe-side
  failures stay plain errors → INTERNAL, matching the webapp's untyped throws.

### Ops parity map (s16-billing/README.md §1–§3)

| Webapp surface | Port | Parity notes |
|---|---|---|
| `createCheckoutSession` | `billing.createCheckoutSession` → `createCheckoutSessionCore` | Founder-cap 409 BEFORE any Stripe call (per-request count via `FOUNDER_MEMBERSHIP_WHERE`); reuse-or-create Stripe customer (persisted); exact session params (subscription vs payment+`invoice_creation`, founder inline `price_data` $99, `metadata {userId, priceKey}` on session + subscription, `allow_promotion_codes`, automatic_tax OFF, founder → `/founding-100/welcome` success + `/founding-100` cancel, others → `/do/settings/billing?checkout=success|cancelled`); CHECKOUT_STARTED fired fire-and-forget (founder route `/founding-100`, others `/do/settings/billing`). NEVER mutates the plan. |
| `createCustomerPortalSession` | `billing.createCustomerPortalSession` → `createCustomerPortalSessionCore` | No `stripeCustomerId` → plain `"No billing account found for this user."` (webapp string); portal `return_url` = Billing tab. |
| `getBillingStatus` | `billing.getBillingStatus` → `getBillingStatusWire` | `{ plan, planRenewsAt, isPaid, isFounder, payments }`, payments = last 50 `createdAt desc`; wire DTO serializes Dates → ISO. |
| `stripeWebhook` | `POST /webhooks/stripe` | Raw body via `c.req.raw.arrayBuffer()` BEFORE any parse; the five events dispatch to the domain cores; guard rails byte-identical (500 "Webhook secret not configured." / "Stripe client not configured.", 400 "Missing stripe-signature header." / "Webhook Error: <msg>", 500 "Webhook handler error.", unknown event → 200 no-op, success → `{received:true}`). |

## 2. Domain (additive to the F4b billing module)

- `src/billing/webhookCore.ts` — the five event handlers as pure cores
  (`handleCheckoutCompletedCore`, `handleInvoicePaidCore`,
  `handleInvoiceFailedCore`, `handleSubscriptionUpdatedCore`,
  `handleSubscriptionDeletedCore`) + `PRICING_ENTITLEMENT` (verbatim) +
  `invoiceEntitlement` PRO defaults + the v22/legacy invoice adapters.
  **Port decision:** the webapp handlers consumed `Stripe.*` SDK types; the
  domain stays SDK-free, so payloads are typed as the structural subsets the
  handlers read (the API layer's `constructEventAsync` result casts are the
  only seam). Stripe network calls are injected deps
  (`BillingWebhookDeps.retrieveSubscription` + optional fire-and-forget
  `recordAnalytics`).
- `src/billing/checkoutCore.ts` — session/portal PARAMS builders, URL flows,
  `assertFounderCapAvailable` (HttpError 409, webapp message),
  `founding100Status` (S15 `founding100Payload` math, shared constants),
  `getBillingStatusCore`, `ensureStripeCustomerId`.
- Entitlements (`entitlements.ts`, `config.ts`) untouched — gate messages and
  ADMIN > manual > stripe > FREE precedence are exactly as reviewed (F4b).
- Seam (additive, port-recipe §4): `types.ts` `Payment` row + `PaymentStatus`;
  `seam.ts` `UserWhereInput.stripeCustomerId`, `UserUpdateInput` +
  plan/planRenewsAt/stripeCustomerId, `UserFindFirstArgs`/`UserDelegate.findFirst`,
  `PaymentDelegate` (findFirst/findMany/create), `Entities.Payment`;
  `client.ts` `createPaymentDelegate` (id minted client-side per the seam rule)
  + `stripeCustomerId` in `userWhereToSql`; `seam.checks.ts` six S16 locks.

## 3. API details

- `src/procedures/billingCore.ts` — the testable slice (publicCore precedent:
  oRPC procedure objects aren't directly invokable); handlers in
  `procedures/billing.ts` are thin. `billingStripeOps` is the Stripe seam
  tests swap (webapp `stripeCalls` pattern). CHECKOUT_STARTED routes through
  S15's `recordPublicAnalyticsEvent` (CHECKOUT_STARTED is not one-time —
  records every checkout start, webapp parity).
- `src/billing/stripe.ts` — client singleton + `getPriceId` env lookups, port
  of webapp `billing/stripe.ts` (warn-at-startup, fail-fast at checkout).
- `src/webhooks-stripe.ts` — see §1. **Bun crypto note:** the endpoint uses
  `constructEventAsync` (not the sync `constructEvent`) — on Bun the Stripe
  SDK resolves its default crypto provider to SubtleCrypto, which is
  async-only; the sync form throws "SubtleCryptoProvider cannot be used in a
  synchronous context." Same HMAC scheme, same event type.
- `src/seed-billing.ts` — idempotent, localhost-only; four fixtures:
  `s16-pro@test.local` (billed PRO + 2 payments), `s16-founder@test.local`
  (billed FOUNDER, lifetime, $99 payment), `s16-free@test.local` (FREE), and
  `s16-manual@test.local` (plan FREE + `manualAccessGrant PRO` — the
  manualAccessGrant-equivalence fixture: entitled at every GATE via
  `resolveEffectiveAccess`, while the billing VIEW stays keyed to the billed
  plan, exactly like webapp's `getBillingStatus`). RESET semantics on billing
  fields + the fixture users' Payment rows only.
- Dev/e2e server env: the API needs `STRIPE_SECRET_KEY` (restricted
  **rk_test_**), `STRIPE_WEBHOOK_SECRET` (**whsec_**), and the four
  `STRIPE_PRICE_*` ids — copied from `webapp/.env.server` (all TEST-mode).
  Bun does not load that file; pass them on the command line when starting
  `src/index.ts`.

## 4. Web

- `src/routes/do/settings/billing/+page.svelte` + `lib/styles/billing.css` +
  `lib/stores/billing.svelte.ts` — BillingPage port: checkout banners,
  current-plan card (chip + renewal/lifetime + portal button), 3-card upgrade
  grid (Monthly $12.95 / Yearly $79.50 "Best value" / Prepaid $90), payment
  history table with status pills. `PLAN_LABEL` is a documented client copy
  (the web app doesn't import the domain package).
- `ProGate.svelte` — S9's deferred half completed (additive, all existing
  consumers unchanged): the inline panel now renders the upgrade links
  ("See plans" → `/do/settings/billing`, "Founding 100 · $99 lifetime" →
  `/founding-100`) and the `asTrigger` shape (quiet at-cap upgrade link) is
  available; `ProGate.css` gained the webapp's link/trigger styles.
- `/founding-100` — ONLY the marked call site changed (S13 §5 wiring note):
  the authed CTA now calls `billing.checkout("founder")` (store →
  `createCheckoutSession`) and redirects to the returned Stripe URL;
  CHECKOUT_STARTED still fires first; the server's 409 at the public cap
  renders inline as the honest full state. The dead `/checkout/founder`
  stand-in is gone.

## 5. e2e (`apps/web/e2e/billing.spec.ts`, 10 tests)

Fixtures via `seed-billing.ts` (run before the suite; lenses-spec convention —
the shared global-setup doesn't know this seed). Suite green twice, full
`--workers=1` runs: **70 passed** (all specs) ×2.

- Plan display for PRO (renewal + history), FOUNDER (lifetime + $99 receipt),
  FREE (upgrade grid + empty history), and the MANUAL grant user (pins that
  the billing VIEW keys off the billed plan while gates entitle — the two
  systems stay separate).
- Checkout/portal button wiring via Playwright route interception (the oRPC
  envelope `{"json": …}` on both the request assertion and the fulfilled
  response; the external Stripe URL is ALSO fulfilled so the redirect
  navigation can complete offline) — click → procedure (priceKey asserted on
  the wire) → redirect. Same pattern for the founding-100 founder CTA.
- ProGate upgrade links + navigation to the Billing tab (the palette `/` mount
  — the lenses tab hand-rolls its gate, it does not use ProGate.svelte).
- Webhook at the HTTP level: genuinely SIGNED payloads (node:crypto HMAC over
  the exact bytes — signature verification is local, no network). A signed
  founder `checkout.session.completed` for a throwaway dev user flips the
  plan to FOUNDER, lands the $99 payment row (read back through
  `getBillingStatus`), and the REPLAY is a no-op (payment count unchanged —
  the `stripeCheckoutSessionId` idempotency guard, proven end-to-end).
  Tampered signature → 400. Without `STRIPE_WEBHOOK_SECRET` on the API
  process the first test asserts the documented 500 guard-rail instead
  (both branches deterministic).

## 6. Stripe-key situation + what was verified vs pinned

- `webapp/.env.server` holds a TEST-mode account: `STRIPE_SECRET_KEY=rk_test_…`
  (restricted test key), a `whsec_…` webhook secret, and four live-looking
  (test-account) `STRIPE_PRICE_*` ids. TEST-MODE ONLY was honored: no live
  keys touched, no live API calls.
- **This sandbox has NO outbound network** (and the bun registry is
  unreachable), so no Stripe API call could be made at all — not even
  test-mode. Everything money-touching is therefore seam-mocked and
  unit-pinned: session/portal param construction, customer reuse/create,
  cap enforcement, portal no-account error (domain + API suites), and the
  five webhook events' DB effects (21 domain cases + 11 endpoint cases,
  ported from the webapp's 24-case suite; the transport guard rails moved
  WITH the endpoint). The real egress path (a test-mode checkout end-to-end
  + `stripe trigger`/dashboard webhook delivery) is **deferred to the V2
  rehearsal with Jake**.
- What IS verified against the real Stripe SDK: signature VERIFICATION
  (constructEventAsync over genuinely signed AND tampered payloads, live at
  the HTTP level and in vitest) — that's local crypto, the money-path's
  trust boundary.

## 7. Deferred / notes

- **`stripe` dependency (one-liner when the registry is reachable):**
  `cd apps/api && bun add stripe@^22.3.2`, then delete the
  `apps/api/node_modules/stripe` symlink (it currently points at the
  webapp's pinned install, 22.5.0 — same major). `apps/api/package.json`
  is untouched in this batch for that reason. `node_modules/` is
  gitignored, so git is clean either way.
- **Live test-mode dry run** (real checkout → Stripe-hosted page → webhook
  delivery → plan flip) belongs to V2 rehearsal with Jake (no egress here).
- **CLI 402 gates** (`cliAccessViolation` on every `/api/cli/*` path) are
  already wired on this stack (index.ts PAT paths + `mintCliToken`); S18
  owns the route surface.
- **Parallel-slice note (at delivery time):** S17 (admin) is mid-flight in
  `apps/api/src/cli*/`, `procedures/admin.ts`, `packages/domain/src/admin|feedback/`
  and holds the only tsc noise (`src/cli/cli-conformance.test.ts` needs
  DATABASE_URL at module scope; `src/seed-admin.ts` type drift). Every S16
  path typechecks clean and all domain (454) + API (134) tests pass.
- The daily-reminder scheduler/`--hot` restarts: the dev API on :8080 was
  restarted with the Stripe test env for the webhook e2e (documented in §3).
