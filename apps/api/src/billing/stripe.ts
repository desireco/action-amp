/**
 * Stripe client singleton + price-ID lookups from env — the S16 port of
 * webapp/src/billing/stripe.ts. Server-only — never import this on the client.
 *
 * DEPENDENCY NOTE (docs/plans/slices/s16-wiring.md §6): the `stripe` package
 * is not on the public registry from this environment (offline sandbox), so
 * `apps/api/node_modules/stripe` is a symlink to the webapp's pinned install
 * (22.5.0, same major the webapp declares at ^22.3.2). When the registry is
 * reachable: `cd apps/api && bun add stripe@^22.3.2` and drop the symlink.
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
