import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_EMAIL, apiPost, activeLensId, loginAs } from "./helpers";

const API_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "api");

/**
 * The auth spec — S10 (passwordless login + session issuance).
 *
 * Ports the DURABLE assertions of webapp/e2e/login.spec.ts (the original
 * spec is stale — it drives Wasp's removed password form; per the S10 P0
 * notes the credential path is the passwordless/devEmail one, not a password
 * form) and re-creds them onto the new stack's localhost fixed-code flow.
 * The expiry-specific core behavior (10-min TTL filter) is pinned at the
 * unit level (api/src/auth/magic.test.ts) — e2e cannot wait out the
 * TTL — so this spec covers: the identity guard, the fixed-code happy path
 * through a real stamped cookie to a working /rpc call, wrong-code stays,
 * the 5-attempt lockout, the magic-link error path, the byte-identical
 * rate-limit response, signup framing, devEmail autologin, and the CLI
 * token mint's PRO/FREE entitlement gate.
 */

/** webapp helpers.ts uniqueEmail() parity. */
function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 10_000)}@test.actionamp.dev`;
}

/** POST one /api/auth/* route from the browser context (cookies + CSRF header). */
async function authPost(
  page: import("@playwright/test").Page,
  path: string,
  data: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await page.request.post(path, {
    headers: {
      "content-type": "application/json",
      "x-requested-with": "actionamp-e2e",
    },
    data,
  });
  return { status: res.status(), body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

test.describe("auth — passwordless login (S10)", () => {
  test("the login page renders the welcome-back identity guard", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
  });

  test("localhost fixed-code flow: request → 111111 → /do with a stamped cookie", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await page.goto("/login");
    await page.getByRole("heading", { name: /welcome back/i }).waitFor();

    await page.locator("#magic-email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();

    // Step 2: the code form (localhost's fixed code, no email involved).
    await expect(page.getByRole("heading", { name: "Enter your code." })).toBeVisible();
    const codeInput = page.locator("#magic-code");
    await expect(codeInput).toBeVisible();
    await codeInput.fill("111111");
    await page.getByRole("button", { name: "Continue" }).click();

    // The verify hard-navigates to returnTo (/do). A brand-new account has
    // hasSeenOnboarding=false, so the shell's onboarding gate (the webapp App
    // gate's behavioral twin) intercepts to /welcome — same as webapp today.
    await page.waitForURL(/\/(do|welcome)/, { timeout: 15_000 });

    // The Wasp-compat cookie: stamped httpOnly, Path=/, SameSite=Lax.
    const cookie = (await page.context().cookies()).find((c) => c.name === "wasp_session");
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.value).toMatch(/^[a-z2-7]{40}$/); // Wasp/Lucia token shape

    // The cookie is the whole session transport: the new cookie answers RPC.
    const tasks = await apiPost<unknown[]>(page, "/rpc/tasks/list");
    expect(Array.isArray(tasks)).toBe(true);
  });

  test("a wrong code stays auth-side with the not-valid error", async ({ page }) => {
    const email = uniqueEmail();
    await page.goto("/login");
    await page.locator("#magic-email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await page.locator("#magic-code").fill("000000");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.locator(".aa-auth-error")).toContainText(/not valid/i, {
      timeout: 10_000,
    });
    expect(page.url()).not.toMatch(/\/do/);
  });

  test("five wrong codes exhaust the challenge — even 111111 stops working", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await page.goto("/login");
    await page.locator("#magic-email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    const codeInput = page.locator("#magic-code");
    const continueButton = page.getByRole("button", { name: "Continue" });

    for (let i = 0; i < 5; i++) {
      await codeInput.fill("000000");
      await continueButton.click();
      await expect(page.locator(".aa-auth-error")).toContainText(/not valid/i, {
        timeout: 10_000,
      });
    }

    // attempts >= 5: the lookup no longer matches, so the CORRECT local code
    // is rejected too. A new request (after the 60-s window) supersedes.
    await codeInput.fill("111111");
    await continueButton.click();
    await expect(page.locator(".aa-auth-error")).toContainText(/not valid/i, {
      timeout: 10_000,
    });
    expect(page.url()).not.toMatch(/\/do/);
  });

  test("a bogus magic link shows the link error and the param is stripped", async ({
    page,
  }) => {
    await page.goto("/login?magic=bogus-token-not-in-db&returnTo=%2Fdo");
    await expect(page.locator(".aa-auth-error")).toContainText(
      /no longer valid/i,
      { timeout: 10_000 },
    );
    expect(page.url()).not.toContain("magic=");
  });

  test("the rate-limited re-request answers the identical {sent:true}", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const first = await authPost(page, "/api/auth/request-magic-login", {
      email,
      returnTo: "/do",
    });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ sent: true });

    // Within the 60-s window: byte-identical response, no error either way.
    const second = await authPost(page, "/api/auth/request-magic-login", {
      email,
      returnTo: "/do",
    });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    // Unknown account or not — the response never changes shape.
    const invalid = await authPost(page, "/api/auth/request-magic-login", {
      email: "not-an-email",
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: "Enter a valid email." });
  });

  test("signup renders the creation framing and links back to login", async ({
    page,
  }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Start free." })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with email" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Already have an account\?/),
    ).toBeVisible();
    await expect(page.locator(".aa-auth-footer").getByText("Log in")).toBeVisible();
  });

  test("devEmail= autologin reaches /do (the known-credentials path)", async ({
    page,
  }) => {
    const email = uniqueEmail();
    await page.goto(`/login?devEmail=${encodeURIComponent(email)}`);
    await page.waitForURL(/\/do/, { timeout: 15_000 });
    // The autologin route stamps the same session cookie; the app side sees
    // a normal signed-in browser.
    const cookie = (await page.context().cookies()).find((c) => c.name === "wasp_session");
    expect(cookie).toBeDefined();
  });

  test("the session read answers the signed-in user", async ({ page }) => {
    const email = uniqueEmail();
    await loginAs(page, email);
    const res = await page.request.get("/api/auth/me");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as {
      user: { email: string; plan: string; entitled: boolean } | null;
    };
    expect(body.user?.email).toBe(email);
    // A fresh dev-login user is FREE with no grant.
    expect(body.user?.plan).toBe("FREE");
    expect(body.user?.entitled).toBe(false);
  });
});

test.describe("auth — logout (the real UI)", () => {
  test("footer confirm → /login; the app stays logged out and the session stops answering", async ({
    page,
  }) => {
    // Login through the app as the seeded fixture user.
    await page.goto(`/login?devEmail=${encodeURIComponent(DEV_EMAIL)}`);
    await page.waitForURL(/\/do/, { timeout: 15_000 });

    // Control content: capture + triage a TODAY task so "no data visible"
    // below is a real assertion, not an empty account.
    const title = `Logout probe ${Date.now()}`;
    const capture = await apiPost<{ id: string }>(page, "/rpc/inbox/create", {
      text: title,
    });
    await apiPost(page, "/rpc/inbox/triage", {
      inboxItemId: capture.id,
      decision: "task-today",
      lensId: await activeLensId(page),
    });
    await page.goto("/do/today");
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

    // The REAL UI path: the shell footer's Log out → the confirm dialog.
    await page.locator(".aa-app-logout").click();
    const dialog = page.getByRole("dialog", { name: "Log out?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Log out" }).click();

    // The webapp lands logged-out users on the login screen.
    await page.waitForURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

    // The cookie is gone from the jar (the API's Max-Age=0 clearing stamp).
    const cookie = (await page.context().cookies()).find(
      (c) => c.name === "wasp_session",
    );
    expect(cookie).toBeUndefined();

    // Navigating back into the app keeps you logged out: the screens render
    // (no redirect) but the data calls 401 → the task is gone from Today.
    await page.goto("/do/today");
    await expect(page.getByText(title)).toHaveCount(0);

    // The wire agrees: the deleted session no longer answers RPC.
    const res = await page.request.post("/rpc/tasks/list", {
      headers: {
        "content-type": "application/json",
        "x-requested-with": "actionamp-e2e",
      },
      data: { json: {} },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("auth — CLI token mint (S10 × F10b)", () => {
  test("FREE plans get the 402 upsell; PRO mints a working aa_ token", async ({
    page,
  }) => {
    // FREE: a fresh dev-login user has no plan, no grant, not admin.
    const freeEmail = uniqueEmail();
    await loginAs(page, freeEmail);
    const denied = await authPost(page, "/api/auth/mint-cli-token", {});
    expect(denied.status).toBe(402);
    expect(denied.body).toMatchObject({
      error: "CLI and API access is a Pro feature.",
      feature: "CLI and API access",
      reason: "use ActionAmp from the terminal or with an agent",
    });

    // PRO: the seed script grants DEV_EMAIL a manualAccessGrant (idempotent,
    // find-or-create, localhost-guarded) — the same headroom search.spec uses.
    execSync("bun src/seed-search.ts", {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://jake@localhost:5432/actionamp_dev",
      },
      stdio: "pipe",
    });
    await loginAs(page, DEV_EMAIL);
    const allowed = await authPost(page, "/api/auth/mint-cli-token", {});
    expect(allowed.status).toBe(200);
    const token = allowed.body.token as string;
    expect(token).toMatch(/^aa_[A-Za-z0-9_-]{43}$/);
    expect(allowed.body.label).toBeTruthy();

    // The minted PAT authenticates the Bearer path (F10b) against /rpc.
    const me = await page.request.post("/rpc/prefs/getAccount", {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      data: { json: {} },
    });
    expect(me.ok()).toBe(true);
    const account = (await me.json()) as { json: { email: string | null } };
    expect(account.json.email).toBe(DEV_EMAIL);

    // Revoke (delete) so the spec leaves no live credentials behind.
    await page.request.delete(`/api/dev/pat?token=${encodeURIComponent(token)}`);
  });

  test("mint without a session answers 401", async ({ request }) => {
    const res = await request.post("/api/auth/mint-cli-token", {
      headers: { "content-type": "application/json" },
      data: {},
    });
    expect(res.status()).toBe(401);
  });
});
