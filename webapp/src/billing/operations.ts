import type { GetBillingStatus } from "wasp/server/operations";
import {
  isPaidPlan,
  FOUNDING_100_CAP,
  FOUNDING_100_LAUNCH_PARTNER_RESERVE,
  FOUNDING_100_PRICE_CENTS,
  FOUNDING_100_PUBLIC_CAP,
  FOUNDER_MEMBERSHIP_WHERE,
} from "./config";
import { stripe, getPriceId } from "./stripe";
import { HttpError } from "wasp/server";
import type { Request, Response } from "express";

/**
 * The user's billing status: their plan, whether it's active, the renewal/
 * expiry date, and their payment history (our own audit trail, not Stripe's).
 *
 * `plan` / `planRenewsAt` also live on the user object via useAuth(), but
 * returning a computed view here keeps the UI logic in one place and bundles
 * the history in a single round-trip.
 */
export const getBillingStatus = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const u = context.user;

  const payments = await context.entities.Payment.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: "desc" },
    take: 50, // recent history; pagination later if needed
  });

  return {
    plan: u.plan,
    planRenewsAt: u.planRenewsAt,
    isPaid: isPaidPlan(u.plan),
    isFounder: u.plan === "FOUNDER",
    payments,
  };
}) satisfies GetBillingStatus<void>;

/**
 * Create a Stripe Checkout Session for the given plan.
 *
 * The client calls this with a plan key (e.g. "proYearly"), gets back a URL,
 * and redirects the user to Stripe-hosted Checkout. This action NEVER mutates
 * `User.plan` — that's the webhook's job (source of truth).
 *
 * - Recurring plans (pro_yearly, pro_monthly) → `mode: "subscription"`
 * - One-time plans (pro_prepaid, founder) → `mode: "payment"`
 */
import type {
  CreateCheckoutSession,
  CreateCustomerPortalSession,
} from "wasp/server/operations";
import { recordAnalyticsEventCore } from "../analytics/operationsCore";

export const createCheckoutSession = (async (
  args: { priceKey: "proYearly" | "proMonthly" | "proPrepaid" | "founder" },
  context
) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const { priceKey } = args;

  // Founding 100 cap: 98 memberships are available through public checkout;
  // two are reserved for launch partners and granted manually.
  // Enforced server-side (the one place that matters); the client just renders
  // the count. A race between two checkouts is acceptable (the webhook is the
  // final source of truth and the count is re-checked here); the cap is a soft
  // 100, not a precise mutex. // ponytail: per-request count, not a lock — if
  // throughput ever made this racy we'd add a SELECT FOR UPDATE or a counter row.
  if (priceKey === "founder") {
    const claimed = await context.entities.User.count({
      where: FOUNDER_MEMBERSHIP_WHERE,
    });
    if (claimed >= FOUNDING_100_PUBLIC_CAP) {
      throw new HttpError(409, "All public Founding memberships have been claimed.");
    }
  }

  const authUser = context.user;

  // Fetch full user record (AuthUser doesn't have email/fullName/stripeCustomerId)
  const dbUser = await context.entities.User.findUniqueOrThrow({
    where: { id: authUser.id },
  });

  // Reuse or create a Stripe Customer
  let customerId = dbUser.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { userId: dbUser.id },
    });
    customerId = customer.id;

    // Persist the customer ID for future checkouts
    await context.entities.User.update({
      where: { id: dbUser.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const isRecurring = priceKey === "proYearly" || priceKey === "proMonthly";
  const origin = process.env.WASP_WEB_CLIENT_URL ?? "http://localhost:4000";

  // Founders land on a dedicated thank-you page; everyone else returns to the
  // billing page with a success banner.
  const successUrl = priceKey === "founder"
    ? `${origin}/founding-100/welcome`
    : `${origin}/do/settings/billing?checkout=success`;
  const cancelUrl = priceKey === "founder"
    ? `${origin}/founding-100`
    : `${origin}/do/settings/billing?checkout=cancelled`;

  // line_items: the founder tier charges inline (price_data) — no Price object
  // in the dashboard, the amount lives in code (FOUNDING_100_PRICE_CENTS). The
  // recurring Pro tiers still use the dashboard-resolved priceId (subscriptions
  // require a real Price object).
  const lineItems = priceKey === "founder"
    ? [{
        price_data: {
          currency: "usd",
          unit_amount: FOUNDING_100_PRICE_CENTS,
          // One-time product data — name shown on the Checkout page.
          product_data: { name: "Founding 100 — Lifetime Pro" },
        },
        quantity: 1,
      }]
    : [{ price: getPriceId(priceKey), quantity: 1 }];

  // automatic_tax is OFF — Stripe's tax calc requires an address on the
  // Customer (or capturing one in Checkout), and we don't want to gate the
  // $139 founder purchase on that for a soft launch. Prices are flat; handle
  // tax manually if/when volume warrants it. allow_promotion_codes + the
  // invoice_creation block below still apply to both modes.
  // invoice_creation is needed for one-time payments (Stripe auto-invoices
  // subscriptions); without it, prepaid/founder buyers get no receipt.
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: lineItems,
    mode: isRecurring ? ("subscription" as const) : ("payment" as const),
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId: dbUser.id, priceKey },
    allow_promotion_codes: true,
    ...(isRecurring
      ? {
          subscription_data: {
            metadata: { userId: dbUser.id, priceKey },
          },
        }
      : {
          invoice_creation: { enabled: true },
        }),
  });

  if (!session.url) {
    throw new Error("Stripe Checkout Session has no URL.");
  }

  void recordAnalyticsEventCore(context.entities, {
    name: "CHECKOUT_STARTED",
    visitorId: `user_${dbUser.id}`,
    route: priceKey === "founder" ? "/founding-100" : "/do/settings/billing",
    metadata: { plan: priceKey },
  }, dbUser.id).catch(() => {});

  return { url: session.url };
}) satisfies CreateCheckoutSession<{ priceKey: "proYearly" | "proMonthly" | "proPrepaid" | "founder" }, { url: string }>;

/**
 * Create a Stripe Customer Portal session for the user to self-serve manage
 * their subscription: cancel, update card, switch plan, view invoices.
 *
 * Stripe returns a hosted URL; we redirect the client there. Requires the user
 * to have a stripeCustomerId (set on first checkout). Throws otherwise — the
 * UI only shows the button to paid users, so this should never hit.
 */
export const createCustomerPortalSession = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const dbUser = await context.entities.User.findUniqueOrThrow({
    where: { id: context.user.id },
  });

  if (!dbUser.stripeCustomerId) {
    throw new Error("No billing account found for this user.");
  }

  const origin = process.env.WASP_WEB_CLIENT_URL ?? "http://localhost:4000";
  const session = await stripe.billingPortal.sessions.create({
    customer: dbUser.stripeCustomerId,
    return_url: `${origin}/do/settings/billing`,
  });

  return { url: session.url };
}) satisfies CreateCustomerPortalSession<void, { url: string }>;

/**
 * The Founding 100 status: how many public memberships remain. Two of the 100
 * lifetime spots are held for launch partners.
 * Public (auth not required) so the landing page can render the live count.
 * User-specific state ("am I already a founder?") comes from useAuth() on the
 * client — this query returns only the global count.
 */
import type { GetFounding100Status } from "wasp/server/operations";

export const getFounding100Status = (async (_args, context) => {
  const claimed = await context.entities.User.count({
    where: FOUNDER_MEMBERSHIP_WHERE,
  });
  return {
    cap: FOUNDING_100_CAP,
    reserved: FOUNDING_100_LAUNCH_PARTNER_RESERVE,
    claimed,
    remaining: Math.max(0, FOUNDING_100_PUBLIC_CAP - claimed),
    isFull: claimed >= FOUNDING_100_PUBLIC_CAP,
  };
}) satisfies GetFounding100Status<void>;

/**
 * Public REST endpoint — `GET /founding-100/status`. Same payload as the
 * query above, exposed as a stable HTTP contract for the Astro marketing site
 * (which can't call Wasp's internal RPC). Public (no auth); returns only the
 * global count, never user-specific state. PII-free.
 *
 * The Astro landing page fetches this client-side to surface the live
 * spots-remaining count and cut off the offer when `isFull`.
 */
type StatusApiContext = {
  entities: { User: { count: (args: { where: Record<string, unknown> }) => Promise<number> } };
};

export const founding100StatusHandler = async (
  _req: Request,
  res: Response,
  context: StatusApiContext
) => {
  const claimed = await context.entities.User.count({
    where: FOUNDER_MEMBERSHIP_WHERE,
  });
  res.set("Cache-Control", "public, max-age=60");
  return res.json({
    cap: FOUNDING_100_CAP,
    reserved: FOUNDING_100_LAUNCH_PARTNER_RESERVE,
    claimed,
    remaining: Math.max(0, FOUNDING_100_PUBLIC_CAP - claimed),
    isFull: claimed >= FOUNDING_100_PUBLIC_CAP,
  });
};
