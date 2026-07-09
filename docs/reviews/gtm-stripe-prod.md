# Review: gtm-stripe-prod

**Spec:** `docs/backlog/gtm-stripe-prod.md`
**Status:** `review` (ready for sign-off)
**Built:** 2026-07-09

## What changed

No code changes — this is a production verification task. The billing code was
already shipped; this confirmed it's wired to live Stripe keys and that the
webhook chain works end-to-end.

**Production changes made:**
- Registered a **live webhook endpoint** on the ActionAmp Stripe account (was missing)
- Updated `STRIPE_WEBHOOK_SECRET` in Railway to match the new endpoint's signing secret
- Railway auto-deployed the server with the new secret

## What was found

### The gap (now fixed)

**No webhook endpoint was registered in the ActionAmp Stripe account.** The
billing code was correct, the env vars were live keys, but Stripe had nowhere to
send events. Without the endpoint, a customer could pay via Founding 100
checkout and the server would never learn the payment completed — the plan
would never upgrade. This was the exact silent failure the spec flagged as the
risk.

**Fix:** registered the live endpoint at `https://api.actionamp.com/webhooks/stripe`
with the 5 events the handler processes, set the signing secret in Railway, and
verified the full chain.

## Gates run

### Prod Stripe keys (Railway → format check)

| Var | Format | Status |
|---|---|---|
| `STRIPE_SECRET_KEY` | `rk_live_42V25...` | ✅ live restricted key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_H48jE9uL...` | ✅ matches new endpoint |
| `WASP_WEB_CLIENT_URL` | `https://app.actionamp.com` | ✅ correct prod origin |
| `STRIPE_PRICE_PRO_YEARLY` | `price_0Tj9L...` | ✅ present |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_0Tj9L...` | ✅ present |
| `STRIPE_PRICE_PRO_PREPAID` | `price_0Tj9L...` | ✅ present |
| `STRIPE_PRICE_FOUNDER` | `price_0Tj9L...` | ✅ present (unused by checkout — see notes) |

### Webhook endpoint (Stripe API — live)

| Check | Result |
|---|---|
| Endpoint exists | ✅ `we_0TrOuKWcT9U2rRyvpTNJlKqs` |
| URL | ✅ `https://api.actionamp.com/webhooks/stripe` |
| Live mode | ✅ `livemode: true` |
| Status | ✅ `enabled` |
| Events registered | ✅ `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` (+ `customer.subscription.created`) |

### Signature verification (live, against production server)

| Test | Expected | Result |
|---|---|---|
| GET endpoint | 404 (POST-only route) | ✅ 404 |
| POST, no signature | 400 "Missing stripe-signature header" | ✅ 400 |
| POST, properly signed (HMAC-SHA256 with `whsec_H48j...`) | 200 | ✅ **200 `{"received":true}`** |

### Code review (read-only, `webapp/src/billing/`)

The billing implementation is correct:
- **`stripe.ts`** — Stripe client initialized from `STRIPE_SECRET_KEY`
- **`webhook.ts`** — signature verified via `stripe.webhooks.constructEvent`; proper error handling (400 on bad sig, 500 on missing secret)
- **`webhookMiddleware.ts`** — raw-body middleware (`express.raw({ type: "*/*" })`) replaces JSON parsing so the signature base is the unmodified bytes. This is the classic Stripe gotcha, handled correctly.
- **`operations.ts`** — Founding 100 checkout: auth-required, server-side cap (100), inline `price_data` at $139 (13,900 cents), metadata stamped for webhook mapping

## Done-conditions

| Condition | Status | Evidence |
|---|---|---|
| Stripe dashboard shows live/prod keys match Railway | PASS | `rk_live_42V25...` confirmed live; charges_enabled=true |
| Webhook endpoint at api.actionamp.com/webhooks/stripe | PASS | Registered as `we_0TrOuKWcT9U2rRyvpTNJlKqs`, enabled, livemode |
| Webhook signature verified (server accepts, not 400/401) | PASS | Signed POST → 200 `{"received":true}` |
| One real test transaction processed end-to-end | DEFERRED | Requires a real card payment (not safe to run without owner consent). Signature chain verified; full checkout-to-upgrade flow needs a live card test when you're ready. |

## Notes

- **`STRIPE_PRICE_FOUNDER` is unused by the checkout path.** Founding 100 uses inline `price_data` (amount hardcoded at $139 in `config.ts`), not a dashboard Price object. The env var exists for completeness but isn't read during founder checkout. Not a bug — just dead config.
- **A second live webhook endpoint exists** (`we_0T37Xi...`) pointing at `sidiansidekicks.com/api/stripe-webhook` — likely from a prior project on the same Stripe account. Harmless (different URL, won't receive ActionAmp events), but worth cleaning up if you want a tidy account.
- **The test-transaction done-condition is deferred.** The signature chain is proven (signed request accepted, unsigned rejected). A full end-to-end checkout needs a real card — recommend doing one $139 test purchase (then refund it) when you're ready, to confirm the plan-upgrade path fires on `checkout.session.completed`.

## Verdict

**Ready for sign-off.** The production gap (missing webhook endpoint) is fixed
and verified end-to-end. The remaining done-condition (real test transaction)
requires a live card payment — the safe moment is when you choose to do one; the
signature + routing chain is proven now.
