import { test, expect } from "@playwright/test";
import { createVerifiedUser, TEST_PASS } from "./helpers";

/**
 * Login e2e — the one test that honestly answers "is login working".
 *
 * Creates a fresh verified user directly in the DB (no email round-trip), then
 * exercises the real login form. Covers the exact failure class that
 * unit/component tests CAN'T see: the client POSTing to a down/broken API
 * server, a session actually round-tripping.
 *
 * Requires `wasp start` serving on :4000 (see playwright.config.ts).
 */

// Wasp's LoginForm renders labels as plain <div>s (not <label> elements), so
// getByLabel() can't associate them — target inputs by type instead.
// Wasp's LoginForm renders labels as plain <div>s (not <label> elements), so
// getByLabel() can't associate them — target inputs by type instead.
const emailInput = (page: import("@playwright/test").Page) => page.locator('input[type="email"]');
const passwordInput = (page: import("@playwright/test").Page) => page.locator('input[type="password"]');

// App-identity guard: our LoginPage renders "Welcome back." via AuthLayout.
// If this heading is missing we're hitting the WRONG app — fail instantly
// with a clear message instead of a 30s selector-timeout.
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /welcome back/i }),
    "ActionAmp login page not found on :4000 — is `wasp start` running in webapp/? (Our client is on :4000 per vite.config.ts, not Wasp's default :3000.)",
  ).toBeVisible();
});

test("login with known credentials reaches /app", async ({ page }) => {
  const email = createVerifiedUser();
  await emailInput(page).fill(email);
  await passwordInput(page).fill(TEST_PASS);
  await page.getByRole("button", { name: /log in/i }).click();

  // onAuthSucceededRedirectTo: "/app"
  await expect(page).toHaveURL(/\/app/);
});

test("wrong password stays on the auth flow", async ({ page }) => {
  const email = createVerifiedUser();
  await emailInput(page).fill(email);
  await passwordInput(page).fill("definitely-not-the-password");
  await page.getByRole("button", { name: /log in/i }).click();

  // Should NOT reach the app — an error message appears, URL stays auth-side.
  await expect(page).not.toHaveURL(/\/app/);
  // Wasp LoginForm surfaces the error inline.
  await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 10000 });
});
