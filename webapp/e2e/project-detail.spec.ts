import { test, expect } from "@playwright/test";
import { signupNewUser, triageOneItem } from "./helpers";

/**
 * Project detail page — /do/projects/:id.
 *
 * Previously the Projects page linked a project to /do/tasks/<projectId> (wrong
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
  await page.goto("/do/projects");
  await page.getByText(projectName).click();

  // We're on the detail page: the project name shows as the title.
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 });

  // Add a task inline. It lands on Upcoming (the default) and is visible.
  // The add affordance is "Add task" (toggles the inline composer).
  await page.getByRole("button", { name: /add task/i }).click();
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

test("lifecycle actions sit behind ⋯; Edit and Add task stay visible (desktop)", async ({ page }) => {
  await signupNewUser(page);

  const projectName = "Overflow menu project";
  await triageOneItem(page, projectName, { type: "project" });
  await page.goto("/do/projects");
  await page.getByText(projectName).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 });

  // Desktop tray: Add task + Edit visible, no inline lifecycle buttons.
  await expect(page.getByRole("button", { name: /add task/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^delete$/i })).not.toBeVisible();

  // ⋯ opens the popover with the lifecycle actions; Archive confirms.
  await page.getByRole("button", { name: "Project actions" }).click();
  await expect(page.getByRole("menuitem", { name: /^move$/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^archive$/i })).toBeVisible();
  await page.getByRole("menuitem", { name: /^archive$/i }).click();
  await expect(page.getByText(/archive this project/i)).toBeVisible({ timeout: 10_000 });
});
