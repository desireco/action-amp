import { defineConfig, devices } from "@playwright/test";

/**
 * ActionAmp e2e config.
 *
 * No `webServer` — you MUST run `wasp start` in a separate terminal first.
 * Two processes can't manage the Wasp dev server (they fight for :3000/:3001
 * and SIGTERM each other). globalSetup waits for :3000 and fails fast with a
 * clear message if the server isn't up.
 *
 * Run: `npm run test:e2e` (after `wasp start` is serving on :3000).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
