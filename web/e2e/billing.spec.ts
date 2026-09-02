import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { loginAs } from "./helpers";

/**
 * Billing spec — S16 (billing + entitlements surface).
 *
 * Data: seeded by `api/src/seed-billing.ts` (run it before the suite —
 * the lenses-spec convention; the shared global-setup doesn't know this seed):
 *   cd api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-billing.ts
 *
 *   s16-pro@test.local     BILLED PRO (renews in a year) + 2 payments
 *   s16-founder@test.local BILLED FOUNDER (lifetime) + the $99 payment
 *   s16-free@test.local    FREE, no payments
 *   s16-manual@test.local  FREE plan + manualAccessGrant PRO (the grant
 *                          equivalence: entitled at the GATES, but the
 *                          billing VIEW stays keyed to the billed plan)
 *
 * Stripe is TEST-MODE ONLY and this environment has no Stripe egress, so:
 * - checkout/portal button wiring is pinned with Playwright route
 *   interception (the client contract: click → procedure → redirect);
 * - the webhook is exercised over REAL HTTP with genuinely SIGNED payloads
 *   when the running API has STRIPE_WEBHOOK_SECRET set (whsec_ test secret;
 *   constructEvent verification is local HMAC — no network), else the
 *   guard-rail 500 is asserted instead. The per-event DB effects are
 *   unit-pinned in packages/domain/src/billing/webhookCore.test.ts and
 *   api/src/webhooks-stripe.test.ts (24 webapp cases ported).
 */

const PRO_EMAIL = "s16-pro@test.local";
const FOUNDER_EMAIL = "s16-founder@test.local";
const FREE_EMAIL = "s16-free@test.local";
const MANUAL_EMAIL = "s16-manual@test.local";

const RPC = "/rpc";
const API_ORIGIN = process.env.E2E_API_URL ?? "http://localhost:8080";

/** POST one oRPC procedure without unwrapping — status + body assertions. */
async function rpc(page: Page, path: string, input: unknown = undefined) {
  return await page.request.post(`${RPC}${path}`, {
    headers: {
      "content-type": "application/json",
      "x-requested-with": "actionamp-e2e",
    },
    data: { json: input },
  });
}

async function getBillingStatus(page: Page) {
  const res = await rpc(page, "/billing/getBillingStatus");
  expect(res.status()).toBe(200);
  return (await res.json()) as {
    json: {
      plan: "FREE" | "PRO" | "FOUNDER";
      planRenewsAt: string | null;
      isPaid: boolean;
      isFounder: boolean;
      payments: Array<{
        id: string;
        description: string;
        amount: number;
        status: string;
      }>;
    };
  };
}

test.describe("Billing tab — plan display (the seeded fixtures)", () => {
  test("PRO: current plan card + renews date + payment history", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/do/settings/billing");

    await expect(page.getByRole("heading", { name: "Current plan" })).toBeVisible();
    await expect(page.getByText("Pro", { exact: true })).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();
    await expect(page.getByText(/Renews /)).toBeVisible();

    // Portal wiring present for paying users (webapp: "Update payment in Stripe").
    await expect(
      page.getByRole("button", { name: "Update payment in Stripe" }),
    ).toBeVisible();

    // History: the two seeded receipts, newest first, with status pills.
    const history = page.locator(".aa-billing-history");
    await expect(history.getByText("Pro Monthly")).toBeVisible();
    await expect(history.getByText("Pro Yearly")).toBeVisible();
    await expect(history.getByText("$79.50")).toBeVisible();
    await expect(history.getByText("$12.95")).toBeVisible();
    await expect(history.getByText("succeeded")).toHaveCount(2);
    // No upgrade grid on a paid plan.
    await expect(page.getByRole("heading", { name: "Upgrade to Pro" })).toHaveCount(0);
  });

  test("FOUNDER: Founding Member badge + lifetime access (no renewal date)", async ({
    page,
  }) => {
    await loginAs(page, FOUNDER_EMAIL);
    await page.goto("/do/settings/billing");

    await expect(page.getByText("Founding Member")).toBeVisible();
    await expect(page.getByText("Lifetime access")).toBeVisible();
    await expect(page.getByText(/Renews /)).toHaveCount(0);

    const history = page.locator(".aa-billing-history");
    await expect(history.getByText("Founding 100 (lifetime)")).toBeVisible();
    await expect(history.getByText("$99.00")).toBeVisible();
  });

  test("FREE: upgrade screen with the three Pro plans and empty history", async ({
    page,
  }) => {
    await loginAs(page, FREE_EMAIL);
    await page.goto("/do/settings/billing");

    await expect(page.getByText("Free plan")).toBeVisible();
    await expect(page.getByText("No payment method")).toBeVisible();
    await expect(
      page.getByText("Personal scope · 3 projects · 1 goal"),
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: "Upgrade to Pro" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Choose monthly Pro/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Choose yearly Pro/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Choose prepaid Pro/i }),
    ).toBeVisible();
    await expect(page.getByText("Best value")).toBeVisible();
    await expect(page.getByText("$12.95")).toBeVisible();
    await expect(page.getByText("$79.50")).toBeVisible();
    await expect(page.getByText("$90")).toBeVisible();

    await expect(page.getByText("No payments yet.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update payment in Stripe" }),
    ).toHaveCount(0);
  });

  test("MANUAL PRO grant: entitled at the gates, but the billing view keys off the billed plan", async ({
    page,
  }) => {
    await loginAs(page, MANUAL_EMAIL);
    await page.goto("/do/settings/billing");

    // plan=FREE + manualAccessGrant=PRO → the status view (isPaidPlan(plan))
    // says FREE — manual grants add ACCESS without inventing billing facts.
    const status = await getBillingStatus(page);
    expect(status.json.plan).toBe("FREE");
    expect(status.json.isPaid).toBe(false);
    expect(status.json.payments).toHaveLength(0);
    // And the page renders the upgrade screen (the manual grant's Pro access
    // lives in the gates + account flags, not the Billing tab).
    await expect(page.getByRole("heading", { name: "Upgrade to Pro" })).toBeVisible();
  });
});

test.describe("Billing tab — checkout/portal button wiring", () => {
  test("FREE: 'Choose yearly' opens the checkout session and redirects", async ({
    page,
  }) => {
    await loginAs(page, FREE_EMAIL);

    // The client wiring: click → POST /rpc/billing/createCheckoutSession →
    // redirect to the returned Stripe URL. Interception stands in for both
    // sides of Stripe (the session creation AND the hosted page — this
    // sandbox has no Stripe egress; the live test-mode dry run is the V2
    // rehearsal's job).
    await page.route("**/rpc/billing/createCheckoutSession", async (route) => {
      const body = route.request().postDataJSON() as { json?: { priceKey?: string } };
      expect(body.json?.priceKey).toBe("proYearly");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { url: "https://checkout.stripe.com/c/pay/test_wiring" },
        }),
      });
    });
    await page.route("https://checkout.stripe.com/c/pay/test_wiring", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "test checkout" }),
    );

    await page.goto("/do/settings/billing");
    await page.getByRole("button", { name: /Choose yearly Pro/i }).click();
    await page.waitForURL("https://checkout.stripe.com/c/pay/test_wiring");
    await expect(page.getByText("test checkout")).toBeVisible();
  });

  test("PRO: 'Update payment in Stripe' opens the portal and redirects", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);

    await page.route("**/rpc/billing/createCustomerPortalSession", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { url: "https://billing.stripe.com/p/session/test_wiring" },
        }),
      });
    });
    await page.route("https://billing.stripe.com/p/session/test_wiring", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "test portal" }),
    );

    await page.goto("/do/settings/billing");
    await page.getByRole("button", { name: "Update payment in Stripe" }).click();
    await page.waitForURL("https://billing.stripe.com/p/session/test_wiring");
    await expect(page.getByText("test portal")).toBeVisible();
  });
});

test.describe("ProGate — the S9 deferred trigger + upgrade links (S16 completes)", () => {
  test("FREE: the gate panel carries 'See plans' + the Founding-100 link, and See plans lands on Billing", async ({
    page,
  }) => {
    await loginAs(page, FREE_EMAIL);
    await page.goto("/");

    // Wait for the shell to be interactive (the "/" handler mounts with the
    // layout — a keypress during hydration is lost). "What now" is the home
    // screen's section label.
    await expect(page.getByText("What now", { exact: true })).toBeVisible();

    // The command palette (`/` opens Search per the layout's global keys) is
    // the shared ProGate's most reachable mount: FREE users get the gate
    // panel instead of results.
    await page.keyboard.press("/");
    const gate = page.locator(".aa-command-palette__gate");
    await expect(gate).toContainText("Command palette and search is a Pro feature.");

    const seePlans = gate.getByRole("link", { name: "See plans" });
    await expect(seePlans).toBeVisible();
    await expect(seePlans).toHaveAttribute("href", "/do/settings/billing");
    const founding = gate.getByRole("link", { name: "Founding 100 · $99 lifetime" });
    await expect(founding).toBeVisible();
    await expect(founding).toHaveAttribute("href", "/founding-100");

    // The upgrade path completes: See plans → the Billing tab's plans.
    await seePlans.click();
    await expect(page).toHaveURL(/\/do\/settings\/billing$/);
    await expect(page.getByRole("heading", { name: "Upgrade to Pro" })).toBeVisible();
  });
});

test.describe("Founding-100 checkout — the S13 call-site wiring (S16)", () => {
  test("authed non-founder CTA calls createCheckoutSession with priceKey=founder and redirects", async ({
    page,
  }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/founding-100");

    // The offer page renders the live count (S15 query) + the CTA.
    await expect(
      page.getByRole("button", { name: "Secure Your Lifetime Spot for $99" }),
    ).toBeVisible();

    await page.route("**/rpc/billing/createCheckoutSession", async (route) => {
      const body = route.request().postDataJSON() as { json?: { priceKey?: string } };
      expect(body.json?.priceKey).toBe("founder");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { url: "https://checkout.stripe.com/c/pay/test_founder" },
        }),
      });
    });
    await page.route("https://checkout.stripe.com/c/pay/test_founder", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "test founder checkout" }),
    );

    await page
      .getByRole("button", { name: "Secure Your Lifetime Spot for $99" })
      .click();
    await page.waitForURL("https://checkout.stripe.com/c/pay/test_founder");
  });
});

test.describe("Stripe webhook — HTTP level with signed test payloads", () => {
  const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const WEBHOOK_EMAIL = "s16-webhook@test.local";

  /** Real Stripe signature: t=<unix>,v1=hex(hmac_sha256(secret, `${t}.${payload}`)). */
  function signPayload(payload: string, secret: string): string {
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret)
      .update(`${t}.${payload}`)
      .digest("hex");
    return `t=${t},v1=${v1}`;
  }

  test("signed founder checkout grants FOUNDER; the replay is a no-op (idempotency)", async ({
    page,
  }) => {
    // Create (or find) the throwaway fixture user; read its User id from the
    // dev PAT fixture route, then clean the token row up (only the hash is
    // stored server-side, so this is the only place the plaintext exists).
    const patRes = await page.request.post(
      `${API_ORIGIN}/api/dev/pat?email=${WEBHOOK_EMAIL}`,
    );
    expect(patRes.status()).toBe(200);
    const pat = (await patRes.json()) as { token: string; user: { userId: string } };
    const userId = pat.user.userId;
    await page.request.delete(
      `${API_ORIGIN}/api/dev/pat?token=${encodeURIComponent(pat.token)}`,
    );
    // The browser session the status read uses.
    await loginAs(page, WEBHOOK_EMAIL);

    // Unique Stripe ids per run: the suite must be green on re-runs, and the
    // Payment unique indexes (session + payment-intent ids) are what make a
    // second GRANT (vs a replay skip) possible across runs.
    const runId = Date.now().toString(36);
    const event = {
      id: `evt_test_s16_${runId}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_s16_${runId}`,
          mode: "payment",
          metadata: { userId, priceKey: "founder" },
          amount_total: 9900,
          currency: "usd",
          customer: "cus_test_s16_webhook",
          payment_intent: `pi_test_s16_${runId}`,
        },
      },
    };
    const payload = JSON.stringify(event);

    if (!SECRET) {
      // No whsec on the API process: the guard rail is the contract.
      const res = await page.request.post(`${API_ORIGIN}/webhooks/stripe`, {
        data: payload,
        headers: { "content-type": "application/json" },
      });
      expect(res.status()).toBe(500);
      expect(await res.text()).toBe("Webhook secret not configured.");
      return;
    }

    const post = () =>
      page.request.post(`${API_ORIGIN}/webhooks/stripe`, {
        data: payload,
        headers: {
          "content-type": "application/json",
          "stripe-signature": signPayload(payload, SECRET),
        },
      });

    // First delivery: 200 {received:true}; the founder grant lands (the user
    // may carry earlier runs' payments — counts below are relative).
    const first = await post();
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ received: true });

    const read = await getBillingStatus(page);
    expect(read.json.plan).toBe("FOUNDER");
    expect(read.json.isFounder).toBe(true);
    expect(read.json.planRenewsAt).toBeNull(); // lifetime
    expect(read.json.payments.length).toBeGreaterThanOrEqual(1);
    const countAfterFirst = read.json.payments.length;

    // Replay the SAME event: still 200, and the payment count is unchanged —
    // the stripeCheckoutSessionId lookup is the idempotency guard.
    const replay = await post();
    expect(replay.status()).toBe(200);
    const after = await getBillingStatus(page);
    expect(after.json.plan).toBe("FOUNDER");
    expect(after.json.payments).toHaveLength(countAfterFirst);
  });

  test("a tampered signature is rejected (400)", async ({ page }) => {
    const res = await page.request.post(`${API_ORIGIN}/webhooks/stripe`, {
      data: JSON.stringify({ id: "evt_evil", type: "checkout.session.completed" }),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=deadbeef",
      },
    });
    expect(res.status()).toBe(400);
  });
});
