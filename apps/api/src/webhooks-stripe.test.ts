// @vitest-environment node
// Ported from webapp/src/billing/webhook.test.ts's guard-rail suite (S16) —
// now at the HTTP level against the Hono endpoint. Synthetic Stripe events
// are delivered through the REAL stripe.webhooks.constructEvent with genuine
// HMAC-SHA256 signatures (node:crypto — constructEvent verifies them, which
// is the money-path check this suite should exercise). No network: the Stripe
// client is constructed with a fake test key and never dialed; the per-event
// DB effects are pinned by the domain suite (billing/webhookCore.test.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import type { Entities } from "@actionamp/domain/db";
import { createStripeWebhookRoute } from "./webhooks-stripe.js";

// The ./billing/stripe singleton reads STRIPE_SECRET_KEY at module load and
// constructs a real client with it (offline-safe: no call is made until
// invoked). vi.hoisted runs before the imports evaluate.
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY ??= "sk_test_harness_only";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
});

const SECRET = "whsec_test";

/** Real Stripe signature: t=<unix>,v1=hex(hmac_sha256(secret, `${t}.${payload}`)). */
function signPayload(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

function mockEntities(): Entities {
  return {
    User: { findFirst: vi.fn(), update: vi.fn() },
    Payment: { findFirst: vi.fn(), create: vi.fn() },
  } as unknown as Entities;
}

/** Build a signed POST to the endpoint (Hono's offline test request). */
function post(app: ReturnType<typeof createStripeWebhookRoute>, options: {
  payload?: string;
  signature?: string;
  withHeader?: boolean;
}) {
  const body = options.payload ?? JSON.stringify({ id: "evt_x" });
  const headers: Record<string, string> = {};
  if (options.withHeader !== false) {
    headers["stripe-signature"] =
      options.signature ?? signPayload(body, SECRET);
  }
  return app.request("/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

/** Serialize + sign a synthetic event and run it through the endpoint. */
function dispatchEvent(app: ReturnType<typeof createStripeWebhookRoute>, event: any) {
  return post(app, { payload: JSON.stringify(event) });
}

function event(type: string, id: string, object: unknown): any {
  return { id, type, data: { object } };
}

describe("stripeWebhook — guard rail (transport-level)", () => {
  it("500s when STRIPE_WEBHOOK_SECRET is unset", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const app = createStripeWebhookRoute({ db: {} as never, entities: mockEntities() });
    const res = await post(app, {});
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Webhook secret not configured.");
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it("500s when the Stripe client is unconfigured (injected-null override)", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const app = createStripeWebhookRoute({
      db: {} as never,
      entities: mockEntities(),
      stripeClient: null,
    });
    const res = await post(app, {});
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Stripe client not configured.");
  });

  it("400s when the stripe-signature header is missing", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const app = createStripeWebhookRoute({ db: {} as never, entities: mockEntities() });
    const res = await post(app, { withHeader: false });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing stripe-signature header.");
  });

  it("400s when the signature does not verify (signed with the wrong secret)", async () => {
    const app = createStripeWebhookRoute({ db: {} as never, entities: mockEntities() });
    const payload = JSON.stringify(event("product.created", "evt_bad", {}));
    const res = await post(app, {
      payload,
      signature: signPayload(payload, "whsec_wrong"),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Webhook Error:.*signature/i);
  });

  it("200s on unhandled event types without mutating anything", async () => {
    const entities = mockEntities();
    const app = createStripeWebhookRoute({ db: {} as never, entities });
    const res = await dispatchEvent(app, event("product.created", "evt_u", {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect((entities.User as any).update).not.toHaveBeenCalled();
    expect((entities.Payment as any).create).not.toHaveBeenCalled();
  });

  it("500s when a handler throws (no 200 for a half-processed event)", async () => {
    const entities = mockEntities();
    (entities.User.update as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("db down"),
    );
    const app = createStripeWebhookRoute({ db: {} as never, entities });
    const res = await dispatchEvent(
      app,
      event("customer.subscription.deleted", "evt_throw", {
        metadata: { userId: "user-1" },
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Webhook handler error.");
  });
});

describe("stripeWebhook — signed end-to-end dispatch (one per event type)", () => {
  it("checkout.session.completed grants prepaid through the REAL verify path", async () => {
    const entities = mockEntities();
    (entities.Payment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const app = createStripeWebhookRoute({ db: {} as never, entities });
    const res = await dispatchEvent(
      app,
      event("checkout.session.completed", "evt_c", {
        id: "cs_1",
        mode: "payment",
        metadata: { userId: "user-1", priceKey: "pro_prepaid" },
        amount_total: 9000,
        currency: "usd",
        customer: "cus_abc",
        payment_intent: "pi_xyz",
      }),
    );
    expect(res.status).toBe(200);
    expect(entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ plan: "PRO", stripeCustomerId: "cus_abc" }),
    });
    expect(entities.Payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Pro Prepaid (12 mo)",
        stripeCheckoutSessionId: "cs_1",
      }),
    });
  });

  it("invoice.paid resolves the user by customerId when the subscription has none", async () => {
    const entities = mockEntities();
    (entities.Payment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (entities.User.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-2",
      plan: "FREE",
    });
    const app = createStripeWebhookRoute({ db: {} as never, entities });
    const res = await dispatchEvent(
      app,
      event("invoice.paid", "evt_i", {
        id: "in_1",
        amount_paid: 7950,
        currency: "usd",
        customer: "cus_abc",
        // No subscription id → no retrieve call → the customerId fallback.
      }),
    );
    expect(res.status).toBe(200);
    expect(entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { plan: "PRO", planRenewsAt: expect.any(Date) },
    });
  });

  it("invoice.payment_failed records FAILED without touching the plan", async () => {
    const entities = mockEntities();
    (entities.User.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      plan: "PRO",
    });
    const app = createStripeWebhookRoute({ db: {} as never, entities });
    const res = await dispatchEvent(
      app,
      event("invoice.payment_failed", "evt_f", {
        id: "in_fail",
        amount_due: 7950,
        currency: "usd",
        customer: "cus_abc",
      }),
    );
    expect(res.status).toBe(200);
    expect(entities.Payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "FAILED", description: "Payment failed" }),
    });
    expect((entities.User as any).update).not.toHaveBeenCalled();
  });

  it("customer.subscription.updated expires on a terminal status only", async () => {
    const entities = mockEntities();
    const app = createStripeWebhookRoute({ db: {} as never, entities });

    const noOp = await dispatchEvent(
      app,
      event("customer.subscription.updated", "evt_s1", {
        id: "sub_1",
        status: "active",
        metadata: { userId: "user-1" },
      }),
    );
    expect(noOp.status).toBe(200);
    expect((entities.User as any).update).not.toHaveBeenCalled();

    const expired = await dispatchEvent(
      app,
      event("customer.subscription.updated", "evt_s2", {
        id: "sub_1",
        status: "canceled",
        metadata: { userId: "user-1" },
      }),
    );
    expect(expired.status).toBe(200);
    expect(entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { planRenewsAt: expect.any(Date) },
    });
  });

  it("customer.subscription.deleted expires the plan", async () => {
    const entities = mockEntities();
    const app = createStripeWebhookRoute({ db: {} as never, entities });
    const res = await dispatchEvent(
      app,
      event("customer.subscription.deleted", "evt_d", {
        id: "sub_1",
        metadata: { userId: "user-1" },
      }),
    );
    expect(res.status).toBe(200);
    expect(entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { planRenewsAt: expect.any(Date) },
    });
  });
});
