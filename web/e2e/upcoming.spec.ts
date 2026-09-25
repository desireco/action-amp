import { test, expect } from "@playwright/test";
import { apiPost, loginAs, DEV_EMAIL } from "./helpers";

/**
 * Upcoming is the universal bench (#10, WORKFLOW.md §2.4/§5.1 revised
 * 2026-09-24): every accessible lens's UPCOMING tasks in one surface, lens
 * pills on rows, an All / per-lens filter. The seeded dev user is PRO with
 * two lenses, so cross-lens rows and the filter both render.
 */

test("the bench spans lenses; the filter narrows by context", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);

  const lenses = await apiPost<{ id: string; name: string }[]>(
    page,
    "/rpc/inbox/lenses",
  );
  expect(lenses.length).toBeGreaterThanOrEqual(2);

  // One bench task per lens, unique per run.
  const suffix = Date.now().toString(36);
  const names = new Map<string, string>();
  for (const lens of lenses.slice(0, 2)) {
    const projectName = `Bench source ${lens.name} ${suffix}`;
    const project = await apiPost<{ id: string; permalink: string }>(
      page,
      "/rpc/projects/create",
      { name: projectName, lensId: lens.id },
    );
    const taskName = `Bench task ${lens.name} ${suffix}`;
    await apiPost(page, "/rpc/projects/createTask", {
      description: taskName,
      lensId: lens.id,
      projectId: project.id,
    });
    names.set(lens.id, taskName);
  }
  const [lensA, lensB] = lenses.slice(0, 2);
  const taskA = names.get(lensA.id)!;
  const taskB = names.get(lensB.id)!;

  await page.goto("/upcoming");

  // GLOBAL: both lenses' bench tasks visible at once, each with its pill.
  await expect(page.getByText(taskA)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(taskB)).toBeVisible();
  await expect(page.locator(".aa-task-row__lens").first()).toBeVisible();

  // The filter offers All + each lens with work on the bench.
  const filter = page.getByRole("radiogroup", { name: "Filter by lens" });
  await expect(filter).toBeVisible();
  await expect(filter.getByRole("radio", { name: /^All/ })).toBeVisible();
  await expect(filter.getByRole("radio", { name: new RegExp(lensA.name) })).toBeVisible();
  await expect(filter.getByRole("radio", { name: new RegExp(lensB.name) })).toBeVisible();

  // Narrow to one lens: the other's task leaves the view (All stays put).
  await filter.getByRole("radio", { name: new RegExp(lensA.name) }).click();
  await expect(page.getByText(taskA)).toBeVisible();
  await expect(page.getByText(taskB)).toHaveCount(0);

  // Back to All.
  await filter.getByRole("radio", { name: /All/ }).click();
  await expect(page.getByText(taskB)).toBeVisible();
});
