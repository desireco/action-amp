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

/** On step 1 (Classify), select a type, then Continue to step 2 (Spec).
 * The lens radios + type chooser render TOGETHER on step 1; selecting the
 * type before Continue is what advances with that type chosen. When the item
 * carries a resolved project destination (e.g. #general), the lens radios are
 * replaced by a destination banner — so wait for the type chooser directly. */
async function pickTypeAndContinue(page: Page, typeLabel: string) {
  await page.locator(".aa-triage-types button").first().waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator(".aa-triage-types button")
    .filter({ hasText: new RegExp(`^${typeLabel}`) })
    .click();
  await page.locator(".aa-triage-step__continue").click();
}

test("a #project capture token preselects the project link (type stays Task)", async ({ page }) => {
  // Regression guard: #project means "this task belongs to that project"
  // (TRIAGE.md §7.5 — link, don't create). Triage keeps the type as Task and
  // pre-fills the Project spec row from the parsed hint, so completing files
  // the task under the matched project with no manual selection.
  //
  // We create a uniquely-named Me-lens project first: ensureOnboarded seeds a
  // "General" project per lens, so "#general" is ambiguous (resolves to Work's
  // General, which a FREE user can't file into → 402). A unique name pins the
  // match unambiguously to one project.
  const PROJECT = "Briefs";
  await signupNewUser(page);
  await page.goto("/app/projects");
  await page.getByRole("button", { name: "New project" }).click();
  const nameInput = page.getByPlaceholder(/ship product|project name/i);
  await nameInput.waitFor({ state: "visible", timeout: 5_000 });
  await nameInput.fill(PROJECT);
  await nameInput.press("Enter");
  await page.getByText(PROJECT).waitFor({ state: "visible", timeout: 10_000 });

  // Capture with the project hint. Navigate home first so the app shell is in
  // a known state for openCapture (which waits on the Next nav link). The
  // #token opens an autocomplete; the first Enter accepts the suggestion
  // (closing the menu), the second submits.
  await page.goto("/app");
  const textarea = await openCapture(page);
  await textarea.fill(`Draft the brief #${PROJECT.toLowerCase()}`);
  await textarea.press("Enter"); // accept the suggestion
  await textarea.press("Enter"); // submit the capture
  await page.keyboard.press("Escape"); // close the popover
  await page.goto("/app/inbox/review");
  await expect(page.getByText("Draft the brief")).toBeVisible({ timeout: 10_000 });

  // Task is the default type; the project hint pre-fills the destination. Just
  // continue through and commit — no manual project selection needed. Wait for
  // the triage action response before asserting (the exit animation fires
  // before the server resolves — same race commitTriage handles).
  await pickTypeAndContinue(page, "Task");
  const triageRes = page
    .waitForResponse((r) => r.url().includes("/operations/triage-inbox-item"), { timeout: 10_000 })
    .catch(() => null);
  await page.getByRole("button", { name: /^ready$|^complete$/i }).click();
  const res = await triageRes;
  if (res) expect(res.ok()).toBeTruthy();
  await expect(page.getByText("Draft the brief")).toHaveCount(0, { timeout: 10_000 });

  // Filed under the Briefs project — visible on its detail page.
  await page.goto("/app/projects");
  await page.getByText(PROJECT).click();
  await expect(page.getByText("Draft the brief")).toBeVisible({ timeout: 10_000 });
});

test("becoming a Project uses the item text as the name", async ({ page }) => {
  await signupNewUser(page);
  const text = "Relaunch the podcast";
  await triageOneItem(page, text, { type: "project" });

  await page.goto("/app/projects");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  await page.goto("/app/inbox");
  await expect(page.getByText(/inbox clear/i)).toBeVisible();
});

test("becoming a Resource (Note) requires a parent before Complete", async ({ page }) => {
  await setupOneItem(page, "Competitor pricing PDF");

  await pickTypeAndContinue(page, "Note");

  // On the spec step, commit is disabled until a parent is chosen. The parent
  // chip (.aa-prop-chip--parent) shows "Pick parent…" when unset; clicking it
  // opens the "File under…" bottom sheet (ResourcePickerSheet).
  const commit = page.getByRole("button", { name: /^ready$|^complete$/i });
  await expect(commit).toBeDisabled();

  await page.locator(".aa-prop-chip--parent").click();
  await page.locator(".aa-picker-sheet__item").filter({ hasText: "General" }).first().click();
  await expect(commit).toBeEnabled();
  await commit.click();

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
  await expect(page.getByText(/inbox clear/i)).toBeVisible();

  // But it's NOT lost — it lands in the Logbook's archived section, with a
  // Restore action (lossless: declining a note never deletes it).
  await page.goto("/app/logbook");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^restore$/i }).click();

  // Restoring returns it to the inbox for re-triage.
  await page.goto("/app/inbox");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});
