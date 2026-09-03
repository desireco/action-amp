import { test, expect } from "@playwright/test";
import { apiPost, loginAs, DEV_EMAIL, activeLensId } from "./helpers";

/**
 * Project detail page — /do/projects/:permalink (S5 port of
 * webapp/e2e/project-detail.spec.ts).
 *
 * Adaptations for the new stack (behavior identical, setup re-authed):
 * - webapp's signupNewUser → the API dev login as the seeded dev user (the
 *   seed also grants PRO, so repeated runs never trip the FREE caps), and
 * - webapp's triageOneItem → direct /rpc/projects/create (triage's project
 *   branch is S2/S3's surface; the project row this spec exercises starts at
 *   the projects endpoint either way),
 * - names are suffixed per run — project names are NOT unique, but the list
 *   assertions must not match a previous run's cards.
 *
 * Case 3 of the webapp spec (decline from the task page) runs against S4's
 * /do/tasks/[permalink] page; the only adaptation is navigation — the task
 * page's returnTo is /do (not the project), so the spec returns manually.
 */

function uniqueName(base: string): string {
  return `${base} ${Date.now()}`;
}

async function createProject(page: import("@playwright/test").Page, name: string) {
  // Explicit lens: the shell's entitlement-aware active lens (the server's
  // no-lens fallback is the primary/included lens, which an entitled dev
  // user is not looking at — AppShell parity).
  return apiPost<{ id: string; permalink: string; name: string }>(
    page,
    "/rpc/projects/create",
    { name, lensId: await activeLensId(page) },
  );
}

test("opening a project shows its tasks; add + horizon move work", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);

  const projectName = uniqueName("Relaunch the podcast");
  await createProject(page, projectName);

  // Open the project from the Projects list.
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

  // The row has no completion circle — completing happens in focus mode, not
  // by ticking a row.
  const row = page.locator(".aa-project__row").filter({ hasText: "Record episode 1" });
  await expect(row.locator(".aa-task-row__circle")).toHaveCount(0);
  await row.getByRole("button", { name: /^today$/i }).click();

  // Promoted onto Today. With exactly one Today task, the project surfaces it
  // as the NEXT STEP hero (a "Start" pointer into focus mode).
  await expect(page.getByText("Record episode 1")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /^start/i })).toBeVisible({ timeout: 10_000 });
});

test("lifecycle actions sit behind ⋯; Edit and Add task stay visible (desktop)", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);

  const projectName = uniqueName("Overflow menu project");
  await createProject(page, projectName);
  await page.goto("/do/projects");
  await page.getByText(projectName).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 });

  // Desktop tray: Add task + Edit visible, no inline lifecycle buttons.
  await expect(page.getByRole("button", { name: /add task/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^delete$/i })).not.toBeVisible();

  // ⋯ opens the menu with the lifecycle actions; Archive confirms.
  await page.getByRole("button", { name: "Project actions" }).click();
  await expect(page.getByRole("menuitem", { name: /^move$/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^archive$/i })).toBeVisible();
  await page.getByRole("menuitem", { name: /^archive$/i }).click();
  await expect(page.getByText(/archive this project/i)).toBeVisible({ timeout: 10_000 });
});

// Case 3 of the webapp spec — the decline flow through S4's /do/tasks page
// ("Mark as won't do" + its confirm live there; the task page's returnTo is
// hard-coded to /do for now, so the spec navigates back to the project itself).
test("declining a project task from its page removes it from the project", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);

  const projectName = uniqueName("Decline flow project");
  const created = await createProject(page, projectName);

  await page.goto("/do/projects");
  await page.getByRole("link", { name: projectName }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /add task/i }).click();
  await page.getByPlaceholder(/what needs doing/i).fill("The episode we cancelled");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText("The episode we cancelled")).toBeVisible({ timeout: 10_000 });

  // Open the task page: row click opens the inline editor, whose "Edit on
  // task page" button is the re-file surface (webapp went via the row editor
  // too).
  await page.getByText("The episode we cancelled").click();
  await page.getByRole("button", { name: /edit on task page/i }).click();
  await expect(page).toHaveURL(/\/do\/tasks\//, { timeout: 10_000 });

  // Decline: × button → confirm. One-way from here (restore in the Logbook).
  await page.getByRole("button", { name: /mark as won't do/i }).click();
  await page.getByRole("button", { name: /^mark won't do$/i }).click();

  // The task page's returnTo is /do — come back to the project and assert the
  // declined task left its surface (WONT_DO is excluded from this page, not
  // re-filed into a horizon group).
  await page.goto(`/do/projects/${created.permalink}`);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("The episode we cancelled")).toHaveCount(0);
  // And the project reads as empty again.
  await expect(page.getByText("No tasks yet.")).toBeVisible({ timeout: 10_000 });
});
