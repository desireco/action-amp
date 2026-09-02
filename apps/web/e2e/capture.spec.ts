import { expect, test, type Page } from "@playwright/test";
import { DEV_EMAIL, loginAs } from "./helpers";

/**
 * Capture — ported from webapp/e2e/capture.spec.ts (S2). See the P0 notes
 * (packages/contract/src/s2-capture/README.md): the cross-layer bits are the
 * global ⌘K wiring and the Enter vs ⌘Enter commit semantics. NL-chip parsing
 * is pinned by the domain parser suite (66 cases); inbox landing by
 * triage.spec.ts.
 *
 * The overlay is global (⌘K works everywhere once the integrator mounts it in
 * +layout.svelte); until that line lands, the S2/S3 route pages mount it — so
 * the spec runs from /do/inbox.
 */

/** Open the capture popover: ⌘K first (the spec under test), FAB fallback. */
async function openCapture(page: Page) {
  await page
    .getByRole("button", { name: /capture/i })
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("Meta+K");
  const dialog = page.getByRole("dialog", { name: /quick capture/i });
  try {
    await dialog.waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    // Shortcut didn't register — use the visible button. NOT a fallback for
    // the test that asserts the shortcut itself; that one presses the key.
    await page.getByRole("button", { name: /capture/i }).first().click();
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
  }
  const textarea = dialog.getByRole("textbox", { name: "Capture" });
  await textarea.waitFor({ state: "visible", timeout: 5_000 });
  return textarea;
}

test("⌘K opens the capture popover", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);
  await page.goto("/do/inbox");
  // Focus the document so the global key handler receives the event.
  await page.locator("body").click();

  await page.keyboard.press("Meta+K");

  await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeVisible({
    timeout: 5_000,
  });
});

test("⌘Enter keeps the popover open (rapid-fire); Enter commits and closes", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  await page.goto("/do/inbox");

  // ⌘Enter = add another: stays open, input clears, focus retained.
  const textarea = await openCapture(page);
  await textarea.fill("Email Sarah");
  await textarea.press("Meta+Enter");
  const dialog = page.getByRole("dialog", { name: /quick capture/i });
  await expect(dialog).toBeVisible();
  await expect(textarea).toHaveValue("");
  await expect(textarea).toBeFocused();

  // Enter = capture + close (commit this one and get back to work).
  await textarea.fill("One thing on my mind");
  await textarea.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 5_000 });
});
