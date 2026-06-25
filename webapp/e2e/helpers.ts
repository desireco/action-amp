import { expect, type Page } from "@playwright/test";
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
  await page.getByRole("link", { name: /^next$/i }).waitFor({ state: "visible", timeout: 10_000 });
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

/**
 * Capture one item, then open the triage review and walk the wizard through to
 * a destination. Triage is a deliberate spec flow, not a one-key dispatch, so
 * every outcome goes through: step 1 (lens → Continue) → step 2 (type →
 * Continue) → step 3 (spec defaults → Complete). `dest` selects the type at
 * step 2 ("task" | "project" | "resource" | "archive"); "task" lands the item on
 * the Upcoming bench by default — pass `when: "today"` to commit it to Today,
 * or `when: "someday"` to demote it to Someday.
 *
 * Returns once the item has left the triage stage (exit animation fired).
 */
export async function triageOneItem(
  page: Page,
  text: string,
  dest: { type: "task" | "project" | "resource" | "archive"; when?: "today" | "upcoming" | "someday" } = { type: "task" },
): Promise<void> {
  // Capture → inbox. (The caller must have signed in first — see signupNewUser.)
  const textarea = await openCapture(page);
  await textarea.fill(text);
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });

  // Step 1 — confirm the active lens (pre-selected). Continue is the primary
  // button; the lens radio has role=radio.
  await page.getByRole("radio").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Step 2 — pick the type. The type buttons' visible label is the outcome
  // name (Task/Project/Note/Archive); "resource" surfaces as "Note".
  const TYPE_LABEL: Record<typeof dest.type, string> = {
    task: "Task",
    project: "Project",
    resource: "Note",
    archive: "Archive",
  };
  await page.getByRole("button", { name: new RegExp(`^${TYPE_LABEL[dest.type]}`, "i") }).click();
  // The step-2 commit button reads "Continue" (or "Archive" for the archive
  // type). Scope to the primary button so the click can't hit the type pill.
  await page.locator(".aa-triage-step__continue").click();

  if (dest.type === "archive") {
    await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
    return;
  }

  // Step 3 — set When (tasks only), then Complete. The spec row is pre-filled
  // with the default (Upcoming), so we only touch it when an explicit choice
  // is requested. "upcoming" matches the default and needs no click.
  if (dest.type === "task" && dest.when && dest.when !== "upcoming") {
    const whenRow = page.locator(".aa-spec-key", { hasText: /^when$/i }).locator("..");
    await whenRow.click();
    await page.getByRole("button", { name: dest.when === "today" ? /^today$/i : /^someday$/i }).click();
  }
  await page.getByRole("button", { name: /^complete$/i }).click();
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
}

