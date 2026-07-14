import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

/**
 * ActionAmp e2e config — supports two modes.
 *
 * ── Default (dev-coupled) ──────────────────────────────────────────────
 * No `webServer`. You MUST run `wasp start` in a separate terminal first.
 * globalSetup waits for the client and fails fast if it isn't up.
 * Client on :4000, DB actionamp_dev. Run: `npm run test:e2e`.
 *
 * ── Isolated (worktree) ────────────────────────────────────────────────
 * Activated when E2E_WORKTREE=1 (set via `npm run test:e2e:isolated`, which
 * loads .e2e.env). Runs against a git worktree on :4100/:3101 with its own
 * DB (actionamp_e2e) — side-by-side with dev without port or .wasp/ collision.
 * See scripts/e2e-setup.sh.
 *
 * `webServer` is CI-ONLY. Locally it kills the server mid-run (Playwright
 * bug #11907, the same one Wasp's own configs work around): with
 * reuseExistingServer:true, Playwright still tears the process down during the
 * run. So locally you start `wasp start` in the worktree manually and
 * globalSetup polls it. In CI, webServer owns the full lifecycle.
 *
 * NOTE: client is on :4000 in dev (vite.config.ts, overridable via VITE_PORT),
 * NOT Wasp's default :3000.
 */
// Tiny dotenv loader for .e2e.env — no dep, gitignored, only present in the
// e2e worktree. Populates process.env before the config below reads it.
if (existsSync(".e2e.env")) {
  for (const line of readFileSync(".e2e.env", "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i > 0) process.env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
}

const ISOLATED = !!process.env.E2E_WORKTREE;
const BASE =
  process.env.E2E_BASE_URL ?? (ISOLATED ? "http://localhost:4100" : "http://localhost:4000");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // CI-only: Playwright owns the server lifecycle via scripts/e2e-run.mjs
  // (spawn + SIGTERM teardown). Locally, start `wasp start` manually — see
  // the header comment for why (Playwright bug #11907).
  ...(ISOLATED && process.env.CI
    ? {
        webServer: {
          command: "node scripts/e2e-run.mjs",
          url: BASE,
          reuseExistingServer: false,
          timeout: 240_000,
          gracefulShutdown: { signal: "SIGTERM", timeout: 1_000 },
        },
      }
    : {}),
});
