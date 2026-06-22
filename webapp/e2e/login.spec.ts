import { test, expect } from "@playwright/test";

/**
 * Login e2e — the one test that honestly answers "is login working".
 *
 * Uses the seeded dev user (set its password via scripts/reset-user.mjs).
 * Covers the exact failure class that unit/component tests CAN'T see: the
 * client POSTing to a down/broken API server.
 *
 * Requires `wasp start` serving on :3000 (see playwright.config.ts).
 */

const E2E_EMAIL = process.env.E2E_EMAIL ?? "zeljko@dakic.com";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Zezanjeamp42";

test("login with known credentials reaches /app", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel(/email/i).fill(E2E_EMAIL);
  await page.getByLabel(/password/i).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();

  // onAuthSucceededRedirectTo: "/app"
  await expect(page).toHaveURL(/\/app/);
});

test("wrong password stays on the auth flow", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel(/email/i).fill(E2E_EMAIL);
  await page.getByLabel(/password/i).fill("definitely-not-the-password");
  await page.getByRole("button", { name: /log in/i }).click();

  // Should NOT reach the app — an error appears, URL stays auth-side.
  await expect(page).not.toHaveURL(/\/app/);
});
