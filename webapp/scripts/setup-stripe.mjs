#!/usr/bin/env node
/**
 * ActionAmp — Stripe catalog setup (one-time, idempotent).
 *
 * Creates the Products and Prices for our pricing model (docs/PRICING.md):
 *   - ActionAmp Pro:   Yearly $79.50 (recurring), Monthly $12.95 (recurring),
 *                      Prepaid $90 (one-time, 12-mo)
 *
 * Idempotent: tags everything with `actionamp_product` / `actionamp_plan`
 * metadata and searches before creating — safe to re-run. Prints the price IDs
 * as a copy-paste block for .env.server at the end.
 *
 * USAGE:
 *   # Preview without touching Stripe:
 *   node scripts/setup-stripe.mjs --dry-run
 *
 *   # For real (key never gets committed; pass via env):
 *   STRIPE_SECRET_KEY=rk_... node scripts/setup-stripe.mjs
 *
 * SECURITY: use a RESTRICTED key (rk_) scoped to Products + Prices (Write),
 * not your full secret key (sk_). See docs/BILLING-INTEGRATION.md §8.
 */
import Stripe from "stripe";

const KEY = process.env.STRIPE_SECRET_KEY;
const DRY = process.argv.includes("--dry-run");
const CURRENCY = "usd";

/** Amounts are in cents (Stripe convention). */
const CATALOG = [
  {
    product: {
      name: "ActionAmp Pro",
      description: "Full ActionAmp — unlimited projects, goals, lenses, and power features.",
      metadata: { actionamp_product: "pro" },
    },
    prices: [
      {
        env: "STRIPE_PRICE_PRO_YEARLY",
        amount: 7950,
        recurring: { interval: "year" },
        metadata: { actionamp_plan: "pro_yearly", label: "Pro Yearly" },
      },
      {
        env: "STRIPE_PRICE_PRO_MONTHLY",
        amount: 1295,
        recurring: { interval: "month" },
        metadata: { actionamp_plan: "pro_monthly", label: "Pro Monthly" },
      },
      {
        env: "STRIPE_PRICE_PRO_PREPAID",
        amount: 9000,
        // one-time: grants a 12-month entitlement (handled by the webhook)
        metadata: { actionamp_plan: "pro_prepaid", label: "Pro Prepaid (12 mo, no auto-renew)" },
      },
      {
        env: "STRIPE_PRICE_FOUNDER",
        amount: 13900,
        // one-time: lifetime Pro (Founding 100). Capped at 100 spots — enforced
        // server-side at checkout, not by Stripe.
        metadata: { actionamp_plan: "founder", label: "Founding 100 (lifetime)" },
      },
    ],
  },
];

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

if (DRY) {
  console.log("DRY RUN — no Stripe calls will be made.\n");
  for (const c of CATALOG) {
    console.log(`Product: ${c.product.name}`);
    for (const p of c.prices) {
      const kind = p.recurring ? `recurring / ${p.recurring.interval}` : "one-time";
      console.log(`  ${money(p.amount)} ${CURRENCY}  (${kind})  →  ${p.env}`);
    }
    console.log();
  }
  console.log("Run for real with:  STRIPE_SECRET_KEY=rk_... node scripts/setup-stripe.mjs");
  process.exit(0);
}

if (!KEY) {
  console.error(
    "Missing STRIPE_SECRET_KEY. Usage:\n  STRIPE_SECRET_KEY=rk_... node scripts/setup-stripe.mjs\n\nAdd --dry-run to preview.",
  );
  process.exit(1);
}

// No explicit apiVersion: product/price endpoints are stable across versions;
// Stripe returns data in the account's pinned version.
const stripe = new Stripe(KEY);

const findProduct = async (value) => {
  const res = await stripe.products.search({
    query: `metadata['actionamp_product']:'${value}'`,
    limit: 1,
  });
  return res.data[0] ?? null;
};

const findPrice = async (value) => {
  const res = await stripe.prices.search({
    query: `metadata['actionamp_plan']:'${value}'`,
    limit: 1,
  });
  return res.data[0] ?? null;
};

const out = {};

try {
  for (const c of CATALOG) {
    const productKey = c.product.metadata.actionamp_product;
    let product = await findProduct(productKey);
    if (product) {
      console.log(`reuse  product  "${c.product.name}"  →  ${product.id}`);
    } else {
      product = await stripe.products.create(c.product);
      console.log(`create product  "${c.product.name}"  →  ${product.id}`);
    }

    for (const p of c.prices) {
      const planKey = p.metadata.actionamp_plan;
      let price = await findPrice(planKey);
      if (price) {
        console.log(`reuse  price    ${planKey}  →  ${price.id}`);
      } else {
        price = await stripe.prices.create({
          product: product.id,
          currency: CURRENCY,
          unit_amount: p.amount,
          ...(p.recurring ? { recurring: { interval: p.recurring.interval } } : {}),
          metadata: p.metadata,
        });
        const kind = p.recurring ? p.recurring.interval : "one-time";
        console.log(`create price   ${planKey}  ${money(p.amount)} (${kind})  →  ${price.id}`);
      }
      out[p.env] = price.id;
    }
    console.log();
  }

  console.log("✅ Done. Add to webapp/.env.server:\n");
  for (const [k, v] of Object.entries(out)) {
    console.log(`${k}=${v}`);
  }
  console.log("\nNext: set up the webhook endpoint (docs/BILLING-INTEGRATION.md Phase 2).");
} catch (err) {
  console.error("\n❌ Setup failed:\n", err.message);
  if (err.type === "StripeAuthenticationError") {
    console.error("\nThe key was rejected. Check it's a valid restricted (rk_) or secret (sk_) key.");
  }
  process.exit(1);
}
