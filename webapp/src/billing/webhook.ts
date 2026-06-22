/**
 * Stripe webhook handler — the source of truth for entitlement.
 *
 * Processes verified Stripe events and mutates User.plan / Payment records.
 * This is the ONLY place that changes User.plan. Never trust the client.
 *
 * Events handled:
 *   - checkout.session.completed       → one-time payments (founder, prepaid)
 *   - invoice.paid                      → subscription payments (pro yearly/monthly)
 *   - invoice.payment_failed            → mark payment as failed (grace period)
 *   - customer.subscription.updated     → safety net: expire on terminal status (canceled/unpaid)
 *   - customer.subscription.deleted     → subscription cancelled, plan expires at period end
 *
 * Idempotency: deduplicates by Stripe event id via a DB lookup on
 * stripePaymentIntentId / stripeInvoiceId / stripeCheckoutSessionId.
 */
import Stripe from "stripe";
import { stripe } from "./stripe";
// Wasp API handlers receive Express req/res; our express.raw middleware puts
// raw bytes in req.body as a Buffer (not in the type signature).
import type { Request, Response } from "express";

type WaspEntities = {
  User: {
    findFirst: (args: { where: Record<string, unknown> }) => Promise<{ id: string; plan: string; stripeCustomerId: string | null } | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  Payment: {
    findFirst: (args: { where: Record<string, unknown> }) => Promise<unknown | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

type WaspApiContext = { entities: WaspEntities };

/**
 * Maps price metadata keys (from setup-stripe.mjs) → our Plan + renewal duration.
 */
const PRICING_ENTITLEMENT = {
  pro_yearly: { plan: "PRO" as const, renewalMs: 365 * 24 * 60 * 60 * 1000, label: "Pro Yearly" },
  pro_monthly: { plan: "PRO" as const, renewalMs: 30 * 24 * 60 * 60 * 1000, label: "Pro Monthly" },
  pro_prepaid: { plan: "PRO" as const, renewalMs: 365 * 24 * 60 * 60 * 1000, label: "Pro Prepaid (12 mo)" },
  founder: { plan: "FOUNDER" as const, renewalMs: 365 * 24 * 60 * 60 * 1000, label: "Founder" },
} as const;

export const stripeWebhook = async (
  req: Request,
  res: Response,
  context: WaspApiContext
) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return res.status(500).send("Webhook secret not configured.");
  }

  // With express.raw({ type: "*/*" }), the raw bytes land in req.body as a Buffer.
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));

  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    return res.status(400).send("Missing stripe-signature header.");
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[webhook] Signature verification failed:", msg);
    return res.status(400).send(`Webhook Error: ${msg}`);
  }

  console.log(`[webhook] Received: ${event.type} (id: ${event.id})`);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event, context);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event, context);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(event, context);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event, context);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event, context);
        break;
      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[webhook] Handler error for ${event.type}:`, msg);
    return res.status(500).send("Webhook handler error.");
  }

  return res.status(200).json({ received: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Safely get a string field from a Stripe object (may be string | object). */
function extractId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return (value as { id: string }).id;
  return undefined;
}

/** Safely get subscription ID from an invoice (Stripe v22 nests differently). */
function extractSubscriptionId(invoice: Record<string, unknown>): string | undefined {
  // Direct field (older API versions)
  if (typeof invoice.subscription === "string") return invoice.subscription;
  // Nested in parent (v22+)
  const parent = invoice.parent as Record<string, unknown> | null;
  if (parent && typeof parent.subscription_details === "object") {
    return extractId((parent as Record<string, unknown>).subscription);
  }
  return undefined;
}

/** Safely get payment_intent ID from an invoice. */
function extractPaymentIntentId(invoice: Record<string, unknown>): string | undefined {
  if (typeof invoice.payment_intent === "string") return invoice.payment_intent;
  return extractId(invoice.payment_intent);
}

// ── Event handlers ─────────────────────────────────────────────────────────

async function handleCheckoutCompleted(event: Stripe.Event, context: WaspApiContext) {
  const session = event.data.object as unknown as Record<string, unknown>;

  // Only handle one-time payments here (founder, prepaid).
  // Subscription checkouts trigger invoice.paid separately.
  if (session.mode === "subscription") {
    console.log("[webhook] checkout.session.completed — subscription mode, skipping (invoice.paid will handle).");
    return;
  }

  const metadata = session.metadata as Record<string, string> | undefined;
  const userId = metadata?.userId;
  const priceKey = metadata?.priceKey;

  if (!userId || !priceKey) {
    console.error("[webhook] checkout.session.completed — missing userId or priceKey in metadata.");
    return;
  }

  // Idempotency: skip if we already processed this session
  const existing = await context.entities.Payment.findFirst({
    where: { stripeCheckoutSessionId: session.id as string },
  });
  if (existing) {
    console.log(`[webhook] checkout.session.completed — already processed session ${session.id}, skipping.`);
    return;
  }

  const entitlement = PRICING_ENTITLEMENT[priceKey as keyof typeof PRICING_ENTITLEMENT];
  if (!entitlement) {
    console.error(`[webhook] Unknown priceKey: ${priceKey}`);
    return;
  }

  // Update user plan
  const planRenewsAt = entitlement.renewalMs
    ? new Date(Date.now() + entitlement.renewalMs)
    : null;

  await context.entities.User.update({
    where: { id: userId },
    data: {
      plan: entitlement.plan,
      planRenewsAt,
      stripeCustomerId: extractId(session.customer) ?? undefined,
    },
  });

  // Record the payment
  await context.entities.Payment.create({
    data: {
      userId,
      amount: (session.amount_total as number) ?? 0,
      currency: (session.currency as string) ?? "usd",
      plan: entitlement.plan,
      description: entitlement.label,
      status: "SUCCEEDED",
      paidAt: new Date(),
      stripeCheckoutSessionId: session.id as string,
      stripePaymentIntentId: extractId(session.payment_intent) ?? undefined,
    },
  });

  console.log(`[webhook] Checkout completed: userId=${userId}, plan=${entitlement.plan}`);
}

async function handleInvoicePaid(event: Stripe.Event, context: WaspApiContext) {
  const invoice = event.data.object as unknown as Record<string, unknown>;

  // Idempotency
  const invoiceId = invoice.id as string;
  if (invoiceId) {
    const existing = await context.entities.Payment.findFirst({
      where: { stripeInvoiceId: invoiceId },
    });
    if (existing) {
      console.log(`[webhook] invoice.paid — already processed invoice ${invoiceId}, skipping.`);
      return;
    }
  }

  // Get the subscription to find metadata
  const subscriptionId = extractSubscriptionId(invoice);
  let priceKey: string | undefined;
  let userId: string | undefined;

  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      priceKey = sub.metadata?.priceKey as string | undefined;
      userId = sub.metadata?.userId as string | undefined;
    } catch {
      console.warn("[webhook] Could not retrieve subscription for invoice.");
    }
  }

  // Fallback: check lines for price metadata
  if (!priceKey) {
    const lines = invoice.lines as { data?: Array<{ price?: { metadata?: Record<string, string> } }> } | undefined;
    if (lines?.data?.[0]?.price?.metadata?.actionamp_plan) {
      priceKey = lines.data[0].price.metadata.actionamp_plan;
    }
  }

  if (!userId) {
    // Try to find user by Stripe customer ID
    const customerId = extractId(invoice.customer);
    if (customerId) {
      const user = await context.entities.User.findFirst({
        where: { stripeCustomerId: customerId },
      });
      userId = user?.id ?? undefined;
    }
  }

  if (!userId) {
    console.error("[webhook] invoice.paid — could not determine userId.");
    return;
  }

  const entitlement = priceKey
    ? PRICING_ENTITLEMENT[priceKey as keyof typeof PRICING_ENTITLEMENT]
    : null;

  const plan = entitlement?.plan ?? "PRO";
  const label = entitlement?.label ?? "Pro Subscription";
  const renewalMs = entitlement?.renewalMs ?? 30 * 24 * 60 * 60 * 1000;

  // Update user plan
  await context.entities.User.update({
    where: { id: userId },
    data: {
      plan,
      planRenewsAt: plan === "FOUNDER" ? null : new Date(Date.now() + renewalMs),
    },
  });

  // Record the payment
  await context.entities.Payment.create({
    data: {
      userId,
      amount: (invoice.amount_paid as number) ?? 0,
      currency: (invoice.currency as string) ?? "usd",
      plan,
      description: label,
      status: "SUCCEEDED",
      paidAt: new Date(),
      stripeInvoiceId: invoiceId ?? undefined,
      stripePaymentIntentId: extractPaymentIntentId(invoice) ?? undefined,
    },
  });

  console.log(`[webhook] Invoice paid: userId=${userId}, plan=${plan}`);
}

async function handleInvoiceFailed(event: Stripe.Event, context: WaspApiContext) {
  const invoice = event.data.object as unknown as Record<string, unknown>;

  const customerId = extractId(invoice.customer);
  const user = customerId
    ? await context.entities.User.findFirst({
        where: { stripeCustomerId: customerId },
      })
    : null;

  if (!user) {
    console.error("[webhook] invoice.payment_failed — could not find user.");
    return;
  }

  // Record the failed payment
  await context.entities.Payment.create({
    data: {
      userId: user.id,
      amount: (invoice.amount_due as number) ?? 0,
      currency: (invoice.currency as string) ?? "usd",
      plan: user.plan,
      description: "Payment failed",
      status: "FAILED",
      stripeInvoiceId: (invoice.id as string) ?? undefined,
      stripePaymentIntentId: extractPaymentIntentId(invoice) ?? undefined,
    },
  });

  console.log(`[webhook] Invoice payment failed: userId=${user.id}`);
  // Note: we don't immediately revoke the plan. Stripe retries, and the user
  // stays active during the grace period. customer.subscription.deleted
  // handles the actual downgrade.
}

async function handleSubscriptionUpdated(event: Stripe.Event, context: WaspApiContext) {
  const subscription = event.data.object as unknown as Record<string, unknown>;
  const status = subscription.status as string | undefined;

  // Entitlement is driven by invoice.paid + .deleted. Here we only act on
  // terminal states as a safety net — if the sub is canceled/unpaid/incomplete,
  // expire now in case .deleted is missed or delayed. cancel_at_period_end is
  // intentionally a no-op (plan stays active until .deleted at period end).
  const terminal = ["canceled", "unpaid", "incomplete_expired"];
  if (!status || !terminal.includes(status)) {
    console.log(`[webhook] subscription.updated — status='${status}', no action.`);
    return;
  }

  const metadata = subscription.metadata as Record<string, string> | undefined;
  let userId = metadata?.userId;
  if (!userId) {
    const customerId = extractId(subscription.customer);
    if (customerId) {
      const user = await context.entities.User.findFirst({
        where: { stripeCustomerId: customerId },
      });
      userId = user?.id;
    }
  }

  if (!userId) {
    console.error("[webhook] subscription.updated — could not determine userId for terminal expiry.");
    return;
  }

  await context.entities.User.update({
    where: { id: userId },
    data: { planRenewsAt: new Date() },
  });

  console.log(`[webhook] subscription.updated — terminal status '${status}', expired userId=${userId}.`);
}

async function handleSubscriptionDeleted(event: Stripe.Event, context: WaspApiContext) {
  const subscription = event.data.object as unknown as Record<string, unknown>;
  const metadata = subscription.metadata as Record<string, string> | undefined;
  const userId = metadata?.userId;

  if (!userId) {
    console.error("[webhook] subscription.deleted — missing userId in metadata.");
    return;
  }

  // Set planRenewsAt to now so the UI shows expired
  await context.entities.User.update({
    where: { id: userId },
    data: {
      planRenewsAt: new Date(),
    },
  });

  console.log(`[webhook] Subscription deleted: userId=${userId} (plan expires now)`);
}
