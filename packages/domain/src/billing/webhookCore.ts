/**
 * Ported from webapp/src/billing/webhook.ts (S16) — the webhook event
 * HANDLERS as pure cores. The transport layer (Express req/res, signature
 * verification, guard-rail status codes) stayed Wasp-shaped there; here the
 * cores receive the already-verified Stripe event payload and the seam
 * entities, so the money-path mutations are unit-testable without the SDK or
 * an HTTP server. The Hono endpoint that verifies signatures and maps guard
 * rails to statuses lives in api/src/webhooks-stripe.ts.
 *
 * Behaviors are VERBATIM (s16-billing/README.md §3.1 is the checklist):
 *
 *   - checkout.session.completed    → one-time payments only (subscription
 *     mode is skipped — invoice.paid owns it); idempotent on
 *     stripeCheckoutSessionId; grants plan + stamps the Stripe customer.
 *   - invoice.paid                  → subscription payments; idempotent on
 *     stripeInvoiceId; priceKey/userId from the subscription metadata (one
 *     retrieve call), falling back to the first line's price metadata, then
 *     the Stripe customer; unknown priceKey → PRO defaults.
 *   - invoice.payment_failed        → FAILED Payment row; does NOT revoke the
 *     plan (grace period — Stripe retries; .deleted downgrades).
 *   - customer.subscription.updated → safety net: terminal statuses
 *     (canceled/unpaid/incomplete_expired) expire the plan NOW; every other
 *     status (incl. cancel_at_period_end) is a no-op.
 *   - customer.subscription.deleted → expires the plan (planRenewsAt = now);
 *     the plan FIELD is left as-is — expiry is what downgrades.
 *
 * Typing port decision: the webapp handlers consumed the Stripe SDK's
 * `Stripe.Checkout.Session` / `Stripe.Invoice` / `Stripe.Subscription` types.
 * The domain stays SDK-free (README rule: no framework/vendor imports in
 * cores), so the payloads are typed as the STRUCTURAL subsets the handlers
 * read — the real SDK objects are assignable to them, and the API layer's
 * `constructEvent` result casts are the only seam. The v22-vs-legacy invoice
 * field drift keeps its explicit adapter type (`BillingStripeInvoice`).
 *
 * Stripe network calls go through injected deps (`BillingWebhookDeps`): the
 * subscription retrieve (invoice.paid's one network call) and the analytics
 * recorder (PAYMENT_CONFIRMED, fire-and-forget — the webapp's
 * recordAnalyticsEventCore call).
 */
import type { Plan, User } from "../db/index.js";

// ── Domain contracts (verbatim from the webapp handler) ────────────────────

/** Plan values this module may write to User.plan (subset of the Plan enum). */
type WebhookPlan = Extract<Plan, "PRO" | "FOUNDER">;

/** Stripe-side ids a Payment row is deduplicated on (idempotency guard). */
interface PaymentStripeIdLookup {
  stripeCheckoutSessionId?: string;
  stripeInvoiceId?: string;
}

/** Plan + renewal granted by a price key (from setup-stripe.mjs metadata). */
export interface PricingEntitlement {
  plan: WebhookPlan;
  /** null → planRenewsAt stays null (never expires). */
  renewalMs: number | null;
  label: string;
}

/** The invoiceEntitlement fallback resolution (PRO defaults when unknown). */
interface ResolvedEntitlement {
  plan: WebhookPlan;
  label: string;
  renewalMs: number;
}

/** priceKey/userId as read off a subscription's metadata. */
export interface SubscriptionMeta {
  priceKey?: string;
  userId?: string;
}

// ── Structural Stripe payload subsets (see the typing port decision) ───────

/** The user behind a Stripe `customer` field (raw id or any expanded object). */
export interface StripeRef {
  id: string;
}

/** checkout.session.completed's `data.object` — the fields the handler reads. */
export interface BillingCheckoutSession {
  id: string;
  mode?: string;
  metadata?: Record<string, string> | null;
  customer?: string | StripeRef | null;
  payment_intent?: string | StripeRef | null;
  amount_total?: number | null;
  currency?: string | null;
}

/** Invoice fields the SDK's current types may no longer declare (API-version
 *  drift adapter — the webapp's LegacyInvoiceFields). */
interface LegacyInvoiceFields {
  payment_intent?: string | StripeRef | null;
  subscription?: string | null;
  lines?: {
    data?: Array<{ price?: { metadata?: { actionamp_plan?: string } } }>;
  };
  /** v22 nests the subscription under parent.subscription_details. */
  parent?: {
    subscription_details?: { subscription?: string | StripeRef | null };
  };
}

export type BillingInvoice = LegacyInvoiceFields & {
  id?: string;
  amount_paid?: number | null;
  amount_due?: number | null;
  currency?: string | null;
  customer?: string | StripeRef | null;
};

/** customer.subscription.{updated,deleted}'s `data.object`. */
export interface BillingSubscription {
  id?: string;
  status?: string;
  metadata?: Record<string, string> | null;
  customer?: string | StripeRef | null;
}

/** The one Stripe network call invoice.paid makes (sub metadata read). */
export type RetrieveSubscription = (
  subscriptionId: string,
) => Promise<{ metadata?: Record<string, string> | null }>;

/** The fire-and-forget PAYMENT_CONFIRMED recorder (webapp recordAnalyticsEventCore). */
export type RecordPaymentAnalytics = (
  event: {
    name: "PAYMENT_CONFIRMED";
    visitorId: string;
    route: string;
    metadata: { plan: string };
  },
  userId: string,
) => Promise<unknown>;

export interface BillingWebhookDeps {
  retrieveSubscription: RetrieveSubscription;
  recordAnalytics?: RecordPaymentAnalytics;
}

/** The Prisma-delegate slice the handlers touch, typed with the seam's arg
 *  types (the webapp handler's BillingEntities, re-expressed over the seam). */
export interface BillingWebhookEntities {
  User: {
    findFirst(args: {
      where: { stripeCustomerId?: string };
    }): Promise<User | null>;
    update(args: {
      where: { id: string };
      data: {
        plan?: Plan;
        planRenewsAt?: Date | null;
        stripeCustomerId?: string | null;
      };
    }): Promise<User>;
  };
  Payment: {
    findFirst(args: {
      where: PaymentStripeIdLookup;
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        userId: string;
        amount: number;
        currency?: string;
        plan: Plan;
        description: string;
        status?: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
        paidAt?: Date | null;
        stripePaymentIntentId?: string | null;
        stripeInvoiceId?: string | null;
        stripeCheckoutSessionId?: string | null;
      };
    }): Promise<{ id: string }>;
  };
}

// ── Pricing map (verbatim — the priceKey → entitlement contract) ───────────

/**
 * Maps price metadata keys (from setup-stripe.mjs) → our Plan + renewal duration.
 */
export const PRICING_ENTITLEMENT = {
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
export type PriceKey = "pro_yearly" | "pro_monthly" | "pro_prepaid" | "founder";

export function isPriceKey(value: string): value is PriceKey {
  const keys: readonly string[] = PRICE_KEYS;
  return keys.includes(value);
}

// ── Helpers (verbatim) ──────────────────────────────────────────────────────

/**
 * Stripe sends either a raw id ("cus_…", "pi_…", "sub_…") or the expanded
 * object, depending on API version and expansion params. Expanded objects
 * always carry `id`.
 */
export function stripeIdOf(
  value: string | StripeRef | null | undefined,
): string | undefined {
  return value instanceof Object ? value.id : (value ?? undefined);
}

/** Get the subscription id from an invoice (Stripe v22 nests it under `parent`). */
export function subscriptionIdOf(invoice: BillingInvoice): string | undefined {
  // Nested in parent.subscription_details (v22+); bare field on older API versions.
  return (
    stripeIdOf(invoice.parent?.subscription_details?.subscription) ??
    invoice.subscription ??
    undefined
  );
}

/** Get the payment_intent id from an invoice (legacy field on older API versions). */
export function paymentIntentIdOf(invoice: BillingInvoice): string | undefined {
  return stripeIdOf(invoice.payment_intent);
}

/** Idempotency guard: have we already recorded a Payment for this Stripe id? */
async function alreadyProcessed(
  entities: BillingWebhookEntities,
  where: PaymentStripeIdLookup,
): Promise<boolean> {
  const existing = await entities.Payment.findFirst({ where });
  return existing !== null && existing !== undefined;
}

/** Pull priceKey + userId from the invoice's subscription (one Stripe call). */
export async function resolveInvoiceSubscriptionMeta(
  invoice: BillingInvoice,
  retrieveSubscription: RetrieveSubscription,
): Promise<SubscriptionMeta> {
  const subscriptionId = subscriptionIdOf(invoice);
  if (!subscriptionId) return {};
  try {
    const sub = await retrieveSubscription(subscriptionId);
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
export function priceKeyFromLines(invoice: BillingInvoice): string | undefined {
  // Optional chaining throughout: `lines`/`price` are legacy-shape fields that
  // may be absent on newer API versions.
  return invoice.lines?.data?.[0]?.price?.metadata?.actionamp_plan;
}

/** Find the user behind a Stripe `customer` field (id or embedded object). */
export async function findUserByCustomer(
  entities: BillingWebhookEntities,
  customer: string | StripeRef | null | undefined,
): Promise<User | null> {
  const customerId = stripeIdOf(customer);
  if (!customerId) return null;
  return entities.User.findFirst({
    where: { stripeCustomerId: customerId },
  });
}

/** Resolve an invoice's plan/label/renewal from a priceKey, with PRO defaults. */
export function invoiceEntitlement(
  priceKey: string | undefined,
): ResolvedEntitlement {
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

// ── Event handlers (cores — bodies verbatim from the webapp) ────────────────

export async function handleCheckoutCompletedCore(
  entities: BillingWebhookEntities,
  session: BillingCheckoutSession,
  deps?: Pick<BillingWebhookDeps, "recordAnalytics">,
): Promise<void> {
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
    await alreadyProcessed(entities, {
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

  await entities.User.update({
    where: { id: userId },
    data: {
      plan: entitlement.plan,
      planRenewsAt,
      stripeCustomerId: stripeIdOf(session.customer),
    },
  });

  // Record the payment
  await entities.Payment.create({
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

  if (deps?.recordAnalytics) {
    void deps
      .recordAnalytics(
        {
          name: "PAYMENT_CONFIRMED",
          visitorId: `user_${userId}`,
          route: priceKey === "founder" ? "/founding-100" : "/do/settings/billing",
          metadata: { plan: priceKey },
        },
        userId,
      )
      .catch(() => {});
  }

  console.log(
    `[webhook] Checkout completed: userId=${userId}, plan=${entitlement.plan}`,
  );
}

export async function handleInvoicePaidCore(
  entities: BillingWebhookEntities,
  invoice: BillingInvoice,
  deps: BillingWebhookDeps,
): Promise<void> {
  const invoiceId = invoice.id;

  // Idempotency
  if (await alreadyProcessed(entities, { stripeInvoiceId: invoiceId })) {
    console.log(
      `[webhook] invoice.paid — already processed invoice ${invoiceId}, skipping.`,
    );
    return;
  }

  // Prefer the subscription's metadata (priceKey + userId); fall back to the
  // invoice line's price metadata for the plan key.
  const subMeta = await resolveInvoiceSubscriptionMeta(
    invoice,
    deps.retrieveSubscription,
  );
  const priceKey = subMeta.priceKey ?? priceKeyFromLines(invoice);

  // Resolve the user: subscription metadata first, then the Stripe customer.
  let userId = subMeta.userId;
  if (!userId) {
    userId = (await findUserByCustomer(entities, invoice.customer))?.id;
  }
  if (!userId) {
    console.error("[webhook] invoice.paid — could not determine userId.");
    return;
  }

  const { plan, label, renewalMs } = invoiceEntitlement(priceKey);

  // Update user plan
  await entities.User.update({
    where: { id: userId },
    data: {
      plan,
      planRenewsAt:
        plan === "FOUNDER" ? null : new Date(Date.now() + renewalMs),
    },
  });

  // Record the payment
  await entities.Payment.create({
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

  if (deps.recordAnalytics) {
    void deps
      .recordAnalytics(
        {
          name: "PAYMENT_CONFIRMED",
          visitorId: `user_${userId}`,
          route: "/do/settings/billing",
          metadata: { plan: priceKey ?? "subscription" },
        },
        userId,
      )
      .catch(() => {});
  }

  console.log(`[webhook] Invoice paid: userId=${userId}, plan=${plan}`);
}

export async function handleInvoiceFailedCore(
  entities: BillingWebhookEntities,
  invoice: BillingInvoice,
): Promise<void> {
  const user = await findUserByCustomer(entities, invoice.customer);
  if (!user) {
    console.error("[webhook] invoice.payment_failed — could not find user.");
    return;
  }

  // Record the failed payment. Note: we don't immediately revoke the plan —
  // Stripe retries and the user stays active during the grace period.
  // customer.subscription.deleted handles the actual downgrade.
  await entities.Payment.create({
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
export type TerminalStatus = "canceled" | "unpaid" | "incomplete_expired";

export function isTerminalStatus(
  status: string | undefined,
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

export async function handleSubscriptionUpdatedCore(
  entities: BillingWebhookEntities,
  subscription: BillingSubscription,
): Promise<void> {
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
    userId = (await findUserByCustomer(entities, subscription.customer))?.id;
  }

  if (!userId) {
    console.error(
      "[webhook] subscription.updated — could not determine userId for terminal expiry.",
    );
    return;
  }

  await entities.User.update({
    where: { id: userId },
    data: { planRenewsAt: new Date() },
  });

  console.log(
    `[webhook] subscription.updated — terminal status '${status}', expired userId=${userId}.`,
  );
}

export async function handleSubscriptionDeletedCore(
  entities: BillingWebhookEntities,
  subscription: BillingSubscription,
): Promise<void> {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error(
      "[webhook] subscription.deleted — missing userId in metadata.",
    );
    return;
  }

  // Set planRenewsAt to now so the UI shows expired
  await entities.User.update({
    where: { id: userId },
    data: {
      planRenewsAt: new Date(),
    },
  });

  console.log(
    `[webhook] Subscription deleted: userId=${userId} (plan expires now)`,
  );
}
