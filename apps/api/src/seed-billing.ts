/**
 * S16 e2e seed — `bun src/seed-billing.ts` (idempotent, localhost-only).
 *
 * Ensures the Billing-tab fixture users exist (dev-style, via the F10c
 * helper) with exactly the plan/entitlement rows the billing spec asserts
 * against:
 *
 *   s16-pro@test.local     BILLED PRO (renews in a year) + stripeCustomerId
 *                          + two SUCCEEDED payment rows (Yearly $79.50,
 *                          Monthly $12.95).
 *   s16-founder@test.local BILLED FOUNDER (lifetime: planRenewsAt null) +
 *                          stripeCustomerId + the $99 founder payment row
 *                          ("Founding 100 (lifetime)").
 *   s16-free@test.local    FREE, no payments, no Stripe customer — the
 *                          upgrade screen + ProGate surface.
 *   s16-manual@test.local  plan FREE + manualAccessGrant PRO — the manual
 *                          grant semantics (resolveEffectiveAccess
 *                          precedence: manual beats stripe, grants access
 *                          without a Payment trail). This is the
 *                          "manualAccessGrant equivalence" the billing
 *                          fixtures document: a manual PRO grant entitles
 *                          exactly like billed PRO, minus the payments.
 *
 * RESET semantics on the billing FIELDS ONLY (plan/planRenewsAt/
 * stripeCustomerId/manualAccessGrant + the fixture users' Payment rows are
 * wiped and re-created each run); the users' tasks/projects/lenses from the
 * other seeds are untouched. Billed fixtures carry REAL Stripe-shaped rows —
 * the plan state the webhook would have written — because the webhook itself
 * cannot fire in e2e (no Stripe network in dev; TEST-MODE dry runs are the
 * V2 rehearsal's job).
 */
import { eq } from "drizzle-orm";
import {
  createDb,
  payment as paymentTable,
  user as userTable,
} from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { databaseUrl, isLocalDatabaseUrl } from "./db.js";
import { ensureEmailUser } from "./auth/seed-session.js";

const YEAR = 365 * 24 * 60 * 60 * 1000;

const PRO_EMAIL = "s16-pro@test.local";
const FOUNDER_EMAIL = "s16-founder@test.local";
const FREE_EMAIL = "s16-free@test.local";
const MANUAL_EMAIL = "s16-manual@test.local";

async function resetPayments(db: DomainDb, userId: string): Promise<void> {
  await db.delete(paymentTable).where(eq(paymentTable.userId, userId));
}

interface PaymentFix {
  description: string;
  amount: number;
  plan: "PRO" | "FOUNDER";
  paidAt: Date;
  stripeInvoiceId: string;
}

async function ensureBillingUser(
  db: DomainDb,
  email: string,
  fields: {
    plan: "FREE" | "PRO" | "FOUNDER";
    planRenewsAt: Date | null;
    stripeCustomerId: string | null;
    manualAccessGrant?: "PRO" | null;
  },
  payments: PaymentFix[],
): Promise<string> {
  const seeded = await ensureEmailUser(db, email);
  await db
    .update(userTable)
    .set({
      plan: fields.plan,
      planRenewsAt: fields.planRenewsAt,
      stripeCustomerId: fields.stripeCustomerId,
      manualAccessGrant: fields.manualAccessGrant ?? null,
    })
    .where(eq(userTable.id, seeded.userId));

  await resetPayments(db, seeded.userId);
  for (const fix of payments) {
    await db.insert(paymentTable).values({
      id: crypto.randomUUID(),
      userId: seeded.userId,
      amount: fix.amount,
      currency: "usd",
      plan: fix.plan,
      description: fix.description,
      status: "SUCCEEDED",
      paidAt: fix.paidAt,
      stripeInvoiceId: fix.stripeInvoiceId,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
    });
  }
  return seeded.userId;
}

const url = databaseUrl();
if (!isLocalDatabaseUrl(url)) {
  console.error(
    `Refusing to seed: DATABASE_URL host is not localhost (${url.replace(/\/\/[^@/]*@/, "//<redacted>@")}). ` +
      "The seed writes rows and only ever runs against a local dev database.",
  );
  process.exit(1);
}

const db = createDb(url);
try {
  const proUserId = await ensureBillingUser(
    db,
    PRO_EMAIL,
    {
      plan: "PRO",
      planRenewsAt: new Date(Date.now() + YEAR),
      stripeCustomerId: "cus_test_s16_pro",
    },
    [
      {
        description: "Pro Yearly",
        amount: 7950,
        plan: "PRO",
        paidAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        stripeInvoiceId: "in_test_s16_pro_yearly",
      },
      {
        description: "Pro Monthly",
        amount: 1295,
        plan: "PRO",
        paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        stripeInvoiceId: "in_test_s16_pro_monthly",
      },
    ],
  );

  const founderUserId = await ensureBillingUser(
    db,
    FOUNDER_EMAIL,
    // Lifetime: planRenewsAt stays null — isPlanActive is unconditional for FOUNDER.
    {
      plan: "FOUNDER",
      planRenewsAt: null,
      stripeCustomerId: "cus_test_s16_founder",
    },
    [
      {
        description: "Founding 100 (lifetime)",
        amount: 9900,
        plan: "FOUNDER",
        paidAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        stripeInvoiceId: "in_test_s16_founder",
      },
    ],
  );

  const freeUserId = await ensureBillingUser(
    db,
    FREE_EMAIL,
    { plan: "FREE", planRenewsAt: null, stripeCustomerId: null },
    [],
  );

  // The manual-grant equivalence: no Stripe facts at all, but
  // resolveEffectiveAccess answers PRO (source "manual") — entitled like the
  // billed Pro user, with an empty payment history.
  const manualUserId = await ensureBillingUser(
    db,
    MANUAL_EMAIL,
    {
      plan: "FREE",
      planRenewsAt: null,
      stripeCustomerId: null,
      manualAccessGrant: "PRO",
    },
    [],
  );

  console.log(
    JSON.stringify({
      event: "billing-seeded",
      pro: { email: PRO_EMAIL, userId: proUserId },
      founder: { email: FOUNDER_EMAIL, userId: founderUserId },
      free: { email: FREE_EMAIL, userId: freeUserId },
      manual: { email: MANUAL_EMAIL, userId: manualUserId },
    }),
  );
} finally {
  await db.$client.end();
}
