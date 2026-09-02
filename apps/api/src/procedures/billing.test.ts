import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BillingStripeOps } from "./billingCore.js";
import {
  billingStripeOps,
  createCheckoutSessionCore,
  createCustomerPortalSessionCore,
  getBillingStatusWire,
  type BillingOpsDeps,
} from "./billingCore.js";
import type { Entities } from "@actionamp/domain/db";

// billing/stripe.ts reads the price-id envs at module load (the webapp
// stripe.ts parity — fail fast at checkout time). Harness values.
vi.hoisted(() => {
  process.env.STRIPE_PRICE_PRO_YEARLY ??= "price_proYearly";
  process.env.STRIPE_PRICE_PRO_MONTHLY ??= "price_proMonthly";
  process.env.STRIPE_PRICE_PRO_PREPAID ??= "price_proPrepaid";
  process.env.STRIPE_PRICE_FOUNDER ??= "price_founder";
});

/**
 * S16 API-layer unit pins (the webapp operations.ts behaviors the oRPC layer
 * wraps — s16-billing/README.md §1–§2). The Stripe SDK seam is swapped with
 * fakes: this environment has no network egress, and Stripe interactions are
 * TEST-MODE ONLY (the live dry run is V2 rehearsal with Jake).
 *
 * Entity mocks REPLACE the seam delegates entirely (the F4c rule) — no
 * client-side defaults to account for; assertions see the cores' exact
 * payloads.
 */

function mockEntities(): Entities {
  return {
    User: {
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    Payment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  } as unknown as Entities;
}

const stripeOps: BillingStripeOps = {
  createCustomer: vi.fn().mockResolvedValue({ id: "cus_new" }),
  createCheckoutSession: vi
    .fn()
    .mockResolvedValue({ url: "https://checkout.stripe.test/c/pay/cs_1" }),
  createPortalSession: vi
    .fn()
    .mockResolvedValue({ url: "https://billing.stripe.test/p/session_1" }),
};

const recordCheckoutStarted = vi.fn().mockResolvedValue({ recorded: true });

function deps(entities: Entities): BillingOpsDeps {
  return {
    db: {} as BillingOpsDeps["db"],
    entities,
    stripeOps,
    webClientUrl: "https://app.actionamp.test",
    recordCheckoutStarted,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCheckoutSessionCore", () => {
  it("counts billed+manual founders and 409s at the public cap before any Stripe call", async () => {
    const entities = mockEntities();
    (entities.User.count as ReturnType<typeof vi.fn>).mockResolvedValue(98); // PUBLIC cap = 100 − 2
    await expect(
      createCheckoutSessionCore(deps(entities), { priceKey: "founder" }, { id: "user-1" }),
    ).rejects.toThrow("All public Founding memberships have been claimed.");
    // The count used the FOUNDER_MEMBERSHIP_WHERE (billed OR manual, never FRIEND).
    expect(entities.User.count).toHaveBeenCalledWith({
      where: { OR: [{ plan: "FOUNDER" }, { manualAccessGrant: "FOUNDER" }] },
    });
    expect(entities.User.findUnique).not.toHaveBeenCalled();
    expect(stripeOps.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("the 409 is the domain HttpError the fragment maps to CONFLICT", async () => {
    const entities = mockEntities();
    (entities.User.count as ReturnType<typeof vi.fn>).mockResolvedValue(98);
    let caught: unknown;
    try {
      await createCheckoutSessionCore(deps(entities), { priceKey: "founder" }, { id: "u" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { statusCode?: number }).statusCode).toBe(409);
  });

  it("passes below the cap: 97 claimed still opens checkout", async () => {
    const entities = mockEntities();
    (entities.User.count as ReturnType<typeof vi.fn>).mockResolvedValue(97);
    (entities.User.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      stripeCustomerId: "cus_existing",
    });
    const result = await createCheckoutSessionCore(
      deps(entities),
      { priceKey: "founder" },
      { id: "user-1" },
    );
    expect(result.url).toContain("checkout.stripe.test");
    expect(stripeOps.createCustomer).not.toHaveBeenCalled();
  });

  it("reuses the stored Stripe customer and fires CHECKOUT_STARTED (billing route)", async () => {
    const entities = mockEntities();
    (entities.User.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      stripeCustomerId: "cus_existing",
    });
    await createCheckoutSessionCore(
      deps(entities),
      { priceKey: "proYearly" },
      { id: "user-1" },
    );
    expect(stripeOps.createCustomer).not.toHaveBeenCalled();
    expect(stripeOps.createCheckoutSession).toHaveBeenCalledTimes(1);
    const params = (stripeOps.createCheckoutSession as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Record<string, unknown>;
    // Subscription mode for yearly, exact success URL + session metadata.
    expect(params.mode).toBe("subscription");
    expect(params.success_url).toBe(
      "https://app.actionamp.test/do/settings/billing?checkout=success",
    );
    expect(params.metadata).toEqual({ userId: "user-1", priceKey: "proYearly" });
    expect(recordCheckoutStarted).toHaveBeenCalledWith(
      {
        name: "CHECKOUT_STARTED",
        visitorId: "user_user-1",
        route: "/do/settings/billing",
        metadata: { plan: "proYearly" },
      },
      "user-1",
    );
  });

  it("creates a customer when none is stored, persists it, and routes founder analytics to /founding-100", async () => {
    const entities = mockEntities();
    (entities.User.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-2",
      stripeCustomerId: null,
    });
    await createCheckoutSessionCore(
      deps(entities),
      { priceKey: "founder" },
      { id: "user-2" },
    );
    expect(stripeOps.createCustomer).toHaveBeenCalledWith({
      metadata: { userId: "user-2" },
    });
    expect(entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { stripeCustomerId: "cus_new" },
    });
    expect(recordCheckoutStarted).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/founding-100" }),
      "user-2",
    );
    // Founder checkout charges inline price_data, not a dashboard Price.
    const params = (stripeOps.createCheckoutSession as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { line_items: Array<Record<string, unknown>>; success_url: string };
    expect(params.line_items[0].price_data).toMatchObject({ unit_amount: 9900 });
    expect(params.success_url).toBe("https://app.actionamp.test/founding-100/welcome");
  });

  it("throws when Stripe returns a session without a URL", async () => {
    const entities = mockEntities();
    (entities.User.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      stripeCustomerId: "cus_1",
    });
    (stripeOps.createCheckoutSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: null,
    });
    await expect(
      createCheckoutSessionCore(deps(entities), { priceKey: "proMonthly" }, { id: "user-1" }),
    ).rejects.toThrow("Stripe Checkout Session has no URL.");
  });
});

describe("createCustomerPortalSessionCore", () => {
  it("opens the portal for a stored customer, returning to the Billing tab", async () => {
    const entities = mockEntities();
    (entities.User.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      stripeCustomerId: "cus_1",
    });
    const result = await createCustomerPortalSessionCore(deps(entities), { id: "user-1" });
    expect(stripeOps.createPortalSession).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.actionamp.test/do/settings/billing",
    });
    expect(result.url).toContain("billing.stripe.test");
  });

  it("errors with the exact webapp string when there is no billing account", async () => {
    const entities = mockEntities();
    (entities.User.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-1",
      stripeCustomerId: null,
    });
    await expect(
      createCustomerPortalSessionCore(deps(entities), { id: "user-1" }),
    ).rejects.toThrow("No billing account found for this user.");
    expect(stripeOps.createPortalSession).not.toHaveBeenCalled();
  });
});

describe("getBillingStatusWire", () => {
  it("returns the plan view with payments serialized to ISO strings, newest first", async () => {
    const entities = mockEntities();
    (entities.Payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "pay_2",
        description: "Pro Yearly",
        amount: 7950,
        currency: "usd",
        status: "SUCCEEDED",
        plan: "PRO",
        paidAt: new Date("2026-09-01T00:00:00Z"),
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
      {
        id: "pay_1",
        description: "Payment failed",
        amount: 7950,
        currency: "usd",
        status: "FAILED",
        plan: "PRO",
        paidAt: null,
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    ]);
    const status = await getBillingStatusWire(entities, {
      id: "user-1",
      plan: "PRO",
      planRenewsAt: new Date("2027-01-01T00:00:00Z"),
    });
    // Last 50, createdAt desc — the webapp query shape.
    expect(entities.Payment.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    expect(status).toEqual({
      plan: "PRO",
      planRenewsAt: "2027-01-01T00:00:00.000Z",
      isPaid: true,
      isFounder: false,
      payments: [
        expect.objectContaining({ id: "pay_2", status: "SUCCEEDED", paidAt: "2026-09-01T00:00:00.000Z" }),
        expect.objectContaining({ id: "pay_1", status: "FAILED", paidAt: null }),
      ],
    });
  });

  it("FOUNDER: isPaid + isFounder with a null renewal (lifetime)", async () => {
    const entities = mockEntities();
    (entities.Payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const status = await getBillingStatusWire(entities, {
      id: "user-1",
      plan: "FOUNDER",
      planRenewsAt: null,
    });
    expect(status.isPaid).toBe(true);
    expect(status.isFounder).toBe(true);
    expect(status.planRenewsAt).toBeNull();
  });
});

describe("billingStripeOps (the real seam) — config guard", () => {
  it("a missing STRIPE_SECRET_KEY surfaces as the readable error at call time", () => {
    // stripe.ts was imported WITHOUT the env set (module-level singleton is
    // null), so the real ops fail with the readable requireStripe() message —
    // never a null member access. (The ops arrow is not async: requireStripe
    // throws synchronously before any promise exists.)
    expect(() =>
      billingStripeOps.createCustomer({ metadata: { userId: "u" } }),
    ).toThrow(/STRIPE_SECRET_KEY is not set/);
  });
});
