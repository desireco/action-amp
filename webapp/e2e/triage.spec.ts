import { test, expect, type Page } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

/**
 * Triage — FEATURES.md §2 F6 + TRIAGE.md: walk the inbox one item at a time,
 * dispatch each to its destination. The InboxItem is transformed into its
 * concrete type and the original is deleted.
 *
 * Encodes the spec. Key invariants:
 *  - One item shown at a time (not a wall of rows)
 *  - Dispatch transforms + removes from inbox
 *  - The five outcomes: Today, Upcoming, Someday, Project, Trash
 */

/** Capture one item, then open the triage review. */
async function setupOneItemAndTriage(page: Page, text: string) {
  await signupNewUser(page);
  const textarea = await openCapture(page);
  await textarea.fill(text);
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  // Wait for the triage card to mount.
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
}

test("triage shows one item at a time", async ({ page }) => {
  await signupNewUser(page);
  const textarea = await openCapture(page);
  await textarea.fill("Item one");
  await textarea.press("Enter");
  await textarea.fill("Item two");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");

  await page.goto("/app/inbox/review");

  // F6: one item at a time — the first is visible, the second is not yet.
  await expect(page.getByText("Item one")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Item two")).not.toBeVisible();
});

test("dispatch to Today transforms the item and clears it from the inbox", async ({ page }) => {
  const text = "Today task via triage";
  await setupOneItemAndTriage(page, text);

  await page.getByRole("button", { name: /task.*today/i }).click();
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });

  // And it lands in Today as a committed task.
  await page.goto("/app/today");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });

  // And the inbox is empty.
  await page.goto("/app/inbox");
  await expect(page.getByText(/inbox zero/i)).toBeVisible();
});

test("dispatch to Someday files the item as Someday", async ({ page }) => {
  const text = "Someday maybe";
  await setupOneItemAndTriage(page, text);

  await page.getByRole("button", { name: /someday/i }).click();

  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  await page.goto("/app/someday");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("dispatch to Project creates a new Project named after the item", async ({ page }) => {
  const text = "Plan the launch";
  await setupOneItemAndTriage(page, text);

  await page.getByRole("button", { name: /project/i }).first().click();

  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  await page.goto("/app/projects");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("trash deletes the item without creating anything", async ({ page }) => {
  const text = "Throw this away";
  await setupOneItemAndTriage(page, text);

  await page.getByRole("button", { name: /trash/i }).click();

  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  // Not in today, not in someday — genuinely gone.
  await page.goto("/app/today");
  await expect(page.getByText(text)).toHaveCount(0);
  await page.goto("/app/someday");
  await expect(page.getByText(text)).toHaveCount(0);
  // Inbox emptied.
  await page.goto("/app/inbox");
  await expect(page.getByText(/inbox zero/i)).toBeVisible();
});
