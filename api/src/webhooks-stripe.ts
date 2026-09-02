/**
 * POST /webhooks/stripe — the Stripe webhook endpoint (S16 port of
 * webapp/src/billing/webhook.ts + webhookMiddleware.ts).
 *
 * This is the ONLY place that changes User.plan / planRenewsAt. Signature-
 * verified, idempotent (Payment-row lookups on the unique Stripe ids — see
 * the domain cores). Never trust the client.
 *
 * RAW BODY (the load-bearing bit — the webapp swapped express.json for
 * express.raw matching every content type to get it): the signature is an
 * HMAC over the EXACT bytes Stripe sent, so the payload must be read via
 * `c.req.raw` BEFORE any JSON parse. Hono hands us the undecoded Request; we
 * await arrayBuffer() and verify over the Buffer.
 *
 * Guard rails (webapp bodies verbatim):
 *   STRIPE_WEBHOOK_SECRET unset      → 500 "Webhook secret not configured."
 *   Stripe client unconfigured       → 500 "Stripe client not configured."
 *   missing stripe-signature header  → 400 "Missing stripe-signature header."
 *   bad signature                    → 400 "Webhook Error: <sdk message>"
 *   handler throw                    → 500 "Webhook handler error."
 *   unknown event type               → logged + 200 (no mutation)
 *   success                          → 200 { received: true }
 *
 * The five events and their effects are the domain cores in
 * @actionamp/domain/billing (webhookCore.ts — s16-billing/README.md §3.1 is
 * the parity checklist):
 *   checkout.session.completed     → one-time grants (subscription mode skipped)
 *   invoice.paid                   → recurring grants (sub metadata → line
 *                                    metadata → customerId fallback)
 *   invoice.payment_failed         → FAILED Payment row, NO revocation
 *   customer.subscription.updated  → terminal-status expiry safety net
 *   customer.subscription.deleted  → expiry at period end
 */
import { Hono } from "hono";
import type Stripe from "stripe";
import type { Entities, DomainDb } from "@actionamp/domain/db";
import {
  handleCheckoutCompletedCore,
  handleInvoiceFailedCore,
  handleInvoicePaidCore,
  handleSubscriptionDeletedCore,
  handleSubscriptionUpdatedCore,
  type BillingCheckoutSession,
  type BillingInvoice,
  type BillingSubscription,
  type BillingWebhookDeps,
} from "@actionamp/domain/billing";
import { isStripeConfigured, requireStripe } from "./billing/stripe.js";
import { logEvent } from "./logger.js";
import { recordPublicAnalyticsEvent } from "./procedures/publicCore.js";

export interface StripeWebhookRouteDeps {
  db: DomainDb;
  entities: Entities;
  /** Test override for the module singleton (null → the configured-500 rail). */
  stripeClient?: Stripe | null;
}

/**
 * Injectable Stripe calls — the explicit seam for the network calls this
 * module makes (the webapp webhook.ts pattern; tests swap properties instead
 * of module-mocking).
 */
export const stripeCalls = {
  retrieveSubscription: (subscriptionId: string): Promise<Stripe.Subscription> =>
    requireStripe().subscriptions.retrieve(subscriptionId),
};

/** The deps the domain event handlers receive (analytics is fire-and-forget
 *  there — the PAYMENT_CONFIRMED funnel event through the S15 recorder). */
function webhookDeps(deps: StripeWebhookRouteDeps): BillingWebhookDeps {
  return {
    retrieveSubscription: (id) => stripeCalls.retrieveSubscription(id),
    recordAnalytics: (event, userId) =>
      recordPublicAnalyticsEvent(deps.db, event, userId),
  };
}

export function createStripeWebhookRoute(deps: StripeWebhookRouteDeps): Hono {
  const app = new Hono();

  app.post("/webhooks/stripe", async (c) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set.");
      return c.text("Webhook secret not configured.", 500);
    }
    // The configured rail: without a key the endpoint answers the readable
    // 500 (and signed-payload tests can inject a client via deps).
    const client = deps.stripeClient !== undefined ? deps.stripeClient : isStripeConfigured() ? requireStripe() : null;
    if (!client) {
      console.error(
        "[webhook] Stripe client is not configured (STRIPE_SECRET_KEY missing).",
      );
      return c.text("Stripe client not configured.", 500);
    }

    // The raw bytes — signature verification needs the EXACT payload Stripe
    // sent (Hono equivalent of the webapp's express.raw middleware).
    const rawBody = Buffer.from(await c.req.raw.arrayBuffer());

    const sig = c.req.header("stripe-signature");
    if (!sig) {
      return c.text("Missing stripe-signature header.", 400);
    }

    let event: Stripe.Event;
    try {
      // constructEventAsync (not the sync form): on Bun the Stripe SDK
      // resolves its default crypto provider to SubtleCrypto, which is
      // async-only — the sync constructEvent throws
      // "SubtleCryptoProvider cannot be used in a synchronous context."
      // Same HMAC scheme, same result type.
      event = await client.webhooks.constructEventAsync(
        rawBody,
        sig,
        webhookSecret,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[webhook] Signature verification failed:", msg);
      return c.text(`Webhook Error: ${msg}`, 400);
    }

    console.log(`[webhook] Received: ${event.type} (id: ${event.id})`);

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompletedCore(
            deps.entities,
            event.data.object as BillingCheckoutSession,
            webhookDeps(deps),
          );
          break;
        case "invoice.paid":
          await handleInvoicePaidCore(
            deps.entities,
            event.data.object as BillingInvoice,
            webhookDeps(deps),
          );
          break;
        case "invoice.payment_failed":
          await handleInvoiceFailedCore(
            deps.entities,
            event.data.object as BillingInvoice,
          );
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdatedCore(
            deps.entities,
            event.data.object as BillingSubscription,
          );
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeletedCore(
            deps.entities,
            event.data.object as BillingSubscription,
          );
          break;
        default:
          console.log(`[webhook] Unhandled event type: ${event.type}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[webhook] Handler error for ${event.type}:`, msg);
      return c.text("Webhook handler error.", 500);
    }

    logEvent("info", `stripe webhook handled: ${event.type}`, {
      event: "stripeWebhook",
      type: event.type,
    });
    return c.json({ received: true });
  });

  return app;
}
