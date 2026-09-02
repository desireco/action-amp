/**
 * The billing core (S16) — the pure, testable slice of procedures/billing.ts
 * (the publicCore.ts precedent: vitest can't invoke oRPC procedure objects
 * directly, so everything a unit test wants to pin lives HERE; the handlers
 * in billing.ts are ~5-line wrappers).
 *
 * Ported from webapp/src/billing/operations.ts (s16-billing/README.md §1 is
 * the parity checklist):
 *   - createCheckoutSession: founder-cap 409 BEFORE any Stripe call; reuse-or-
 *     create the Stripe customer (persisted); exact session params from the
 *     domain core; CHECKOUT_STARTED funnel event fired on the redirect path
 *     (fire-and-forget); NEVER mutates the plan — the webhook owns truth.
 *   - createCustomerPortalSession: no stripeCustomerId → the webapp's plain
 *     "No billing account found for this user." error (500, like the webapp's
 *     untyped throw).
 *   - getBillingStatus: the { plan, planRenewsAt, isPaid, isFounder, payments }
 *     view, payments serialized for the wire (ISO strings).
 */
import type { Entities } from "@actionamp/domain/db";
import {
  assertFounderCapAvailable,
  buildCheckoutSessionParams,
  buildPortalSessionParams,
  ensureStripeCustomerId,
  getBillingStatusCore,
  NO_BILLING_ACCOUNT_MESSAGE,
  resolveOrigin,
  type BillingStatusView,
  type CheckoutPriceKey,
  type CheckoutSessionParams,
} from "@actionamp/domain/billing";
import { FOUNDER_MEMBERSHIP_WHERE } from "@actionamp/domain/billing";
import { getPriceId, requireStripe } from "../billing/stripe.js";
import { recordPublicAnalyticsEvent } from "./publicCore.js";
import type { DomainDb } from "@actionamp/domain/db";

/** The Stripe calls the checkout/portal ops make — the explicit seam tests
 *  swap (the webapp stripeCalls pattern; real impls resolve requireStripe()). */
export interface BillingStripeOps {
  createCustomer(options: {
    metadata: { userId: string };
  }): Promise<{ id: string }>;
  createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<{ url?: string | null }>;
  /** Portal sessions always carry the hosted URL (webapp SDK semantics). */
  createPortalSession(params: {
    customer: string;
    return_url: string;
  }): Promise<{ url: string }>;
}

export const billingStripeOps: BillingStripeOps = {
  createCustomer: (options) => requireStripe().customers.create(options),
  createCheckoutSession: (params) =>
    requireStripe().checkout.sessions.create(params),
  createPortalSession: (params) =>
    requireStripe().billingPortal.sessions.create(params),
};

export interface BillingOpsDeps {
  db: DomainDb;
  entities: Entities;
  stripeOps: BillingStripeOps;
  /** The WASP_WEB_CLIENT_URL env value (injected for tests). */
  webClientUrl?: string;
  /** The CHECKOUT_STARTED recorder (defaults to the S15 public ingest). */
  recordCheckoutStarted?: (
    event: {
      name: "CHECKOUT_STARTED";
      visitorId: string;
      route: string;
      metadata: { plan: string };
    },
    userId: string,
  ) => Promise<unknown>;
}

function defaultCheckoutRecorder(
  db: DomainDb,
): NonNullable<BillingOpsDeps["recordCheckoutStarted"]> {
  return (event, userId) => recordPublicAnalyticsEvent(db, event, userId);
}

/**
 * Create a Stripe Checkout Session for the given plan. Returns `{ url }` —
 * the client redirects. This NEVER mutates User.plan — that's the webhook's
 * job (source of truth).
 */
export async function createCheckoutSessionCore(
  deps: BillingOpsDeps,
  args: { priceKey: CheckoutPriceKey },
  user: { id: string },
): Promise<{ url: string }> {
  const { priceKey } = args;

  // Founding 100 cap: 98 memberships are available through public checkout;
  // two are reserved for launch partners and granted manually.
  // Enforced server-side (the one place that matters); the client just renders
  // the count. A race between two checkouts is acceptable (the webhook is the
  // final source of truth and the count is re-checked here); the cap is a soft
  // 100, not a precise mutex. // ponytail: per-request count, not a lock — if
  // throughput ever made this racy we'd add a SELECT FOR UPDATE or a counter row.
  if (priceKey === "founder") {
    const claimed = await deps.entities.User.count({
      where: FOUNDER_MEMBERSHIP_WHERE,
    });
    assertFounderCapAvailable(claimed);
  }

  // Fetch the full user record (the acting user doesn't carry stripeCustomerId).
  const dbUser = await deps.entities.User.findUnique({
    where: { id: user.id },
  });
  if (!dbUser) {
    throw new Error("User not found.");
  }

  // Reuse or create a Stripe Customer (persisted for future checkouts).
  const customerId = await ensureStripeCustomerId(
    deps.entities,
    dbUser,
    deps.stripeOps.createCustomer,
  );

  const origin = resolveOrigin(deps.webClientUrl);
  const params = buildCheckoutSessionParams({
    priceKey,
    customerId,
    userId: dbUser.id,
    origin,
    resolvePriceId: getPriceId,
  });

  const session = await deps.stripeOps.createCheckoutSession(params);

  if (!session.url) {
    throw new Error("Stripe Checkout Session has no URL.");
  }

  // Funnel event BEFORE the money path (fire-and-forget; never blocks the
  // redirect — the webapp's recordAnalyticsEventCore(...).catch(() => {})).
  const record = deps.recordCheckoutStarted ?? defaultCheckoutRecorder(deps.db);
  void record(
    {
      name: "CHECKOUT_STARTED",
      visitorId: `user_${dbUser.id}`,
      route: priceKey === "founder" ? "/founding-100" : "/do/settings/billing",
      metadata: { plan: priceKey },
    },
    dbUser.id,
  ).catch(() => {});

  return { url: session.url };
}

/**
 * Create a Stripe Customer Portal session for the user to self-serve manage
 * their subscription: cancel, update card, switch plan, view invoices.
 *
 * Requires the user to have a stripeCustomerId (set on first checkout).
 * Throws otherwise — the UI only shows the button to paid users, so this
 * should never hit.
 */
export async function createCustomerPortalSessionCore(
  deps: BillingOpsDeps,
  user: { id: string },
): Promise<{ url: string }> {
  const dbUser = await deps.entities.User.findUnique({
    where: { id: user.id },
  });
  if (!dbUser) {
    throw new Error("User not found.");
  }

  if (!dbUser.stripeCustomerId) {
    throw new Error(NO_BILLING_ACCOUNT_MESSAGE);
  }

  const origin = resolveOrigin(deps.webClientUrl);
  const session = await deps.stripeOps.createPortalSession(
    buildPortalSessionParams({ customerId: dbUser.stripeCustomerId, origin }),
  );

  return { url: session.url };
}

// ----------------------------------------------------------------
// Billing status serialization (the wire DTO the contract declares)
// ----------------------------------------------------------------

/** ISO datetime string on the wire (Date in the domain rows). */
function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function serializePayment(payment: BillingStatusView["payments"][number]) {
  return {
    id: payment.id,
    description: payment.description,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    plan: payment.plan,
    paidAt: iso(payment.paidAt),
    createdAt: iso(payment.createdAt) ?? new Date(0).toISOString(),
  };
}

/** The acting user fields the status view reads. SAFETY: the session/PAT
 *  auth paths type plan as `string`; the column enum is the contract. */
export interface BillingStatusActingUser {
  id: string;
  plan: "FREE" | "PRO" | "FOUNDER";
  planRenewsAt: Date | null;
}

export async function getBillingStatusWire(
  entities: Entities,
  user: BillingStatusActingUser,
): Promise<{
  plan: "FREE" | "PRO" | "FOUNDER";
  planRenewsAt: string | null;
  isPaid: boolean;
  isFounder: boolean;
  payments: ReturnType<typeof serializePayment>[];
}> {
  const view = await getBillingStatusCore(entities, user);
  return {
    plan: view.plan,
    planRenewsAt: iso(view.planRenewsAt),
    isPaid: view.isPaid,
    isFounder: view.isFounder,
    payments: view.payments.map(serializePayment),
  };
}
