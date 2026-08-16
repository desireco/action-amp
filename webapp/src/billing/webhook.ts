/**
 * Stripe webhook handler — the source of truth for entitlement.
 *
 * Processes verified Stripe events and mutates User.plan / Payment records.
 * This is the ONLY place that changes User.plan. Never trust the client.
 *
 * Events handled:
 *   - checkout.session.completed       → one-time payments (prepaid)
 *   - invoice.paid                      → subscription payments (pro yearly/monthly)
 *   - invoice.payment_failed            → mark payment as failed (grace period)
 *   - customer.subscription.updated     → safety net: expire on terminal status (canceled/unpayd)
 *   - customer.subscription.deleted     → subscription cancelled, plan expires at period end
 *
 * Idempotency: deduplicates by Stripe event id via a DB lookup on
 * stripePaymentIntentId / stripeInvoiceId / stripeCheckoutSessionId.
 *
 * Typing: `Stripe.Event` is a discriminated union on `type`, so the dispatch
 * switch narrows each handler's payload to the SDK's own resource type
 * (`Stripe.Checkout.Session`, `Stripe.Invoice`, `Stripe.Subscription`).
 * Handlers only consume those parsed types — no defensive re-decoding below
 * the `constructEvent` boundary.
 */
import type Stripe from "stripe";
import { stripe, requireStripe } from "./stripe";
import { recordAnalyticsEventCore } from "../analytics/operationsCore";
// Wasp API handlers receive Express req/res; our express.raw middleware puts
// raw bytes in req.body as a Buffer (not in the type signature).
import type { Request, Response } from "express";

// ── Domain contracts ───────────────────────────────────────────────────────

/** Plan values this module may write to User.plan (subset of the Prisma Plan enum). */
type Plan = "PRO" | "FOUNDER";

/** The User fields webhook handlers read. */
interface BillingUser {
  id: string;
  plan: string;
}

/** The only User fields the webhook ever writes. */
interface UserPlanUpdate {
  plan?: Plan;
  planRenewsAt?: Date | null;
  stripeCustomerId?: string;
}

/** Stripe-side ids a Payment row is deduplicated on (idempotency guard). */
interface PaymentStripeIdLookup {
  stripeCheckoutSessionId?: string;
  stripeInvoiceId?: string;
}

/** Payment row exactly as the webhook creates it. */
interface PaymentCreateData {
  userId: string;
  amount: number;
  currency: string;
  plan: string;
  description: string;
  status: "SUCCEEDED" | "FAILED";
  paidAt?: Date;
  stripeCheckoutSessionId?: string;
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string;
}

/** Plan + renewal granted by a price key (from setup-stripe.mjs metadata). */
interface PricingEntitlement {
  plan: Plan;
  /** null → planRenewsAt stays null (never expires). */
  renewalMs: number | null;
  label: string;
}

/** The `invoiceEntitlement` fallback resolution (PRO defaults when priceKey is unknown). */
interface ResolvedEntitlement {
  plan: Plan;
  label: string;
  renewalMs: number;
}

/** priceKey/userId as read off a subscription's metadata. */
interface SubscriptionMeta {
  priceKey?: string;
  userId?: string;
}

/** The Prisma delegate slice this handler touches — the exact methods and
 *  payloads used, named (not loose dictionaries) so callers and tests share
 *  one contract. */
type BillingEntities = {
  User: {
    findFirst(args: {
      where: { stripeCustomerId: string };
    }): Promise<BillingUser | null>;
    update(args: {
      where: { id: string };
      data: UserPlanUpdate;
    }): Promise<BillingUser>;
  };
  Payment: {
    findFirst(args: {
      where: PaymentStripeIdLookup;
    }): Promise<{ id: string } | null>;
    create(args: { data: PaymentCreateData }): Promise<{ id: string }>;
  };
  // recordAnalyticsEventCore links the payment to the visitor session through
  // these delegates (see src/analytics/operationsCore.ts).
  AnalyticsSession: {
    findFirst(args: {
      where: { userId: string };
      orderBy: { lastSeenAt: "desc" };
      select: { id: true; userId: true };
    }): Promise<{ id: string; userId: string | null } | null>;
    update(args: {
      where: { id: string };
      data: { lastSeenAt: Date };
    }): Promise<{ id: string }>;
    upsert(args: {
      where: { visitorId: string };
      create: {
        visitorId: string;
        userId: string | null;
        referrerHost: string | null;
        utmSource: string | null;
        utmMedium: string | null;
        utmCampaign: string | null;
        utmContent: string | null;
        utmTerm: string | null;
        initialPath: string | null;
        deviceClass: string | null;
      };
      update: { lastSeenAt: Date; userId?: string };
      select: { id: true; userId: true };
    }): Promise<{ id: string; userId: string | null }>;
  };
  AnalyticsEvent: {
    create(args: {
      data: {
        name: string;
        route: string | null;
        appVersion: string | null;
        metadata: Record<string, string | number | boolean | null> | null;
        sessionId: string;
        userId: string | null;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

/** The user behind a Stripe `customer` field (raw id or any expanded object). */
interface CustomerRef {
  id: string;
}

/**
 * API-version drift adapter: the account's pinned API version may still send
 * legacy Invoice fields that the SDK's current types no longer declare. We
 * read them defensively — absent fields resolve to undefined.
 */
interface LegacyInvoiceFields {
  payment_intent?: string | CustomerRef | null;
  subscription?: string | null;
  lines?: {
    data?: Array<{ price?: { metadata?: { actionamp_plan?: string } } }>;
  };
}

type RuntimeInvoice = Stripe.Invoice & LegacyInvoiceFields;

type WaspApiContext = { entities: BillingEntities };

/**
 * Maps price metadata keys (from setup-stripe.mjs) → our Plan + renewal duration.
 */
const PRICING_ENTITLEMENT = {
  pro_yearly: {
    plan: "PRO",
    renewalMs: 365 * 24 * 60 * 60 * 1000,
    label: "Pro Yearly",
  },
  pro_monthly: {
    plan: "PRO",
    renewalMs: 30 * 24 * 60 * 60 * 1000,
    label: "Pro Monthly",
  },
  pro_prepaid: {
    plan: "PRO",
    renewalMs: 365 * 24 * 60 * 60 * 1000,
    label: "Pro Prepaid (12 mo)",
  },
  // Founding 100: one-time $99, lifetime. renewalMs = null → planRenewsAt stays null (never expires).
  founder: {
    plan: "FOUNDER",
    renewalMs: null,
    label: "Founding 100 (lifetime)",
  },
} satisfies Record<string, PricingEntitlement>;

const PRICE_KEYS = ["pro_yearly", "pro_monthly", "pro_prepaid", "founder"];
type PriceKey = "pro_yearly" | "pro_monthly" | "pro_prepaid" | "founder";

function isPriceKey(value: string): value is PriceKey {
  const keys: readonly string[] = PRICE_KEYS;
  return keys.includes(value);
}

export const stripeWebhook = async (
  req: Request,
  res: Response,
  context: WaspApiContext,
) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return res.status(500).send("Webhook secret not configured.");
  }
  if (!stripe) {
    console.error(
      "[webhook] Stripe client is not configured (STRIPE_SECRET_KEY missing).",
    );
    return res.status(500).send("Stripe client not configured.");
  }

  // With express.raw({ type: "*/*" }), the raw bytes land in req.body as a Buffer.
  const rawBody =
    req.body instanceof Buffer
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

  const sigHeader = req.headers["stripe-signature"];
  const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  if (!sig) {
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
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Stripe sends either a raw id ("cus_…", "pi_…", "sub_…") or the expanded
 * object, depending on API version and expansion params. Expanded objects
 * always carry `id`.
 */
function stripeIdOf(
  value: string | CustomerRef | null | undefined,
): string | undefined {
  return value instanceof Object ? value.id : (value ?? undefined);
}

/** Get the subscription id from an invoice (Stripe v22 nests it under `parent`). */
function subscriptionIdOf(invoice: RuntimeInvoice): string | undefined {
  // Nested in parent.subscription_details (v22+); bare field on older API versions.
  return (
    stripeIdOf(invoice.parent?.subscription_details?.subscription) ??
    invoice.subscription ??
    undefined
  );
}

/** Get the payment_intent id from an invoice (legacy field on older API versions). */
function paymentIntentIdOf(invoice: RuntimeInvoice): string | undefined {
  return stripeIdOf(invoice.payment_intent);
}

/** Idempotency guard: have we already recorded a Payment for this Stripe id? */
async function alreadyProcessed(
  entities: BillingEntities,
  where: PaymentStripeIdLookup,
): Promise<boolean> {
  return !!(await entities.Payment.findFirst({ where }));
}

/** Pull priceKey + userId from the invoice's subscription (one Stripe call). */
async function resolveInvoiceSubscriptionMeta(
  invoice: RuntimeInvoice,
): Promise<SubscriptionMeta> {
  const subscriptionId = subscriptionIdOf(invoice);
  if (!subscriptionId) return {};
  try {
    const sub = await requireStripe().subscriptions.retrieve(subscriptionId);
    return {
      priceKey: sub.metadata?.priceKey,
      userId: sub.metadata?.userId,
    };
  } catch {
    console.warn("[webhook] Could not retrieve subscription for invoice.");
    return {};
  }
}

/** priceKey fallback: the first invoice line's price metadata (legacy shape). */
function priceKeyFromLines(invoice: RuntimeInvoice): string | undefined {
  // Optional chaining throughout: `lines`/`price` are legacy-shape fields that
  // may be absent on newer API versions.
  return invoice.lines?.data?.[0]?.price?.metadata?.actionamp_plan;
}

/** Find the user behind a Stripe `customer` field (id or embedded object). */
async function findUserByCustomer(
  entities: BillingEntities,
  customer: string | CustomerRef | null,
): Promise<BillingUser | null> {
  const customerId = stripeIdOf(customer);
  if (!customerId) return null;
  return entities.User.findFirst({
    where: { stripeCustomerId: customerId },
  });
}

/** Resolve an invoice's plan/label/renewal from a priceKey, with PRO defaults. */
function invoiceEntitlement(priceKey: string | undefined): ResolvedEntitlement {
  const entitlement = priceKey
    ? isPriceKey(priceKey)
      ? PRICING_ENTITLEMENT[priceKey]
      : null
    : null;
  return {
    plan: entitlement?.plan ?? "PRO",
    label: entitlement?.label ?? "Pro Subscription",
    renewalMs: entitlement?.renewalMs ?? 30 * 24 * 60 * 60 * 1000,
  };
}

// ── Event handlers ─────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
  context: WaspApiContext,
) {
  const session = event.data.object;

  // Only handle one-time payments here (prepaid).
  // Subscription checkouts trigger invoice.paid separately.
  if (session.mode === "subscription") {
    console.log(
      "[webhook] checkout.session.completed — subscription mode, skipping (invoice.paid will handle).",
    );
    return;
  }

  const userId = session.metadata?.userId;
  const priceKey = session.metadata?.priceKey;

  if (!userId || !priceKey) {
    console.error(
      "[webhook] checkout.session.completed — missing userId or priceKey in metadata.",
    );
    return;
  }

  // Idempotency: skip if we already processed this session
  if (
    await alreadyProcessed(context.entities, {
      stripeCheckoutSessionId: session.id,
    })
  ) {
    console.log(
      `[webhook] checkout.session.completed — already processed session ${session.id}, skipping.`,
    );
    return;
  }

  if (!isPriceKey(priceKey)) {
    console.error(`[webhook] Unknown priceKey: ${priceKey}`);
    return;
  }
  const entitlement = PRICING_ENTITLEMENT[priceKey];

  // Update user plan
  const planRenewsAt = entitlement.renewalMs
    ? new Date(Date.now() + entitlement.renewalMs)
    : null;

  await context.entities.User.update({
    where: { id: userId },
    data: {
      plan: entitlement.plan,
      planRenewsAt,
      stripeCustomerId: stripeIdOf(session.customer),
    },
  });

  // Record the payment
  await context.entities.Payment.create({
    data: {
      userId,
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      plan: entitlement.plan,
      description: entitlement.label,
      status: "SUCCEEDED",
      paidAt: new Date(),
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: stripeIdOf(session.payment_intent),
    },
  });

  void recordAnalyticsEventCore(
    context.entities,
    {
      name: "PAYMENT_CONFIRMED",
      visitorId: `user_${userId}`,
      route: priceKey === "founder" ? "/founding-100" : "/do/settings/billing",
      metadata: { plan: priceKey },
    },
    userId,
  ).catch(() => {});

  console.log(
    `[webhook] Checkout completed: userId=${userId}, plan=${entitlement.plan}`,
  );
}

async function handleInvoicePaid(
  event: Stripe.InvoicePaidEvent,
  context: WaspApiContext,
) {
  const invoice: RuntimeInvoice = event.data.object;
  const invoiceId = invoice.id;

  // Idempotency
  if (
    await alreadyProcessed(context.entities, { stripeInvoiceId: invoiceId })
  ) {
    console.log(
      `[webhook] invoice.paid — already processed invoice ${invoiceId}, skipping.`,
    );
    return;
  }

  // Prefer the subscription's metadata (priceKey + userId); fall back to the
  // invoice line's price metadata for the plan key.
  const subMeta = await resolveInvoiceSubscriptionMeta(invoice);
  const priceKey = subMeta.priceKey ?? priceKeyFromLines(invoice);

  // Resolve the user: subscription metadata first, then the Stripe customer.
  let userId = subMeta.userId;
  if (!userId) {
    userId = (await findUserByCustomer(context.entities, invoice.customer))?.id;
  }
  if (!userId) {
    console.error("[webhook] invoice.paid — could not determine userId.");
    return;
  }

  const { plan, label, renewalMs } = invoiceEntitlement(priceKey);

  // Update user plan
  await context.entities.User.update({
    where: { id: userId },
    data: {
      plan,
      planRenewsAt:
        plan === "FOUNDER" ? null : new Date(Date.now() + renewalMs),
    },
  });

  // Record the payment
  await context.entities.Payment.create({
    data: {
      userId,
      amount: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? "usd",
      plan,
      description: label,
      status: "SUCCEEDED",
      paidAt: new Date(),
      stripeInvoiceId: invoiceId,
      stripePaymentIntentId: paymentIntentIdOf(invoice),
    },
  });

  void recordAnalyticsEventCore(
    context.entities,
    {
      name: "PAYMENT_CONFIRMED",
      visitorId: `user_${userId}`,
      route: "/do/settings/billing",
      metadata: { plan: priceKey ?? "subscription" },
    },
    userId,
  ).catch(() => {});

  console.log(`[webhook] Invoice paid: userId=${userId}, plan=${plan}`);
}

async function handleInvoiceFailed(
  event: Stripe.InvoicePaymentFailedEvent,
  context: WaspApiContext,
) {
  const invoice: RuntimeInvoice = event.data.object;

  const user = await findUserByCustomer(context.entities, invoice.customer);
  if (!user) {
    console.error("[webhook] invoice.payment_failed — could not find user.");
    return;
  }

  // Record the failed payment. Note: we don't immediately revoke the plan —
  // Stripe retries and the user stays active during the grace period.
  // customer.subscription.deleted handles the actual downgrade.
  await context.entities.Payment.create({
    data: {
      userId: user.id,
      amount: invoice.amount_due ?? 0,
      currency: invoice.currency ?? "usd",
      plan: user.plan,
      description: "Payment failed",
      status: "FAILED",
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: paymentIntentIdOf(invoice),
    },
  });

  console.log(`[webhook] Invoice payment failed: userId=${user.id}`);
}

/** Subscription statuses where entitlement ends immediately. */
type TerminalStatus = "canceled" | "unpaid" | "incomplete_expired";

function isTerminalStatus(
  status: Stripe.Subscription.Status,
): status is TerminalStatus {
  switch (status) {
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return true;
    default:
      return false;
  }
}

async function handleSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionUpdatedEvent,
  context: WaspApiContext,
) {
  const subscription = event.data.object;
  const status = subscription.status;

  // Entitlement is driven by invoice.paid + .deleted. Here we only act on
  // terminal states as a safety net — if the sub is canceled/unpaid/incomplete,
  // expire now in case .deleted is missed or delayed. cancel_at_period_end is
  // intentionally a no-op (plan stays active until .deleted at period end).
  if (!isTerminalStatus(status)) {
    console.log(
      `[webhook] subscription.updated — status='${status}', no action.`,
    );
    return;
  }

  let userId: string | undefined = subscription.metadata?.userId;
  if (!userId) {
    userId = (await findUserByCustomer(context.entities, subscription.customer))
      ?.id;
  }

  if (!userId) {
    console.error(
      "[webhook] subscription.updated — could not determine userId for terminal expiry.",
    );
    return;
  }

  await context.entities.User.update({
    where: { id: userId },
    data: { planRenewsAt: new Date() },
  });

  console.log(
    `[webhook] subscription.updated — terminal status '${status}', expired userId=${userId}.`,
  );
}

async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
  context: WaspApiContext,
) {
  const subscription = event.data.object;
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error(
      "[webhook] subscription.deleted — missing userId in metadata.",
    );
    return;
  }

  // Set planRenewsAt to now so the UI shows expired
  await context.entities.User.update({
    where: { id: userId },
    data: {
      planRenewsAt: new Date(),
    },
  });

  console.log(
    `[webhook] Subscription deleted: userId=${userId} (plan expires now)`,
  );
}
