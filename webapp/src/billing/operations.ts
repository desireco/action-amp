import type { GetBillingStatus } from "wasp/server/operations";
import { isPaidPlan } from "./config";
import { stripe, getPriceId } from "./stripe";

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
 * The client calls this with a plan key (e.g. "founder"), gets back a URL,
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

export const createCheckoutSession = (async (
  args: { priceKey: "proYearly" | "proMonthly" | "proPrepaid" },
  context
) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const { priceKey } = args;
  const priceId = getPriceId(priceKey);
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

  // automatic_tax + allow_promotion_codes apply to both modes.
  // invoice_creation is needed for one-time payments (Stripe auto-invoices
  // subscriptions); without it, prepaid/founder buyers get no receipt.
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: isRecurring ? ("subscription" as const) : ("payment" as const),
    success_url: `${origin}/app/settings/billing?checkout=success`,
    cancel_url: `${origin}/app/settings/billing?checkout=cancelled`,
    metadata: { userId: dbUser.id, priceKey },
    automatic_tax: { enabled: true },
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

  return { url: session.url };
}) satisfies CreateCheckoutSession<{ priceKey: "proYearly" | "proMonthly" | "proPrepaid" }, { url: string }>;

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
    return_url: `${origin}/app/settings/billing`,
  });

  return { url: session.url };
}) satisfies CreateCustomerPortalSession<void, { url: string }>;
