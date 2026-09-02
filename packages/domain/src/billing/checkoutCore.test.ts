// S16 — the checkout/portal core pins (ported from webapp/src/billing/
// operations.ts + operations.test.ts; the parity checklist is
// s16-billing/README.md §1–§2).
import { describe, expect, it, vi } from "vitest";
import {
  FOUNDER_MEMBERSHIP_WHERE,
  FOUNDING_100_PRICE_CENTS,
} from "./config.js";
import {
  NO_BILLING_ACCOUNT_MESSAGE,
  assertFounderCapAvailable,
  buildCheckoutSessionParams,
  buildPortalSessionParams,
  checkoutCancelUrl,
  checkoutSuccessUrl,
  ensureStripeCustomerId,
  founding100Status,
  getBillingStatusCore,
  resolveOrigin,
} from "./checkoutCore.js";
import { HttpError } from "../projects/httpError.js";

const ORIGIN = "https://app.actionamp.test";
const resolvePriceId = (key: string) => `price_${key}`;

describe("buildCheckoutSessionParams — the exact Stripe session shapes", () => {
  it("yearly/monthly: subscription mode, dashboard price, subscription metadata", () => {
    for (const priceKey of ["proYearly", "proMonthly"] as const) {
      const params = buildCheckoutSessionParams({
        priceKey,
        customerId: "cus_1",
        userId: "user-1",
        origin: ORIGIN,
        resolvePriceId,
      });
      expect(params.mode).toBe("subscription");
      expect(params.line_items).toEqual([
        { price: resolvePriceId(priceKey), quantity: 1 },
      ]);
      expect(params.subscription_data).toEqual({
        metadata: { userId: "user-1", priceKey },
      });
      expect(params.invoice_creation).toBeUndefined();
    }
  });

  it("prepaid: one-time payment mode with invoice_creation (receipts)", () => {
    const params = buildCheckoutSessionParams({
      priceKey: "proPrepaid",
      customerId: "cus_1",
      userId: "user-1",
      origin: ORIGIN,
      resolvePriceId,
    });
    expect(params.mode).toBe("payment");
    expect(params.invoice_creation).toEqual({ enabled: true });
    expect(params.subscription_data).toBeUndefined();
  });

  it("founder: inline price_data at $99 — no dashboard Price object", () => {
    const params = buildCheckoutSessionParams({
      priceKey: "founder",
      customerId: "cus_1",
      userId: "user-1",
      origin: ORIGIN,
      resolvePriceId,
    });
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        price_data: {
          currency: "usd",
          unit_amount: FOUNDING_100_PRICE_CENTS,
          product_data: { name: "Founding 100 — Lifetime Pro" },
        },
        quantity: 1,
      },
    ]);
    expect(FOUNDING_100_PRICE_CENTS).toBe(9900);
  });

  it("session metadata carries userId + priceKey; promo codes allowed", () => {
    const params = buildCheckoutSessionParams({
      priceKey: "proYearly",
      customerId: "cus_1",
      userId: "user-1",
      origin: ORIGIN,
      resolvePriceId,
    });
    expect(params.metadata).toEqual({ userId: "user-1", priceKey: "proYearly" });
    expect(params.allow_promotion_codes).toBe(true);
  });

  it("URL flows: founder round-trips the founding-100 pages; everyone else the Billing tab", () => {
    expect(checkoutSuccessUrl("founder", ORIGIN)).toBe(
      `${ORIGIN}/founding-100/welcome`,
    );
    expect(checkoutCancelUrl("founder", ORIGIN)).toBe(`${ORIGIN}/founding-100`);
    expect(checkoutSuccessUrl("proYearly", ORIGIN)).toBe(
      `${ORIGIN}/do/settings/billing?checkout=success`,
    );
    expect(checkoutCancelUrl("proPrepaid", ORIGIN)).toBe(
      `${ORIGIN}/do/settings/billing?checkout=cancelled`,
    );
  });

  it("resolveOrigin falls back to localhost:4000 (webapp WASP_WEB_CLIENT_URL default)", () => {
    expect(resolveOrigin(undefined)).toBe("http://localhost:4000");
    expect(resolveOrigin("https://app.actionamp.com")).toBe(
      "https://app.actionamp.com",
    );
  });
});

describe("Founding-100 cap + count (webapp operations.test.ts port)", () => {
  it("membership count includes billed and manual Founders, never Friends", () => {
    expect(FOUNDER_MEMBERSHIP_WHERE).toEqual({
      OR: [{ plan: "FOUNDER" }, { manualAccessGrant: "FOUNDER" }],
    });
  });

  it("the cap math matches the public payload (98 public spots)", () => {
    expect(founding100Status(97)).toEqual({
      cap: 100,
      reserved: 2,
      claimed: 97,
      remaining: 1,
      isFull: false,
    });
    expect(founding100Status(98)).toMatchObject({ remaining: 0, isFull: true });
    expect(founding100Status(99)).toMatchObject({ remaining: 0, isFull: true });
  });

  it("409s at the public cap with the exact webapp message; passes below it", () => {
    expect(() => assertFounderCapAvailable(97)).not.toThrow();
    try {
      assertFounderCapAvailable(98);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      const httpError = err as HttpError;
      expect(httpError.statusCode).toBe(409);
      expect(httpError.message).toBe(
        "All public Founding memberships have been claimed.",
      );
    }
  });
});

describe("portal + billing status", () => {
  it("portal params return to the Billing tab", () => {
    expect(buildPortalSessionParams({ customerId: "cus_1", origin: ORIGIN })).toEqual({
      customer: "cus_1",
      return_url: `${ORIGIN}/do/settings/billing`,
    });
  });

  it("the portal no-account error keeps the webapp string", () => {
    expect(NO_BILLING_ACCOUNT_MESSAGE).toBe(
      "No billing account found for this user.",
    );
  });

  it("getBillingStatusCore returns the last 50 payments, newest first, with the paid flags", async () => {
    const rows = [{ id: "pay_1" }, { id: "pay_2" }];
    const entities = {
      Payment: {
        findMany: vi.fn().mockResolvedValue(rows),
      },
    };
    const view = await getBillingStatusCore(entities as never, {
      id: "user-1",
      plan: "FOUNDER",
      planRenewsAt: null,
    });
    expect(entities.Payment.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    expect(view).toEqual({
      plan: "FOUNDER",
      planRenewsAt: null,
      isPaid: true,
      isFounder: true,
      payments: rows,
    });
  });

  it("getBillingStatusCore: FREE is unpaid; PRO is paid but not founder", async () => {
    const entities = { Payment: { findMany: vi.fn().mockResolvedValue([]) } };
    const free = await getBillingStatusCore(entities as never, {
      id: "user-1",
      plan: "FREE",
      planRenewsAt: null,
    });
    expect(free.isPaid).toBe(false);
    expect(free.isFounder).toBe(false);

    const pro = await getBillingStatusCore(entities as never, {
      id: "user-2",
      plan: "PRO",
      planRenewsAt: new Date("2030-01-01"),
    });
    expect(pro.isPaid).toBe(true);
    expect(pro.isFounder).toBe(false);
  });
});

describe("ensureStripeCustomerId — reuse or create + persist", () => {
  it("reuses the stored customer id without calling Stripe", async () => {
    const createCustomer = vi.fn();
    const update = vi.fn();
    const id = await ensureStripeCustomerId(
      { User: { findUnique: vi.fn(), update, count: vi.fn() } } as never,
      { id: "user-1", stripeCustomerId: "cus_existing" },
      createCustomer,
    );
    expect(id).toBe("cus_existing");
    expect(createCustomer).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("creates with the userId metadata and persists the id", async () => {
    const createCustomer = vi
      .fn()
      .mockResolvedValue({ id: "cus_new" });
    const update = vi.fn().mockResolvedValue({});
    const id = await ensureStripeCustomerId(
      { User: { findUnique: vi.fn(), update, count: vi.fn() } } as never,
      { id: "user-1", stripeCustomerId: null },
      createCustomer,
    );
    expect(createCustomer).toHaveBeenCalledWith({ metadata: { userId: "user-1" } });
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { stripeCustomerId: "cus_new" },
    });
    expect(id).toBe("cus_new");
  });
});
