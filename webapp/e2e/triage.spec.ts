import { test, expect, type Page } from "@playwright/test";
import { signupNewUser, openCapture, triageOneItem } from "./helpers";

/**
 * Triage — the deliberate specification flow (TRIAGE.md). Each captured item is
 * defined through a wizard: 1) confirm the lens, 2) choose what it becomes, 3)
 * set the spec, 4) Complete. The InboxItem is transformed into its concrete
 * type and the original is deleted.
 *
 * Keep the cross-layer invariants only — the lossless Archive (→ Logbook →
 * Restore), the Complete-gating (Resource needs a parent before the commit
 * unlocks), becomes-a-Project (capture text → project name), and the #project
 * token preselect (capture parsing → triage spec wiring). Dropped: one-item-
 * at-a-time, lens pre-selected, default-Upcoming, today-via-triage, Esc-back-
 * out, task-filed-into-project — component-testable or redundant with the
 * kept four and project-detail.spec.ts.
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

test("a #project capture token preselects the project link (type stays Task)", async ({ page }) => {
  // Regression guard: #project means "this task belongs to that project"
  // (TRIAGE.md §7.5 — link, don't create). Triage keeps the type as Task and
  // pre-fills the Project spec row from the parsed hint, so completing files
  // the task under the matched project with no manual selection.
  // ensureOnboarded seeds a "General" project per lens; #general resolves to
  // it. Capture strips the token, so we capture "…#general" but the stored
  // item text is the token-free remainder.
  await signupNewUser(page);
  const textarea = await openCapture(page);
  await textarea.fill("Draft the brief #general");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  await expect(page.getByText("Draft the brief")).toBeVisible({ timeout: 10_000 });

  await continueFromLens(page);
  await page.getByRole("button", { name: /^task\b/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  // No Project row change — rely on the parsed-#general preselection.
  await page.getByRole("button", { name: /^complete$/i }).click();
  await expect(page.getByText("Draft the brief")).toHaveCount(0, { timeout: 10_000 });

  // Filed under the General project — visible on its detail page.
  await page.goto("/app/projects");
  await page.getByText("General").click();
  await expect(page.getByText("Draft the brief")).toBeVisible({ timeout: 10_000 });
});

test("becoming a Project uses the item text as the name", async ({ page }) => {
  await signupNewUser(page);
  const text = "Relaunch the podcast";
  await triageOneItem(page, text, { type: "project" });

  await page.goto("/app/projects");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  await page.goto("/app/inbox");
  await expect(page.getByText(/nothing left to decide/i)).toBeVisible();
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
  await expect(page.getByText(/nothing left to decide/i)).toBeVisible();

  // But it's NOT lost — it lands in the Logbook's archived section, with a
  // Restore action (lossless: declining a note never deletes it).
  await page.goto("/app/logbook");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^restore$/i }).click();

  // Restoring returns it to the inbox for re-triage.
  await page.goto("/app/inbox");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});
