import type { Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Shared e2e helpers.
 *
 * Each feature spec needs a clean, deterministic user state. Strategy: create
 * a fresh, email-verified user via direct DB insert (scripts/create-verified-
 * user.mjs) then log in via the UI. Bypasses signup because the
 * SKIP_EMAIL_VERIFICATION_IN_DEV flag is unreliable in this dev server.
 * Tests encode FEATURES.md / TRIAGE.md requirements, NOT the implementation.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP = path.resolve(__dirname, "..");
const DATABASE_URL = "postgresql://jake@localhost:5432/actionamp_dev";

export const TEST_PASS = "Testpass123!";

/** Random email so parallel tests + re-runs never collide. */
export function uniqueEmail(): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${stamp}@test.actionamp.dev`;
}

/** Create a fresh verified user via direct DB insert. No email round-trip. */
export function createVerifiedUser(
  opts: { email?: string; fullName?: string; password?: string } = {},
): string {
  const email = opts.email ?? uniqueEmail();
  const fullName = opts.fullName ?? "E2E Tester";
  const password = opts.password ?? TEST_PASS;
  // Synchronous: the script is fast (one DB round-trip) and tests need the
  // user to exist before they navigate. execSync keeps the helper simple.
  execSync(
    `node scripts/create-verified-user.mjs --email "${email}" --password "${password}" --fullName "${fullName}"`,
    { cwd: WEBAPP, env: { ...process.env, DATABASE_URL }, stdio: ["pipe", "pipe", "inherit"] },
  );
  return email;
}

/**
 * Create a fresh verified user and log in as them via the UI. Lands on /app.
 * Returns the email. Each call = isolated, empty user state.
 */
export async function signupNewUser(
  page: Page,
  opts: { fullName?: string; email?: string; password?: string } = {},
): Promise<string> {
  const email = createVerifiedUser(opts);
  const password = opts.password ?? TEST_PASS;

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /log in/i }).click();

  await page.waitForURL(/\/app/, { timeout: 15_000 });
  return email;
}

/**
 * Open the capture popover. Tries the F1 keyboard shortcut (⌘K) first — that's
 * the spec under test — and falls back to the visible Capture button only if
 * the shortcut didn't register (e.g. focus race after redirect). Callers that
 * are specifically testing the shortcut should press Meta+K directly.
 */
export async function openCapture(page: Page) {
  // Wait for the app shell to be interactive so the global key handler is live.
  await page.getByRole("link", { name: /what now/i }).waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("Meta+K");
  const dialog = page.getByRole("dialog", { name: /quick capture/i });
  try {
    await dialog.waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    // Shortcut didn't register — use the visible button. NOT a spec fallback
    // for tests that assert the shortcut itself; those press the key directly.
    await page.getByRole("button", { name: /capture/i }).first().click();
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
  }
  // Scope to the textbox role — getByLabel('Capture') is ambiguous (the
  // dialog's aria-label 'Quick capture' also matches).
  const textarea = dialog.getByRole("textbox", { name: "Capture" });
  await textarea.waitFor({ state: "visible", timeout: 5_000 });
  return textarea;
}
