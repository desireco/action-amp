import { expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Shared e2e helpers.
 *
 * Each feature spec needs a clean, deterministic user state. Strategy: create
 * a fresh, email-verified user via direct DB insert (scripts/create-verified-
 * user.mjs) then log in through the local-only dev autologin route. This keeps
 * tests independent from email delivery and the current passwordless UI.
 * Tests encode FEATURES.md / TRIAGE.md requirements, NOT the implementation.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP = path.resolve(__dirname, "..");
// Env-driven so the isolated e2e worktree seeds its own DB (actionamp_e2e)
// while dev runs keep using actionamp_dev. Set E2E_DATABASE_URL in .e2e.env.
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://jake@localhost:5432/actionamp_dev";

export const TEST_PASS = "Testpass123!";

/** Random email so parallel tests + re-runs never collide. */
export function uniqueEmail(): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${stamp}@test.actionamp.dev`;
}

/** Create a fresh verified user via direct DB insert. No email round-trip. */
export function createVerifiedUser(
  opts: { email?: string; fullName?: string; password?: string; admin?: boolean } = {},
): string {
  const email = opts.email ?? uniqueEmail();
  const fullName = opts.fullName ?? "E2E Tester";
  const password = opts.password ?? TEST_PASS;
  // Synchronous: the script is fast (one DB round-trip) and tests need the
  // user to exist before they navigate. execSync keeps the helper simple.
  execSync(
    `node scripts/create-verified-user.mjs --email "${email}" --password "${password}" --fullName "${fullName}"${opts.admin ? " --admin" : ""}`,
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
  opts: { fullName?: string; email?: string; password?: string; admin?: boolean } = {},
): Promise<string> {
  const email = createVerifiedUser(opts);
  await page.goto(`/login?devEmail=${encodeURIComponent(email)}`);
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
  await page
    .getByRole("button", { name: /capture/i })
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
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
 * Complete whatever task is currently surfaced as the top item on the home
 * screen (/app), via the focus-mode flow (Start → focus → Complete).
 *
 * Used to clear the seeded "Try it" starter task (now visible on home since the
 * FREE-tier default lens became Me — entitlement-enforcement) so a test starts
 * from a clean slate. No-op if home is already empty (no Start button).
 */
export async function completeTopTask(page: Page) {
  // ensureOnboarded seeds up to 3 starter tasks in the Me lens. Clear all of
  // them so the test starts from a clean slate: loop the focus-mode completion
  // flow until home shows no Start button (empty).
  for (let i = 0; i < 5; i++) {
    await page.goto("/app");
    const startBtn = page.getByRole("button", { name: /^start$/i });
    // Wait briefly for the home to render a top task. If none appears, home is
    // empty — done.
    if (!(await startBtn.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false))) return;
    await startBtn.click();
    // Start enters focus in the same action; no intermediate Now card.
    await page.getByLabel(/focus:/i).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: /mark complete/i }).click();
    await page.getByRole("button", { name: /^complete$/i }).click();
    await page.getByLabel(/focus:/i).waitFor({ state: "detached", timeout: 10_000 });
  }
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

  // Step 1 (Classify) — lens radios (pre-selected) + the type chooser render
  // TOGETHER. Select the type BEFORE Continue: Continue advances to step 2
  // (spec), which removes the type buttons. The lens is already chosen (Me is
  // the FREE default and checked), so we only touch the type.
  const TYPE_LABEL: Record<typeof dest.type, string> = {
    task: "Task",
    project: "Project",
    resource: "Note",
    archive: "Archive",
  };
  await page.getByRole("radio").first().waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator(".aa-triage-types button")
    .filter({ hasText: new RegExp(`^${TYPE_LABEL[dest.type]}`) })
    .click();

  // Archive commits straight from step 1 — the Continue button IS the triage
  // action (it relabels to "Archive", but the locator matches either). Wait
  // for the server response so the caller sees the item gone.
  if (dest.type === "archive") {
    await commitTriage(page, page.locator(".aa-triage-step__continue"), text);
    return;
  }
  await page.locator(".aa-triage-step__continue").click();

  // Step 2 (Spec) — set When (tasks only), then commit. When is a property
  // chip (.aa-prop-chip--when) defaulting to Upcoming; only change it when an
  // explicit choice is requested. "upcoming" matches the default, no click.
  // The commit button reads "Ready" (was "Complete" before the chip-editor
  // refactor); accept either so this survives either label.
  if (dest.type === "task" && dest.when && dest.when !== "upcoming") {
    const whenChip = page.locator(".aa-prop-chip--when");
    await whenChip.waitFor({ state: "visible", timeout: 10_000 });
    await whenChip.click();
    await page
      .getByRole("button", dest.when === "today" ? { name: /^today$/i } : { name: /^someday$/i })
      .click();
  }
  await commitTriage(page, page.getByRole("button", { name: /^ready$|^complete$/i }), text);
}

/**
 * Click the commit button and wait for triage to ACTUALLY settle — not just the
 * exit animation. The wizard animates the item away the instant the commit is
 * clicked (setExit runs before the server action resolves), so a naive
 * toHaveCount(0) passes while triageInboxItem is still in flight. If the caller
 * then navigates to /app/inbox, the getInboxItems refetch can beat the delete
 * and show the item still present — a flaky "inbox zero" failure. Waiting on the
 * action response guarantees the InboxItem is gone (or ARCHIVED) before we return.
 */
async function commitTriage(
  page: Page,
  commitButton: import("@playwright/test").Locator,
  text: string,
): Promise<void> {
  const triageResponse = page
    .waitForResponse((r) => r.url().includes("/operations/triage-inbox-item"), { timeout: 10_000 })
    .catch(() => null);
  await commitButton.click();
  const res = await triageResponse;
  if (res) expect(res.ok()).toBeTruthy();
  // The exit animation removes the item from the triage stage.
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
}
