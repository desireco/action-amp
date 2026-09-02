/**
 * Ported from webapp/src/billing/operations.ts (S16) — the checkout/portal
 * SESSION PARAMS + the Founding-100 cap decision, as pure cores.
 *
 * The webapp ops embedded these inline in the Wasp actions with the Stripe
 * SDK's own param objects; the pieces that are pure data/decisions live here
 * so the API fragment (api/src/procedures/billing.ts) stays a thin
 * wrapper: it resolves the Stripe customer, then hands the built params to
 * `stripe.checkout.sessions.create` / `billingPortal.sessions.create`.
 *
 * Exact webapp shapes (s16-billing/README.md §1):
 *   - priceKeys: proYearly/proMonthly → subscription mode, dashboard Price;
 *     proPrepaid/founder → payment mode + invoice_creation (receipts for
 *     one-time payments); founder charges inline price_data ($99 — no
 *     dashboard Price object), success_url /founding-100/welcome, cancel_url
 *     /founding-100; everything else round-trips the Billing tab with
 *     ?checkout=success|cancelled. metadata {userId, priceKey} on the session
 *     (and the subscription, so invoice.paid can resolve them);
 *     allow_promotion_codes: true; automatic_tax OFF.
 *   - founder cap: PUBLIC cap = 100 − 2 partner reserve; per-request count
 *     (soft cap — a race between two checkouts is acceptable; the webhook is
 *     the final source of truth), 409 "All public Founding memberships have
 *     been claimed."
 *   - portal: no stripeCustomerId → the webapp's plain-error string.
 *   - billing status: { plan, planRenewsAt, isPaid, isFounder, payments }
 *     with payments = last 50, createdAt desc (our audit trail, not Stripe's).
 */
import {
  FOUNDING_100_CAP,
  FOUNDING_100_LAUNCH_PARTNER_RESERVE,
  FOUNDING_100_PRICE_CENTS,
  FOUNDING_100_PUBLIC_CAP,
  FOUNDER_MEMBERSHIP_WHERE,
  isPaidPlan,
} from "./config.js";
import { HttpError } from "../projects/httpError.js";
import type { Payment, Plan, User } from "../db/index.js";

/** The checkout price keys the op accepts (webapp arg union — camelCase). */
export type CheckoutPriceKey = "proYearly" | "proMonthly" | "proPrepaid" | "founder";

const RECURRING_KEYS: readonly CheckoutPriceKey[] = ["proYearly", "proMonthly"];

/** The Stripe Price id resolver (the API layer's env-backed getPriceId). */
export type ResolvePriceId = (key: Exclude<CheckoutPriceKey, "founder">) => string;

/** checkout.sessions.create params — the structural subset we build. */
export interface CheckoutSessionParams {
  customer: string;
  line_items: Array<
    | { price: string; quantity: number }
    | {
        price_data: {
          currency: string;
          unit_amount: number;
          product_data: { name: string };
        };
        quantity: number;
      }
  >;
  mode: "subscription" | "payment";
  success_url: string;
  cancel_url: string;
  metadata: { userId: string; priceKey: CheckoutPriceKey };
  allow_promotion_codes: boolean;
  subscription_data?: { metadata: { userId: string; priceKey: CheckoutPriceKey } };
  invoice_creation?: { enabled: boolean };
}

/** The origin the success/cancel/return URLs hang off (webapp WASP_WEB_CLIENT_URL). */
export function resolveOrigin(webClientUrl: string | undefined): string {
  return webClientUrl ?? "http://localhost:4000";
}

/** Founders land on a dedicated thank-you page; everyone else returns to the
 *  billing page with a success banner. */
export function checkoutSuccessUrl(
  priceKey: CheckoutPriceKey,
  origin: string,
): string {
  return priceKey === "founder"
    ? `${origin}/founding-100/welcome`
    : `${origin}/do/settings/billing?checkout=success`;
}

export function checkoutCancelUrl(
  priceKey: CheckoutPriceKey,
  origin: string,
): string {
  return priceKey === "founder"
    ? `${origin}/founding-100`
    : `${origin}/do/settings/billing?checkout=cancelled`;
}

/**
 * Build the exact checkout.sessions.create params for a plan key.
 *
 * line_items: the founder tier charges inline (price_data) — no Price object
 * in the dashboard, the amount lives in code (FOUNDING_100_PRICE_CENTS). The
 * recurring/one-time Pro tiers use the dashboard-resolved priceId passed in
 * via `resolvePriceId` (subscriptions require a real Price object).
 */
export function buildCheckoutSessionParams(options: {
  priceKey: CheckoutPriceKey;
  customerId: string;
  userId: string;
  origin: string;
  resolvePriceId: ResolvePriceId;
}): CheckoutSessionParams {
  const { priceKey, customerId, userId, origin, resolvePriceId } = options;

  const isRecurring = RECURRING_KEYS.includes(priceKey);

  const lineItems: CheckoutSessionParams["line_items"] =
    priceKey === "founder"
      ? [
          {
            price_data: {
              currency: "usd",
              unit_amount: FOUNDING_100_PRICE_CENTS,
              // One-time product data — name shown on the Checkout page.
              product_data: { name: "Founding 100 — Lifetime Pro" },
            },
            quantity: 1,
          },
        ]
      : [
          {
            price: resolvePriceId(
              priceKey as Exclude<CheckoutPriceKey, "founder">,
            ),
            quantity: 1,
          },
        ];

  return {
    customer: customerId,
    line_items: lineItems,
    mode: isRecurring ? "subscription" : "payment",
    success_url: checkoutSuccessUrl(priceKey, origin),
    cancel_url: checkoutCancelUrl(priceKey, origin),
    metadata: { userId, priceKey },
    allow_promotion_codes: true,
    // invoice_creation is needed for one-time payments (Stripe auto-invoices
    // subscriptions); without it, prepaid/founder buyers get no receipt.
    ...(isRecurring
      ? { subscription_data: { metadata: { userId, priceKey } } }
      : { invoice_creation: { enabled: true } }),
  };
}

/** billingPortal.sessions.create params (webapp createCustomerPortalSession). */
export function buildPortalSessionParams(options: {
  customerId: string;
  origin: string;
}): { customer: string; return_url: string } {
  return {
    customer: options.customerId,
    return_url: `${options.origin}/do/settings/billing`,
  };
}

/** The exact "not managed by Stripe yet" error (webapp's plain-Error string). */
export const NO_BILLING_ACCOUNT_MESSAGE =
  "No billing account found for this user.";

/**
 * The Founding-100 status: how many public memberships remain. Two of the 100
 * lifetime spots are held for launch partners (S15 serves the same payload —
 * founding100Payload — as the public query; this one exists for the checkout
 * cap decision's shared math).
 */
export function founding100Status(claimed: number): {
  cap: number;
  reserved: number;
  claimed: number;
  remaining: number;
  isFull: boolean;
} {
  return {
    cap: FOUNDING_100_CAP,
    reserved: FOUNDING_100_LAUNCH_PARTNER_RESERVE,
    claimed,
    remaining: Math.max(0, FOUNDING_100_PUBLIC_CAP - claimed),
    isFull: claimed >= FOUNDING_100_PUBLIC_CAP,
  };
}

/**
 * The checkout-side founder cap: throw the webapp's exact 409 when the PUBLIC
 * cap is reached (billed + manual founders; never FRIEND —
 * FOUNDER_MEMBERSHIP_WHERE). Call BEFORE any Stripe session is created.
 */
export function assertFounderCapAvailable(claimed: number): void {
  if (claimed >= FOUNDING_100_PUBLIC_CAP) {
    throw new HttpError(
      409,
      "All public Founding memberships have been claimed.",
    );
  }
}

// ── Billing status (webapp getBillingStatus) ────────────────────────────────

/** The user fields the status view reads (the acting user's own row). */
export interface BillingStatusUser {
  id: string;
  plan: Plan;
  planRenewsAt: Date | null;
}

export interface BillingStatusView {
  plan: Plan;
  planRenewsAt: Date | null;
  isPaid: boolean;
  isFounder: boolean;
  payments: Payment[];
}

/** The delegate slice the status read touches. */
export interface BillingStatusEntities {
  Payment: {
    findMany(args: {
      where: { userId: string };
      orderBy: { createdAt: "desc" };
      take: number;
    }): Promise<Payment[]>;
  };
}

/**
 * The user's billing status: their plan, whether it's active, the renewal/
 * expiry date, and their payment history (our own audit trail, not Stripe's).
 *
 * `plan` / `planRenewsAt` also live on the acting user, but returning a
 * computed view keeps the UI logic in one place and bundles the history in a
 * single round-trip.
 */
export async function getBillingStatusCore(
  entities: BillingStatusEntities,
  user: BillingStatusUser,
): Promise<BillingStatusView> {
  const payments = await entities.Payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50, // recent history; pagination later if needed
  });

  return {
    plan: user.plan,
    planRenewsAt: user.planRenewsAt,
    isPaid: isPaidPlan(user.plan),
    isFounder: user.plan === "FOUNDER",
    payments,
  };
}

/** The user row shape the checkout op needs (full read by PK). */
export type CheckoutUser = Pick<User, "id" | "stripeCustomerId">;

/** The delegate slice the checkout/portal ops touch. */
export interface CheckoutEntities {
  User: {
    findUnique(args: { where: { id: string } }): Promise<User | null>;
    update(args: {
      where: { id: string };
      data: { stripeCustomerId: string };
    }): Promise<User>;
    count(args: {
      where: typeof FOUNDER_MEMBERSHIP_WHERE;
    }): Promise<number>;
  };
}

/**
 * Reuse or create the user's Stripe customer id. The API layer's
 * `createCustomer` dep talks to Stripe (metadata: { userId }); the id is
 * persisted for future checkouts (webapp createCheckoutSession).
 */
export async function ensureStripeCustomerId(
  entities: CheckoutEntities,
  user: CheckoutUser,
  createCustomer: (options: { metadata: { userId: string } }) => Promise<{ id: string }>,
): Promise<string> {
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await createCustomer({ metadata: { userId: user.id } });
    customerId = customer.id;

    // Persist the customer ID for future checkouts
    await entities.User.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }
  return customerId;
}
