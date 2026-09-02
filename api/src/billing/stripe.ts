/**
 * Stripe client singleton + price-ID lookups from env — the S16 port of
 * webapp/src/billing/stripe.ts. Server-only — never import this on the client.
 *
 */
import Stripe from "stripe";

// Read at CALL time, not import time: bun loads api/.env before user code in
// dev, and tests deliberately delete the key to exercise the unconfigured
// guard — an import-time capture would freeze whichever state came first.
let cached: { key: string; client: Stripe } | null = null;

/**
 * The Stripe client (cached per key), throwing with a clear message when
 * STRIPE_SECRET_KEY is unset. Server-op call sites use this so a missing key
 * surfaces as a readable error instead of a null member access.
 */
export function requireStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // Allow startup without the key (dev may not have Stripe set up yet);
    // calls fail at runtime with this readable error instead.
    throw new Error(
      "[billing/stripe] STRIPE_SECRET_KEY is not set — Stripe calls are unavailable. Set it in .env.server.",
    );
  }
  if (!cached || cached.key !== key) {
    cached = { key, client: new Stripe(key) };
  }
  return cached.client;
}

/** Whether a Stripe key is configured (the webhook's configured-500 rail). */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Price IDs from env — these are public identifiers, not secrets. */
const priceIds = {
  proYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  proPrepaid: process.env.STRIPE_PRICE_PRO_PREPAID,
  founder: process.env.STRIPE_PRICE_FOUNDER,
} as const;

export type PriceEnvKey = keyof typeof priceIds;

/**
 * Returns the Stripe Price ID for a given plan key.
 * Throws if the env var is missing — fail fast at checkout time.
 */
export function getPriceId(key: PriceEnvKey): string {
  const id = priceIds[key];
  if (!id) {
    throw new Error(`Missing env var for price key: ${key}`);
  }
  return id;
}
