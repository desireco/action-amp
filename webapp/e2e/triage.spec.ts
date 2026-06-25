import { test, expect, type Page } from "@playwright/test";
import { signupNewUser, openCapture, triageOneItem } from "./helpers";

/**
 * Triage — the deliberate specification flow (TRIAGE.md). Each captured item is
 * defined through a wizard: 1) confirm the lens, 2) choose what it becomes, 3)
 * set the spec, 4) Complete. The InboxItem is transformed into its concrete
 * type and the original is deleted.
 *
 * Encodes the spec. Key invariants:
 *  - One item shown at a time (not a wall of rows).
 *  - Complete is gated until the lens is confirmed + a filing target is set
 *    (for Task/Resource outcomes).
 *  - The five outcomes: Today, Upcoming, Someday, Project, Archive.
 */

/** Capture one item, then open the triage review (stop at step 1). */
async function setupOneItem(page: Page, text: string) {
  await signupNewUser(page);
  const textarea = await openCapture(page);
  await textarea.fill(text);
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
}

/** Advance step 1 (lens → Continue) to land on the type chooser. */
async function continueFromLens(page: Page) {
  // The lens radio renders first; Continue is the primary button.
  await page.getByRole("radio").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: /^continue$/i }).click();
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

test("the wizard opens on the lens step; the active lens is pre-selected", async ({ page }) => {
  await setupOneItem(page, "Some thought");

  // Step 1 shows the lens radio (ensureOnboarded seeds Work + Me).
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(2, { timeout: 10_000 });
  // The active lens (Work) is checked by default — Continue is enabled.
  await expect(page.getByRole("radio", { name: /work/i })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: /^continue$/i })).toBeEnabled();
});

test("Complete defaults to a no-horizon task (lands in Someday)", async ({ page }) => {
  await signupNewUser(page);
  const text = "Some random thought";
  await triageOneItem(page, text, { type: "task" });

  // No-horizon = Someday (the bucket for tasks without a time commitment).
  await page.goto("/app/someday");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("a task can be committed to Today via the spec step", async ({ page }) => {
  await signupNewUser(page);
  const text = "Reply to Sarah via triage";
  await triageOneItem(page, text, { type: "task", when: "today" });

  await page.goto("/app/today");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  // And the inbox is empty.
  await page.goto("/app/inbox");
  await expect(page.getByText(/inbox zero/i)).toBeVisible();
});

test("becoming a Project uses the item text as the name", async ({ page }) => {
  await signupNewUser(page);
  const text = "Relaunch the podcast";
  await triageOneItem(page, text, { type: "project" });

  await page.goto("/app/projects");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  await page.goto("/app/inbox");
  await expect(page.getByText(/inbox zero/i)).toBeVisible();
});

test("becoming a Resource (Note) requires a parent before Complete", async ({ page }) => {
  await setupOneItem(page, "Competitor pricing PDF");

  await continueFromLens(page);
  await page.getByRole("button", { name: /^note\b/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();

  // On the spec step, Complete is disabled until a parent is chosen — the
  // parent row opens a bottom-sheet picker.
  const complete = page.getByRole("button", { name: /^complete$/i });
  await expect(complete).toBeDisabled();

  await page.locator(".aa-spec-key", { hasText: /^file under$/i }).locator("..").click();
  await page.locator(".aa-triage__picker-item").filter({ hasText: "General" }).first().click();
  await expect(complete).toBeEnabled();
  await complete.click();

  await expect(page.getByText("Competitor pricing PDF")).toHaveCount(0, { timeout: 10_000 });
});

test("a Task can be filed into a project via the Project spec row", async ({ page }) => {
  const text = "Draft the press release";
  await setupOneItem(page, text);

  await continueFromLens(page);
  await page.getByRole("button", { name: /^task\b/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Open the Project row → bottom sheet → pick General.
  await page.locator(".aa-spec-key", { hasText: /^project$/i }).locator("..").click();
  await page.locator(".aa-triage__picker-item").filter({ hasText: "General" }).click();
  await page.getByRole("button", { name: /^complete$/i }).click();

  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  await page.goto("/app/projects");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("Archive keeps the note — it leaves the inbox but surfaces in the Logbook", async ({ page }) => {
  await signupNewUser(page);
  const text = "Decline this for now";
  await triageOneItem(page, text, { type: "archive" });

  // Not a task anywhere — it wasn't turned into actionable work.
  await page.goto("/app/today");
  await expect(page.getByText(text)).toHaveCount(0);
  await page.goto("/app/someday");
  await expect(page.getByText(text)).toHaveCount(0);
  // …and it leaves the inbox.
  await page.goto("/app/inbox");
  await expect(page.getByText(/inbox zero/i)).toBeVisible();

  // But it's NOT lost — it lands in the Logbook's archived section, with a
  // Restore action (lossless: declining a note never deletes it).
  await page.goto("/app/logbook");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^restore$/i }).click();

  // Restoring returns it to the inbox for re-triage.
  await page.goto("/app/inbox");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});

test("Esc backs out of the wizard a step at a time, then to the inbox", async ({ page }) => {
  await setupOneItem(page, "Some task");

  await continueFromLens(page); // → step 2 (type)
  await expect(page.getByRole("button", { name: /^task\b/i })).toBeVisible();
  await page.keyboard.press("Escape"); // back to step 1
  await expect(page.getByRole("radio").first()).toBeVisible();
  await page.keyboard.press("Escape"); // at step 1, Esc leaves triage
  await expect(page).toHaveURL(/\/app\/inbox$/);
});
