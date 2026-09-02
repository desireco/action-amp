import { defineConfig, devices } from "@playwright/test";

/**
 * apps/web e2e config (F11) — the new-stack harness, lessons ported from
 * webapp/playwright.config.ts.
 *
 * ── No `webServer`, ever ───────────────────────────────────────────────
 * Locally Playwright kills a reused server mid-run (bug #11907 — the same
 * one webapp's config works around), so servers are started manually and
 * `globalSetup` polls until both are up, failing fast with the exact start
 * command if not. CI can adopt a webServer later (S-slice); the poll-based
 * globalSetup stays the local contract.
 *
 * ── How to run (three terminals) ───────────────────────────────────────
 *   1. The API (Hono, :8080):
 *        cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev \
 *          NODE_ENV=development bun --hot src/index.ts
 *      NODE_ENV=development is required — the dev login route the e2e
 *      helper authenticates through is gated to it (404 otherwise).
 *   2. The web app (SvelteKit dev server, :5174, proxies /api + /rpc to :8080):
 *        cd apps/web && bunx vite dev --port 5174
 *   3. The tests:
 *        cd apps/web && bunx playwright test
 *
 * One-shot data seed (idempotent) so the dev user has its four sample
 * tasks — the smoke spec asserts against them:
 *        cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed.ts
 *
 * `baseURL` is the web app (:5174) — every browser navigation and
 * `page.request` call goes through the vite proxy so the `wasp_session`
 * cookie lands on the app's own origin.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5174";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 30_000,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
