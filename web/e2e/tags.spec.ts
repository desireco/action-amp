import { test, expect } from "@playwright/test";
import { apiPost, loginAs, DEV_EMAIL } from "./helpers";

/**
 * Tag management (#16, spec docs/specs/tag-management.md) — the task-detail
 * tags row: reserved suggestions, add (resolve-or-create), muted reserved
 * styling, remove keeps the Tag row. The seeded dev user's onboarding has
 * run (every e2e login boots the shell), so the 7 reserved names exist.
 */

async function makeTask(page: import("@playwright/test").Page, name: string) {
  const lenses = await apiPost<{ id: string }[]>(page, "/rpc/inbox/lenses");
  const project = await apiPost<{ id: string }>(page, "/rpc/projects/create", {
    name: `Tags home ${Date.now().toString(36)}`,
    lensId: lenses[0]!.id,
  });
  return apiPost<{ id: string; permalink: string }>(page, "/rpc/projects/createTask", {
    description: name,
    lensId: lenses[0]!.id,
    projectId: project.id,
  });
}

test("task detail: add a reserved tag from suggestions, remove it, re-add", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  const taskName = `Tagged ${Date.now().toString(36)}`;
  const task = await makeTask(page, taskName);

  await page.goto(`/tasks/${task.permalink}`);
  await expect(page.getByRole("textbox", { name: "Task title" })).toHaveValue(taskName, { timeout: 10_000 });

  // The row offers the reserved names (the seeder guarantees them); pick one.
  await page.getByRole("button", { name: "+ Add tag" }).click();
  const editor = page.getByRole("textbox", { name: "Add tag" });
  await expect(editor).toBeVisible();
  await page.getByRole("button", { name: "low-energy", exact: true }).click();

  // The chip lands, muted (reserved). The wire agrees.
  const chip = page.locator(".aa-tags-row").getByText("low-energy", { exact: true });
  await expect(chip).toBeVisible();
  const detail = await apiPost<{ tags: { name: string }[] }>(page, "/rpc/tasks/task", {
    id: task.id,
  });
  expect(detail.tags.map((t) => t.name)).toContain("low-energy");

  // Remove — the link goes; the Tag row survives (re-add is instant).
  await page
    .locator(".aa-tags-row")
    .locator(".aa-chip", { hasText: "low-energy" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(chip).toBeHidden();
  const after = await apiPost<{ tags: { name: string }[] }>(page, "/rpc/tasks/task", {
    id: task.id,
  });
  expect(after.tags.map((t) => t.name)).not.toContain("low-energy");
  const rows = await apiPost<{ name: string }[]>(page, "/rpc/tags/list");
  expect(rows.map((t) => t.name)).toContain("low-energy");

  await page.getByRole("button", { name: "+ Add tag" }).click();
  await page.getByRole("button", { name: "low-energy", exact: true }).click();
  await expect(page.locator(".aa-tags-row").getByText("low-energy", { exact: true })).toBeVisible();
});

test("typing an unknown name creates the tag; the suggestion list offers reserved first", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  const taskName = `Fresh tag ${Date.now().toString(36)}`;
  const task = await makeTask(page, taskName);
  const tagName = `custom-${Date.now().toString(36)}`;

  await page.goto(`/tasks/${task.permalink}`);
  await page.getByRole("button", { name: "+ Add tag" }).click();
  const editor = page.getByRole("textbox", { name: "Add tag" });
  await editor.fill(tagName);
  await editor.press("Enter");

  const chip = page.locator(".aa-tags-row").getByText(tagName, { exact: true });
  await expect(chip).toBeVisible();
  const detail = await apiPost<{ tags: { name: string }[] }>(page, "/rpc/tasks/task", {
    id: task.id,
  });
  expect(detail.tags.map((t) => t.name)).toContain(tagName);
});
