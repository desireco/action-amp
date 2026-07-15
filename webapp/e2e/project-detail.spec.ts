import { test, expect } from "@playwright/test";
import { signupNewUser, triageOneItem } from "./helpers";

/**
 * Project detail page — /app/projects/:id.
 *
 * Previously the Projects page linked a project to /app/tasks/<projectId> (wrong
 * table → always blank). Now it links to a real detail page that shows the
 * project's tasks and lets you add one or move it between horizons. There is no
 * completion control on the row itself — completing a task happens in focus
 * mode (exercised in next.spec.ts), not by ticking a list row.
 */

test("opening a project shows its tasks; add + horizon move work", async ({ page }) => {
  await signupNewUser(page);

  // Create a project with one task via triage (the only existing create path).
  const projectName = "Relaunch the podcast";
  await triageOneItem(page, projectName, { type: "project" });

  // Open the project from the Projects list — this is the link that was broken.
  await page.goto("/app/projects");
  await page.getByText(projectName).click();

  // We're on the detail page: the project name shows as the title.
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 });

  // Add a task inline. It lands on Upcoming (the default) and is visible.
  // The add affordance is "Add step" (toggles the inline composer).
  await page.getByRole("button", { name: /add step/i }).click();
  await page.getByPlaceholder(/what needs doing/i).fill("Record episode 1");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText("Record episode 1")).toBeVisible({ timeout: 10_000 });

  // The row has no checkbox — but it does let you promote it onto Today.
  // The horizon controls live in a sibling div; the "Today" button promotes
  // an Upcoming task onto Today.
  const row = page.locator(".aa-project__row").filter({ hasText: "Record episode 1" });
  await expect(row.locator(".aa-task-row__circle")).toHaveCount(0);
  await row.getByRole("button", { name: /^today$/i }).click();

  // Promoted onto Today. With exactly one Today task, the project surfaces it
  // as the NEXT STEP hero (a "Start" pointer into focus mode) rather than a
  // plain horizon row — so assert the hero's Start action is visible.
  await expect(page.getByText("Record episode 1")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^start$/i })).toBeVisible({ timeout: 10_000 });
});
