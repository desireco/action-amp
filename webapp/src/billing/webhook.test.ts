// @vitest-environment node
// Webhook tests run in node: the handler imports the server-only `stripe`
// singleton and reads process.env.STRIPE_WEBHOOK_SECRET. No DOM APIs here.
//
// Synthetic Stripe events + Express req/res are built as plain objects cast to
// the SDK/router types — `any` is intentional and matches the project's test
// convention (see src/test/mockContext.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Stripe singleton so we control event construction (bypass real
// signature crypto) and subscription retrieval, without touching the network.
vi.mock("./stripe", () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));

import type Stripe from "stripe";
import { stripeWebhook } from "./webhook";
import { stripe } from "./stripe";
import { mockContext, type MockContext } from "../test/mockContext";

/**
 * Stripe webhook — the ONLY place User.plan changes. Money-path: the suite
 * pins the exact Prisma effects of each handler so a refactor can't silently
 * change what a verified event does to a user's plan or payment record.
 *
 * Strategy: drive the real `stripeWebhook` API handler with a mocked Stripe
 * client (constructEvent returns a synthetic event; subscriptions.retrieve is
 * controlled) and a mocked Wasp context, then assert on the entity spies.
 */

const SECRET = "whsec_test";

/** Minimal Express req: a Buffer body (express.raw) + overridable headers. */
function fakeReq(
  headers: Record<string, string> = { "stripe-signature": "t=1,v1=fake" },
): any {
  return { body: Buffer.from(JSON.stringify({})), headers };
}

/** Minimal Express res: record status/send/json calls. */
function fakeRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

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

/** Build a synthetic Stripe.Event for a given type + data.object. */
function event(type: string, id: string, object: StripeFixture): any {
  return { id, type, data: { object } };
}

/** Wire constructEvent to return the given event, then run the handler. */
async function dispatch(ev: any, m: MockContext) {
  vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(ev);
  const res = fakeRes();
  await stripeWebhook(fakeReq(), res, m.context);
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
});

// ── Guard rail: signature / config / routing ───────────────────────────────

describe("stripeWebhook — guard rail", () => {
  it("500s when STRIPE_WEBHOOK_SECRET is unset", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = fakeRes();
    await stripeWebhook(fakeReq(), res, mockContext().context);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("400s when the stripe-signature header is missing", async () => {
    const res = fakeRes();
    await stripeWebhook(fakeReq({}), res, mockContext().context);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("400s when signature verification throws", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = fakeRes();
    await stripeWebhook(fakeReq(), res, mockContext().context);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringMatching(/bad signature/),
    );
  });

  it("200s on unhandled event types without mutating anything", async () => {
    const m = mockContext();
    const res = await dispatch(event("product.created", "evt_u", {}), m);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(m.entities.User.update).not.toHaveBeenCalled();
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
  });

  it("500s when a handler throws (no 200 for a half-processed event)", async () => {
    const m = mockContext();
    m.entities.User.update.mockRejectedValue(new Error("db down"));
    const res = await dispatch(
      event("checkout.session.completed", "evt_c", {
        id: "cs_1",
        mode: "payment",
        metadata: { userId: "user-1", priceKey: "pro_prepaid" },
        amount_total: 9900,
        currency: "usd",
        customer: "cus_abc",
        payment_intent: "pi_xyz",
      }),
      m,
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── checkout.session.completed (one-time / prepaid) ─────────────────────────

describe("checkout.session.completed", () => {
  it("skips subscription-mode sessions (invoice.paid handles those)", async () => {
    const m = mockContext();
    await dispatch(
      event("checkout.session.completed", "evt_c", {
        id: "cs_1",
        mode: "subscription",
      }),
      m,
    );
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("skips when metadata is missing userId/priceKey", async () => {
    const m = mockContext();
    await dispatch(
      event("checkout.session.completed", "evt_c", {
        id: "cs_1",
        mode: "payment",
        metadata: {},
      }),
      m,
    );
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
  });

  it("skips a session already recorded (idempotency)", async () => {
    const m = mockContext();
    m.entities.Payment.findFirst.mockResolvedValue({ id: "pay_existing" });
    await dispatch(
      event("checkout.session.completed", "evt_c", {
        id: "cs_dup",
        mode: "payment",
        metadata: { userId: "user-1", priceKey: "pro_prepaid" },
        amount_total: 9900,
        currency: "usd",
      }),
      m,
    );
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
    expect(m.entities.Payment.findFirst).toHaveBeenCalledWith({
      where: { stripeCheckoutSessionId: "cs_dup" },
    });
  });

  it("skips an unknown priceKey", async () => {
    const m = mockContext();
    await dispatch(
      event("checkout.session.completed", "evt_c", {
        id: "cs_1",
        mode: "payment",
        metadata: { userId: "user-1", priceKey: "bogus" },
        amount_total: 100,
        currency: "usd",
      }),
      m,
    );
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
  });

  it("grants PRO prepaid, stamps the customer, and records the payment", async () => {
    const m = mockContext();
    await dispatch(
      event("checkout.session.completed", "evt_c", {
        id: "cs_1",
        mode: "payment",
        metadata: { userId: "user-1", priceKey: "pro_prepaid" },
        amount_total: 9900,
        currency: "usd",
        customer: "cus_abc",
        payment_intent: "pi_xyz",
      }),
      m,
    );

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
    await dispatch(
      event("checkout.session.completed", "evt_c", {
        id: "cs_1",
        mode: "payment",
        metadata: { userId: "user-1", priceKey: "founder" },
        amount_total: 9900,
        currency: "usd",
        customer: { id: "cus_obj" }, // object form — extractId must resolve it
        payment_intent: { id: "pi_obj" },
      }),
      m,
    );

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
});

// ── invoice.paid (subscriptions) ────────────────────────────────────────────

describe("invoice.paid", () => {
  it("reads plan + userId from the subscription metadata", async () => {
    const m = mockContext();
    // SAFETY: fixture provides only `metadata` — resolveInvoiceSubscriptionMeta
    // is the sole caller and reads nothing else off the subscription.
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      metadata: { priceKey: "pro_yearly", userId: "user-1" },
    } as Stripe.Subscription);

    await dispatch(
      event("invoice.paid", "evt_i", {
        id: "in_1",
        subscription: "sub_1",
        amount_paid: 4900,
        currency: "usd",
      }),
      m,
    );

    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
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
    // SAFETY: empty metadata fixture — the handler reads only metadata off the subscription.
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      metadata: {},
    } as Stripe.Subscription);

    await dispatch(
      event("invoice.paid", "evt_i", {
        id: "in_dup",
        subscription: "sub_1",
        amount_paid: 4900,
        currency: "usd",
      }),
      m,
    );

    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("falls back to customerId when the subscription has no userId", async () => {
    const m = mockContext();
    // SAFETY: empty metadata fixture — the handler reads only metadata off the subscription.
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      metadata: {},
    } as Stripe.Subscription);
    m.entities.User.findFirst.mockResolvedValue({ id: "user-2", plan: "FREE" });

    await dispatch(
      event("invoice.paid", "evt_i", {
        id: "in_2",
        subscription: "sub_2",
        amount_paid: 1900,
        currency: "usd",
        customer: "cus_abc",
      }),
      m,
    );

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
  });

  it("skips when no userId can be determined", async () => {
    const m = mockContext();
    // SAFETY: empty metadata fixture — the handler reads only metadata off the subscription.
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      metadata: {},
    } as Stripe.Subscription);
    await dispatch(
      event("invoice.paid", "evt_i", {
        id: "in_3",
        subscription: "sub_3",
        amount_paid: 1900,
        currency: "usd",
      }),
      m,
    );
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });
});

// ── invoice.payment_failed ──────────────────────────────────────────────────

describe("invoice.payment_failed", () => {
  it("records a FAILED payment for the known customer (no plan change)", async () => {
    const m = mockContext();
    m.entities.User.findFirst.mockResolvedValue({ id: "user-1", plan: "PRO" });

    await dispatch(
      event("invoice.payment_failed", "evt_f", {
        id: "in_fail",
        amount_due: 1900,
        currency: "usd",
        customer: "cus_abc",
        payment_intent: "pi_fail",
      }),
      m,
    );

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
    await dispatch(
      event("invoice.payment_failed", "evt_f", {
        id: "in_fail",
        amount_due: 1900,
        currency: "usd",
        customer: "cus_unknown",
      }),
      m,
    );
    expect(m.entities.Payment.create).not.toHaveBeenCalled();
  });
});

// ── customer.subscription.updated (terminal-status safety net) ───────────────

describe("customer.subscription.updated", () => {
  it("no-ops on a non-terminal status (e.g. active)", async () => {
    const m = mockContext();
    await dispatch(
      event("customer.subscription.updated", "evt_s", {
        status: "active",
        metadata: { userId: "user-1" },
      }),
      m,
    );
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("expires immediately on a terminal status (canceled)", async () => {
    const m = mockContext();
    await dispatch(
      event("customer.subscription.updated", "evt_s", {
        status: "canceled",
        metadata: { userId: "user-1" },
      }),
      m,
    );
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { planRenewsAt: expect.any(Date) },
    });
  });

  it("resolves userId via customerId when metadata is absent", async () => {
    const m = mockContext();
    m.entities.User.findFirst.mockResolvedValue({ id: "user-9", plan: "PRO" });
    await dispatch(
      event("customer.subscription.updated", "evt_s", {
        status: "unpaid",
        customer: "cus_abc",
      }),
      m,
    );
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-9" },
      data: { planRenewsAt: expect.any(Date) },
    });
  });
});

// ── customer.subscription.deleted ───────────────────────────────────────────

describe("customer.subscription.deleted", () => {
  it("expires the plan (planRenewsAt = now)", async () => {
    const m = mockContext();
    await dispatch(
      event("customer.subscription.deleted", "evt_d", {
        metadata: { userId: "user-1" },
      }),
      m,
    );
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { planRenewsAt: expect.any(Date) },
    });
  });

  it("skips when metadata has no userId", async () => {
    const m = mockContext();
    await dispatch(
      event("customer.subscription.deleted", "evt_d", { metadata: {} }),
      m,
    );
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });
});
