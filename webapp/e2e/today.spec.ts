import { test, expect } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

/**
 * Today — FEATURES.md §4 F12: Today is capped (default 5). To add a 6th, you
 * must bump one out. This forces the "what actually matters today" decision.
 *
 * Encodes the spec. The cap is the feature, not a limit.
 */

/** Capture + triage `count` items to Today. */
async function fillToday(page: import("@playwright/test").Page, count: number) {
  const textarea = await openCapture(page);
  for (let i = 0; i < count; i++) {
    await textarea.fill(`Today item ${i + 1}`);
    await textarea.press("Enter");
  }
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  // Dispatch each captured item to Today. Wait for each item's text to appear
  // before clicking — the dispatch is async and the loop would race ahead.
  for (let i = 0; i < count; i++) {
    const label = `Today item ${i + 1}`;
    await page.getByText(label).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("button", { name: /today/i }).first().click();
    // Wait for the dispatched item to leave the review screen.
    await expect(page.getByText(label)).toHaveCount(0, { timeout: 10_000 });
  }
}

test("empty Today shows a calm empty state", async ({ page }) => {
  await signupNewUser(page);
  await page.goto("/app/today");
  await expect(page.getByText(/nothing|clear|empty|no .*today/i)).toBeVisible({ timeout: 10_000 });
});

test("triaged-to-Today items appear in the Today list", async ({ page }) => {
  await signupNewUser(page);
  await fillToday(page, 2);
  await page.goto("/app/today");

  await expect(page.getByText("Today item 1")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Today item 2")).toBeVisible();
});

test("F12: Today is capped at 5 — a 6th item is flagged as over-capacity", async ({ page }) => {
  await signupNewUser(page);
  await fillToday(page, 6);
  await page.goto("/app/today");

  // F12: at most 5 committed; the 6th must be surfaced as "over capacity" (or
  // otherwise blocked from the committed set). The exact UI is open, but the
  // app must NOT silently show 6 as if all are committed.
  const items = page.getByText(/^Today item \d+$/);
  await expect(items.nth(0)).toBeVisible({ timeout: 10_000 });
  // Exactly 5 in the committed set; the 6th is flagged or hidden.
  await expect(items).toHaveCount(5);
  // And there's a signal that capacity was exceeded.
  await expect(page.getByText(/over capacity|too many|cap|6th|exceed/i)).toBeVisible();
});
