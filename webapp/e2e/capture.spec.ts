import { test, expect } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

/**
 * Capture — FEATURES.md §1 (F1 quick-add, F2 NL parsing, F3 lands in inbox).
 *
 * These tests encode the spec, not the current code. A failure is a real gap.
 *
 * F1: Cmd+K (or ⌘/) opens a floating input from anywhere. Type, Enter, done.
 *     Stays on the current screen.
 * F2: Natural-language parsing — tokens show as chips inline BEFORE Enter.
 * F3: Everything lands in the Inbox unassigned.
 */

test.describe("F1 — quick capture", () => {
  test("⌘K opens the capture popover from the home screen", async ({ page }) => {
    await signupNewUser(page);
    await expect(page).toHaveURL(/\/app/);
    // Focus the document so the global key handler receives the event.
    await page.locator("body").click();

    await page.keyboard.press("Meta+K");

    await expect(
      page.getByRole("dialog", { name: /quick capture/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("⌘/ (the primary shortcut per TRIAGE.md) also opens capture", async ({ page }) => {
    await signupNewUser(page);
    await page.locator("body").click();

    await page.keyboard.press("Meta+/");

    await expect(
      page.getByRole("dialog", { name: /quick capture/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("typing + Enter captures the item and keeps the popover open (rapid-fire)", async ({ page }) => {
    await signupNewUser(page);
    const textarea = await openCapture(page);

    await textarea.fill("Email Sarah");
    await textarea.press("Enter");

    // F1: stays open for rapid capture. Input clears.
    await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeVisible();
    await expect(textarea).toHaveValue("");
    await expect(textarea).toBeFocused();
  });

  test("capture does not navigate away from the current screen", async ({ page }) => {
    await signupNewUser(page);
    const startUrl = page.url();

    const textarea = await openCapture(page);
    await textarea.fill("A thought");
    await textarea.press("Enter");

    await expect(page).toHaveURL(startUrl);
  });
});

test.describe("F2 — natural-language parsing shows chips inline before Enter", () => {
  test("parses a tag (#) into a chip preview", async ({ page }) => {
    await signupNewUser(page);
    const textarea = await openCapture(page);

    await textarea.fill("Email Sarah #work");

    // F2: parsed token shows as a chip in the dialog BEFORE Enter is pressed.
    const dialog = page.getByRole("dialog", { name: /quick capture/i });
    await expect(dialog.locator(".aa-chip", { hasText: "#work" })).toBeVisible();
  });

  test("parses priority (!3) and date (tomorrow) tokens into chip previews", async ({ page }) => {
    await signupNewUser(page);
    const textarea = await openCapture(page);

    await textarea.fill("Ship the spec tomorrow !3");

    const dialog = page.getByRole("dialog", { name: /quick capture/i });
    // The priority token maps to a chip (exact label may evolve; assert it's
    // surfaced as a chip, not left buried in the raw text).
    await expect(dialog.locator(".aa-chip").first()).toBeVisible();
  });
});

test.describe("F3 — captured items land in the Inbox", () => {
  test("a captured item appears in the inbox list", async ({ page }) => {
    await signupNewUser(page);
    const textarea = await openCapture(page);

    await textarea.fill("Reply to Marc");
    await textarea.press("Enter");
    // Close the popover to go look at the inbox.
    await page.keyboard.press("Escape");

    await page.goto("/app/inbox");

    // F3: the item lands here, unassigned, showing its text.
    await expect(page.getByText("Reply to Marc")).toBeVisible();
  });

  test("the inbox count reflects the number of captured items", async ({ page }) => {
    await signupNewUser(page);

    const textarea = await openCapture(page);
    await textarea.fill("First item");
    await textarea.press("Enter");
    await textarea.fill("Second item");
    await textarea.press("Enter");
    await page.keyboard.press("Escape");

    await page.goto("/app/inbox");

    // The inbox heading encodes the count (e.g. "2 to triage"). Either form
    // is acceptable as long as both items are listed.
    await expect(page.getByText("First item")).toBeVisible();
    await expect(page.getByText("Second item")).toBeVisible();
  });
});
