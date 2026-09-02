// Ported from webapp/src/billing/webhook.test.ts (S16) — the per-event
// behavior suite. The transport guard rails (500/400 status codes, signature
// verification) moved WITH the endpoint to api/src/webhooks-stripe.test.ts;
// everything here drives the cores directly with mock entities and pins the
// exact seam effects of each verified event (the money-path check: what a
// verified webhook does to a user's plan + payment record can't silently
// change in a refactor).
//
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCheckoutCompletedCore,
  handleInvoiceFailedCore,
  handleInvoicePaidCore,
  handleSubscriptionDeletedCore,
  handleSubscriptionUpdatedCore,
  type BillingCheckoutSession,
  type BillingInvoice,
  type BillingSubscription,
} from "./webhookCore.js";
import { mockContext, type MockContext } from "../test/mockContext.js";

/** Test seam for invoice.paid's one network call (swapped in beforeEach). */
const retrieveSubscription = vi.fn();

/** Analytics spy — the fire-and-forget PAYMENT_CONFIRMED recorder. */
const recordAnalytics = vi.fn().mockResolvedValue({ recorded: true });

/** Fields used by the synthetic Stripe payloads below (each fixture provides
 *  only what its handler reads — mirrors the real payloads' shape). */
interface StripeFixture {
  id?: string;
  mode?: string;
  status?: string;
  subscription?: string;
  metadata?: Record<string, string>;
  customer?: string | { id: string };
  payment_intent?: string | { id: string };
  amount_total?: number;
  amount_paid?: number;
  amount_due?: number;
  currency?: string;
}

beforeEach(() => {
  vi.clearAllMocks();
  retrieveSubscription.mockResolvedValue({ metadata: {} });
  recordAnalytics.mockClear();
});

// ── checkout.session.completed (one-time / prepaid) ─────────────────────────

describe("checkout.session.completed", () => {
  const run = (m: MockContext, object: StripeFixture) =>
    handleCheckoutCompletedCore(
      m.context.entities,
      { ...object } as BillingCheckoutSession,
      { recordAnalytics },
    );

  it("skips subscription-mode sessions (invoice.paid handles those)", async () => {
    const m = mockContext();
    await run(m, { id: "cs_1", mode: "subscription" });
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("skips when metadata is missing userId/priceKey", async () => {
    const m = mockContext();
    await run(m, { id: "cs_1", mode: "payment", metadata: {} });
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
  });

  it("skips a session already recorded (idempotency)", async () => {
    const m = mockContext();
    m.entities.Payment.findFirst.mockResolvedValue({ id: "pay_existing" });
    await run(m, {
      id: "cs_dup",
      mode: "payment",
      metadata: { userId: "user-1", priceKey: "pro_prepaid" },
      amount_total: 9900,
      currency: "usd",
    });
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
    expect(m.entities.Payment.findFirst).toHaveBeenCalledWith({
      where: { stripeCheckoutSessionId: "cs_dup" },
    });
  });

  it("skips an unknown priceKey", async () => {
    const m = mockContext();
    await run(m, {
      id: "cs_1",
      mode: "payment",
      metadata: { userId: "user-1", priceKey: "bogus" },
      amount_total: 100,
      currency: "usd",
    });
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
  });

  it("grants PRO prepaid, stamps the customer, and records the payment", async () => {
    const m = mockContext();
    await run(m, {
      id: "cs_1",
      mode: "payment",
      metadata: { userId: "user-1", priceKey: "pro_prepaid" },
      amount_total: 9900,
      currency: "usd",
      customer: "cus_abc",
      payment_intent: "pi_xyz",
    });

    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        plan: "PRO",
        planRenewsAt: expect.any(Date),
        stripeCustomerId: "cus_abc",
      },
    });
    expect(m.entities.Payment.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        amount: 9900,
        currency: "usd",
        plan: "PRO",
        description: "Pro Prepaid (12 mo)",
        status: "SUCCEEDED",
        paidAt: expect.any(Date),
        stripeCheckoutSessionId: "cs_1",
        stripePaymentIntentId: "pi_xyz",
      },
    });
  });

  it("grants FOUNDER lifetime (planRenewsAt stays null)", async () => {
    const m = mockContext();
    await run(m, {
      id: "cs_1",
      mode: "payment",
      metadata: { userId: "user-1", priceKey: "founder" },
      amount_total: 9900,
      currency: "usd",
      customer: { id: "cus_obj" }, // object form — extractId must resolve it
      payment_intent: { id: "pi_obj" },
    });

    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        plan: "FOUNDER",
        planRenewsAt: null,
        stripeCustomerId: "cus_obj",
      },
    });
    expect(m.entities.Payment.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        amount: 9900,
        currency: "usd",
        plan: "FOUNDER",
        description: "Founding 100 (lifetime)",
        status: "SUCCEEDED",
        paidAt: expect.any(Date),
        stripeCheckoutSessionId: "cs_1",
        stripePaymentIntentId: "pi_obj",
      },
    });
  });

  it("fires PAYMENT_CONFIRMED with the founder route (analytics)", async () => {
    const m = mockContext();
    await run(m, {
      id: "cs_1",
      mode: "payment",
      metadata: { userId: "user-1", priceKey: "founder" },
      amount_total: 9900,
      currency: "usd",
    });
    expect(recordAnalytics).toHaveBeenCalledWith(
      {
        name: "PAYMENT_CONFIRMED",
        visitorId: "user_user-1",
        route: "/founding-100",
        metadata: { plan: "founder" },
      },
      "user-1",
    );
  });

  it("replays are no-ops: a second delivery of the same session skips the writes", async () => {
    // The idempotency replay: after the first delivery recorded the Payment,
    // the findFirst guard answers truthy and nothing runs again.
    const m = mockContext();
    m.entities.Payment.findFirst.mockResolvedValue({ id: "pay_1" });
    await run(m, {
      id: "cs_1",
      mode: "payment",
      metadata: { userId: "user-1", priceKey: "pro_prepaid" },
      amount_total: 9900,
      currency: "usd",
    });
    expect(m.entities.User.update).not.toHaveBeenCalled();
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(recordAnalytics).not.toHaveBeenCalled();
  });
});

// ── invoice.paid (subscriptions) ────────────────────────────────────────────

describe("invoice.paid", () => {
  const run = (m: MockContext, object: StripeFixture) =>
    handleInvoicePaidCore(m.context.entities, { ...object } as BillingInvoice, {
      retrieveSubscription,
      recordAnalytics,
    });

  it("reads plan + userId from the subscription metadata", async () => {
    const m = mockContext();
    retrieveSubscription.mockResolvedValue({
      metadata: { priceKey: "pro_yearly", userId: "user-1" },
    });

    await run(m, {
      id: "in_1",
      subscription: "sub_1",
      amount_paid: 4900,
      currency: "usd",
    });

    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { plan: "PRO", planRenewsAt: expect.any(Date) },
    });
    expect(m.entities.Payment.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        amount: 4900,
        currency: "usd",
        plan: "PRO",
        description: "Pro Yearly",
        status: "SUCCEEDED",
        paidAt: expect.any(Date),
        stripeInvoiceId: "in_1",
        stripePaymentIntentId: undefined,
      },
    });
  });

  it("skips an already-processed invoice (idempotency)", async () => {
    const m = mockContext();
    m.entities.Payment.findFirst.mockResolvedValue({ id: "pay_old" });
    retrieveSubscription.mockResolvedValue({ metadata: {} });

    await run(m, {
      id: "in_dup",
      subscription: "sub_1",
      amount_paid: 4900,
      currency: "usd",
    });

    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("falls back to the line price metadata, then the customerId, for the user", async () => {
    const m = mockContext();
    retrieveSubscription.mockResolvedValue({ metadata: {} });
    m.entities.User.findFirst.mockResolvedValue({ id: "user-2", plan: "FREE" });

    await run(m, {
      id: "in_2",
      subscription: "sub_2",
      amount_paid: 1900,
      currency: "usd",
      customer: "cus_abc",
    });

    // No priceKey resolved → defaults to PRO / "Pro Subscription" / 30-day renewal.
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { plan: "PRO", planRenewsAt: expect.any(Date) },
    });
    expect(m.entities.Payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-2",
        plan: "PRO",
        description: "Pro Subscription",
      }),
    });
    // The fallback path: the customer-id lookup ran.
    expect(m.entities.User.findFirst).toHaveBeenCalledWith({
      where: { stripeCustomerId: "cus_abc" },
    });
  });

  it("reads the subscription id from the v22 parent shape and the priceKey from line metadata", async () => {
    const m = mockContext();
    retrieveSubscription.mockResolvedValue({
      metadata: { userId: "user-1" },
    });

    await handleInvoicePaidCore(
      m.context.entities,
      {
        id: "in_22",
        parent: { subscription_details: { subscription: "sub_22" } },
        lines: { data: [{ price: { metadata: { actionamp_plan: "pro_yearly" } } }] },
        amount_paid: 7950,
        currency: "usd",
      } as unknown as BillingInvoice,
      { retrieveSubscription, recordAnalytics },
    );

    // v22 parent shape resolved → the retrieve call got the nested id; the
    // line metadata carried the priceKey.
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_22");
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { plan: "PRO", planRenewsAt: expect.any(Date) },
    });
    expect(m.entities.Payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Pro Yearly",
      }),
    });
  });

  it("skips when no userId can be determined", async () => {
    const m = mockContext();
    retrieveSubscription.mockResolvedValue({ metadata: {} });
    await run(m, {
      id: "in_3",
      subscription: "sub_3",
      amount_paid: 1900,
      currency: "usd",
    });
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });
});

// ── invoice.payment_failed ──────────────────────────────────────────────────

describe("invoice.payment_failed", () => {
  const run = (m: MockContext, object: StripeFixture) =>
    handleInvoiceFailedCore(m.context.entities, {
      ...object,
    } as BillingInvoice);

  it("records a FAILED payment for the known customer (no plan change)", async () => {
    const m = mockContext();
    m.entities.User.findFirst.mockResolvedValue({ id: "user-1", plan: "PRO" });

    await run(m, {
      id: "in_fail",
      amount_due: 1900,
      currency: "usd",
      customer: "cus_abc",
      payment_intent: "pi_fail",
    });

    expect(m.entities.Payment.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        amount: 1900,
        currency: "usd",
        plan: "PRO",
        description: "Payment failed",
        status: "FAILED",
        stripeInvoiceId: "in_fail",
        stripePaymentIntentId: "pi_fail",
      },
    });
    // Grace period: a failed payment must NOT revoke the plan.
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("skips when no user matches the customer", async () => {
    const m = mockContext();
    await run(m, {
      id: "in_fail",
      amount_due: 1900,
      currency: "usd",
      customer: "cus_unknown",
    });
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
  });
});

// ── customer.subscription.updated (terminal-status safety net) ───────────────

describe("customer.subscription.updated", () => {
  const run = (m: MockContext, object: StripeFixture) =>
    handleSubscriptionUpdatedCore(m.context.entities, {
      ...object,
    } as BillingSubscription);

  it("no-ops on a non-terminal status (e.g. active)", async () => {
    const m = mockContext();
    await run(m, { status: "active", metadata: { userId: "user-1" } });
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("no-ops on cancel_at_period_end-style statuses (plan stays until .deleted)", async () => {
    const m = mockContext();
    await run(m, { status: "past_due", metadata: { userId: "user-1" } });
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("expires immediately on a terminal status (canceled)", async () => {
    const m = mockContext();
    await run(m, { status: "canceled", metadata: { userId: "user-1" } });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { planRenewsAt: expect.any(Date) },
    });
  });

  it("resolves userId via customerId when metadata is absent", async () => {
    const m = mockContext();
    m.entities.User.findFirst.mockResolvedValue({ id: "user-9", plan: "PRO" });
    await run(m, { status: "unpaid", customer: "cus_abc" });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-9" },
      data: { planRenewsAt: expect.any(Date) },
    });
  });
});

// ── customer.subscription.deleted ───────────────────────────────────────────

describe("customer.subscription.deleted", () => {
  const run = (m: MockContext, object: StripeFixture) =>
    handleSubscriptionDeletedCore(m.context.entities, {
      ...object,
    } as BillingSubscription);

  it("expires the plan (planRenewsAt = now), leaving the plan field as-is", async () => {
    const m = mockContext();
    await run(m, { metadata: { userId: "user-1" } });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { planRenewsAt: expect.any(Date) },
    });
    const data = (m.entities.User.update.mock.calls[0] as any[])[0].data;
    expect("plan" in data).toBe(false);
  });

  it("skips when metadata has no userId", async () => {
    const m = mockContext();
    await run(m, { metadata: {} });
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });
});
