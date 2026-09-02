/**
 * The billing contract — S16 (billing + entitlements).
 *
 * Ported from webapp/src/billing/operations.ts's three session-auth ops (the
 * parity checklist lives in s16-billing/README.md §1–§2):
 *
 * - `createCheckoutSession` — Stripe Checkout for a plan key; NEVER mutates
 *   the plan (the webhook owns truth). The founder key enforces the
 *   Founding-100 public cap server-side: 98 public spots (100 − 2 partner
 *   reserve) → CONFLICT 409 "All public Founding memberships have been
 *   claimed." Stripe-side config failures surface as INTERNAL (the webapp's
 *   untyped throw); the 409 is the one declared error clients branch on.
 * - `createCustomerPortalSession` — Stripe Billing Portal `{ url }`.
 * - `getBillingStatus` — `{ plan, planRenewsAt, isPaid, isFounder, payments }`
 *   (payments = last 50, createdAt desc — our own audit trail, not Stripe's).
 *
 * The public Founding-100 status count is NOT here — it shipped with S15 as
 * `public.getFounding100Status` (+ the REST twin `GET /founding-100/status`).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

/** The checkout price keys (webapp operations.ts arg union). */
export const CheckoutPriceKeySchema = z.enum([
  "proYearly",
  "proMonthly",
  "proPrepaid",
  "founder",
]);
export type CheckoutPriceKey = z.infer<typeof CheckoutPriceKeySchema>;

/** The Founding-100 cap conflict (declared so clients can branch on it). */
export const CheckoutErrorMap = {
  CONFLICT: { status: 409, message: "Conflict" },
} as const;

/** One payment-history row — the fields the Billing tab's table renders. */
export const BillingPaymentSchema = z.object({
  id: z.string(),
  description: z.string(),
  /** Cents (webapp Payment.amount Int). */
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"]),
  plan: z.enum(["FREE", "PRO", "FOUNDER"]),
  /** ISO datetime on the wire (Date in the domain rows). */
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});

/** The billing status view (webapp getBillingStatus's return shape). */
export const BillingStatusSchema = z.object({
  plan: z.enum(["FREE", "PRO", "FOUNDER"]),
  /** null for FREE + FOUNDER (lifetime); ISO datetime on the wire. */
  planRenewsAt: z.string().nullable(),
  isPaid: z.boolean(),
  isFounder: z.boolean(),
  payments: z.array(BillingPaymentSchema),
});
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

/** Start a Stripe Checkout session → `{ url }` (redirect target). */
export const createCheckoutSession = oc
  .errors(CheckoutErrorMap)
  .input(z.object({ priceKey: CheckoutPriceKeySchema }))
  .output(z.object({ url: z.string() }));

/** Open the Stripe Customer Portal → `{ url }`. */
export const createCustomerPortalSession = oc.output(
  z.object({ url: z.string() }),
);

/** The signed-in user's plan + payment history. */
export const getBillingStatus = oc.output(BillingStatusSchema);

/**
 * The billing namespace — paths:
 * POST /rpc/billing/{createCheckoutSession,createCustomerPortalSession,getBillingStatus}.
 * Composed into the tree by src/router.ts (the composition line lives in
 * docs/plans/slices/s16-wiring.md).
 */
export const billingContract = {
  createCheckoutSession,
  createCustomerPortalSession,
  getBillingStatus,
};
