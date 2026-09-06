/**
 * Stripe client singleton + price-ID lookups from env.
 *
 * Server-only — never import this on the client.
 */

import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  // Allow startup without the key (dev may not have Stripe set up yet).
  // Calls will fail at runtime with StripeAuthenticationError.
  console.warn(
    "[billing/stripe] STRIPE_SECRET_KEY is not set. " +
      "Checkout and webhook calls will fail. Set it in .env.server.",
  );
}

/**
 * The Stripe client, or null when STRIPE_SECRET_KEY is missing (dev may not
 * have Stripe set up — the startup warning above flags it). Call sites guard
 * and fail with a clear runtime error instead of a typed null masquerading
 * as a client.
 */
export const stripe: Stripe | null = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      // No explicit apiVersion — use the account's pinned version (stable).
    })
  : null;

/**
 * The Stripe client, throwing with a clear message when unconfigured.
 * Server-op call sites use this so a missing STRIPE_SECRET_KEY surfaces as a
 * readable error instead of a null member access.
 */
export function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error(
      "[billing/stripe] STRIPE_SECRET_KEY is not set — Stripe calls are unavailable. Set it in .env.server.",
    );
  }
  return stripe;
}

/** Price IDs from env — these are public identifiers, not secrets. */
const priceIds = {
  proYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  proPrepaid: process.env.STRIPE_PRICE_PRO_PREPAID,
  founder: process.env.STRIPE_PRICE_FOUNDER,
} as const;

export type PriceKey = keyof typeof priceIds;

/**
 * Returns the Stripe Price ID for a given plan key.
 * Throws if the env var is missing — fail fast at checkout time.
 */
export function getPriceId(key: PriceKey): string {
  const id = priceIds[key];
  if (!id) {
    throw new Error(`Missing env var for price key: ${key}`);
  }
  return id;
}
