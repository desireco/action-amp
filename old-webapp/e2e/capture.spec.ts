import { test, expect } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

/**
 * Capture — docs/features/capture.md.
 *
 * Keep: the cross-layer bits — ⌘K opens the popover (the global key handler is
 * a real wiring concern) + the ⌘Enter/Enter commit semantics (rapid-fire vs
 * commit-and-close). Dropped: F2 NL-parsing chips (parsing covered by
 * src/inbox/parseCapture.test.ts + projectResolver.test.ts; chip render is
 * component-testable) and F3 inbox-landing (covered by triage.spec.ts).
 */

test("⌘K opens the capture popover from the home screen (F1)", async ({ page }) => {
  await signupNewUser(page);
  await expect(page).toHaveURL(/\/do/);
  // Focus the document so the global key handler receives the event.
  await page.locator("body").click();

  await page.keyboard.press("Meta+K");

  await expect(
    page.getByRole("dialog", { name: /quick capture/i }),
  ).toBeVisible({ timeout: 5_000 });
});

test("⌘Enter keeps the popover open (rapid-fire); Enter commits and closes", async ({ page }) => {
  await signupNewUser(page);

  // ⌘Enter = add another: stays open, input clears, focus retained.
  const textarea = await openCapture(page);
  await textarea.fill("Email Sarah");
  await textarea.press("Meta+Enter");
  await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeVisible();
  await expect(textarea).toHaveValue("");
  await expect(textarea).toBeFocused();

  // Enter = capture + close (commit this one and get back to work).
  await textarea.fill("One thing on my mind");
  await textarea.press("Enter");
  await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeHidden({ timeout: 5_000 });
});
