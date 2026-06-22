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
      "Checkout and webhook calls will fail. Set it in .env.server."
  );
}

export const stripe = new Stripe(stripeSecretKey ?? "", {
  // No explicit apiVersion — use the account's pinned version (stable).
});

/** Price IDs from env — these are public identifiers, not secrets. */
const priceIds = {
  proYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  proPrepaid: process.env.STRIPE_PRICE_PRO_PREPAID,
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

/**
 * Metadata plan label embedded in Stripe prices (matches setup-stripe.mjs).
 * Used by the webhook to map a price back to a plan/interval.
 */
export const PRICE_PLAN_LABEL: Record<PriceKey, string> = {
  proYearly: "Pro Yearly",
  proMonthly: "Pro Monthly",
  proPrepaid: "Pro Prepaid (12 mo, no auto-renew)",
};
