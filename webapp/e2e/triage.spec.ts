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
  await textarea.fill("First decision");
  await textarea.press("Enter");
  await textarea.fill("Second decision");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");

  await page.goto("/app/inbox/review");

  // F6: one item at a time. getInboxItems is newest-first, so the second
  // captured item appears first.
  await expect(page.getByText("Second decision")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("First decision")).not.toBeVisible();
});

test("dispatch to Today transforms the item and clears it from the inbox", async ({ page }) => {
  // ponytail: avoid leading date keywords ("Today", "Tomorrow") — parseCapture
  // strips them from the clean text, breaking text-match assertions.
  const text = "Reply to Sarah via triage";
  await setupOneItemAndTriage(page, text);

  // Today is now a secondary mini button (kbd 1). Press the key — the button's
  // accessible name includes the kbd hint ("Today1"), making name-matching
  // fragile; the shortcut is what the user actually uses.
  await page.keyboard.press("t");
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });

  // And it lands in Today as a committed task.
  await page.goto("/app/today");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });

  // And the inbox is empty.
  await page.goto("/app/inbox");
  await expect(page.getByText(/inbox zero/i)).toBeVisible();
});

test("P files the item into a project (default General) and shows on the Projects page", async ({ page }) => {
  // P now = file-in-project (was: create new project). ensureOnboarded seeds
  // a "General" project per lens, so P files there by default.
  const text = "Draft the press release";
  await setupOneItemAndTriage(page, text);

  // P key → quick-file into the default (General) project.
  // Wait for the projects to load + lastProjectId to resolve to General (the
  // dispatch button reads "File in General") before pressing P — otherwise P
  // opens the picker instead of quick-filing.
  await expect(page.getByRole("button", { name: /file in general/i })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("p");

  // Item leaves triage.
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });

  // The task is NOT standalone-today/someday — it's filed in General.
  await page.goto("/app/projects");
  await expect(page.getByText("General")).toBeVisible({ timeout: 10_000 });
  // And the item's text surfaces as the project's next action / task.
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("clicking the project button opens a picker; picking files into that project", async ({ page }) => {
  const text = "Review the spec";
  await setupOneItemAndTriage(page, text);

  // Click the project dispatch button ("File in General" — the goal button is
  // "File in goal", so /file in general/i is unambiguous).
  await page.getByRole("button", { name: /file in general/i }).click();
  await expect(page.getByRole("heading", { name: /file .+ in/i })).toBeVisible({ timeout: 5_000 });
  // Pick the General row (CSS-scoped — its accessible name now includes the
  // number prefix, so a role-name match is fragile).
  await page.locator(".aa-triage__picker-item").filter({ hasText: "General" }).click();

  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  await page.goto("/app/projects");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("trash deletes the item without creating anything", async ({ page }) => {
  const text = "Discard this note";
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

test("Enter (the default) creates a no-horizon task — lands in Someday", async ({ page }) => {
  const text = "Some random thought";
  await setupOneItemAndTriage(page, text);

  // Enter → the no-horizon default (primary "Task" button).
  await page.keyboard.press("Enter");

  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  // No-horizon = Someday (the bucket for tasks without a time commitment).
  await page.goto("/app/someday");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("Shift+P opens the project picker; its last row creates a new project", async ({ page }) => {
  const text = "Relaunch the podcast";
  await setupOneItemAndTriage(page, text);

  // Shift+P opens the project picker (no longer navigates directly).
  await page.keyboard.press("Shift+p");
  await expect(page.getByRole("heading", { name: /file .+ in/i })).toBeVisible({ timeout: 5_000 });

  // The last row creates a new project from this item → navigate, pre-filled.
  await page.getByRole("button", { name: /create new project/i }).click();
  await expect(page).toHaveURL(/\/app\/projects/);
  const input = page.getByLabel(/project name/i);
  await expect(input).toBeVisible({ timeout: 10_000 });
  await expect(input).toHaveValue(text);

  // Submit → converts the inbox item into a Project (item leaves the inbox).
  await input.press("Enter");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  await page.goto("/app/inbox");
  await expect(page.getByText(/inbox zero/i)).toBeVisible();
});

test("number keys select from the project picker (1 = first project)", async ({ page }) => {
  const text = "Draft the slides";
  await setupOneItemAndTriage(page, text);

  // Open the picker (Shift+P) and wait for General to appear (proves
  // ensureOnboarded has seeded it) before pressing 1 — otherwise an empty list
  // sends "1" to the create-new-project branch.
  await page.keyboard.press("Shift+p");
  const generalRow = page.locator(".aa-triage__picker-item").filter({ hasText: "General" });
  await expect(generalRow).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("1");

  // Item leaves triage + lands filed under General on the Projects page.
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  await page.goto("/app/projects");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("G opens the goal picker; a fresh user sees an empty state", async ({ page }) => {
  await setupOneItemAndTriage(page, "Some task");

  // Shift+G opens the goal picker. A brand-new user has no goals.
  await page.keyboard.press("Shift+g");
  await expect(page.getByRole("heading", { name: /file .+ under goal/i })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/no goals yet/i)).toBeVisible();
  await page.keyboard.press("Escape");
});
