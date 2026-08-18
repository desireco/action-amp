import { test, expect, type Page } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

/**
 * Simple-list Projects — checklists that live on the Projects page
 * (docs/specs/simple-list-projects.md). A Simple-list Project contains List
 * Items and nothing else: no goal, no tasks, no completion lifecycle, and
 * no participation in Today, Review, or the Logbook.
 *
 * Cross-layer invariants only: create via the Projects page (type choice),
 * open the checklist at the project URL, add/check/clear items, and file a
 * captured thought into the list through triage's one-step list-item flow.
 */

async function createListProject(page: Page, name: string) {
  await page.goto("/do/projects");
  await page.getByRole("button", { name: /new project/i }).click();
  const composer = page.locator(".aa-record-composer");
  await composer.getByLabel(/^project$/i).fill(name);
  await composer.getByRole("radio", { name: /simple list/i }).click();
  await composer.getByRole("button", { name: /create project/i }).click();
  await page.getByRole("link", { name }).waitFor({ state: "visible", timeout: 10_000 });
}

test("a Simple-list Project is created, opened, and checked off in place", async ({ page }) => {
  await signupNewUser(page);
  await createListProject(page, "Packing");

  // The row is marked as a list; opening it renders the checklist (not the
  // task sections) at the project URL.
  await page.getByRole("link", { name: "Packing" }).click();
  await expect(page).toHaveURL(/\/do\/projects\/packing/);
  await expect(page.getByText("List", { exact: true })).toBeVisible();

  // Direct add — no capture parsing, no scheduling, no priority.
  const add = page.getByLabel("Add an item");
  await add.fill("Passport");
  await add.press("Enter");
  await expect(page.getByRole("checkbox", { name: /check passport/i })).toBeVisible({ timeout: 10_000 });

  // Checking records completion; the checked group collects it and
  // Clear checked removes it for good.
  await page.getByRole("checkbox", { name: /check passport/i }).click();
  await expect(page.getByRole("checkbox", { name: /reopen passport/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /clear checked/i }).click();
  await page.getByRole("button", { name: /^clear checked$/i }).click();
  await expect(page.getByText("List clear.")).toBeVisible({ timeout: 10_000 });
});

test("triage files a captured thought into a Simple list in one step", async ({ page }) => {
  await signupNewUser(page);
  await createListProject(page, "Groceries");

  // Capture → triage. Choosing List item swaps the lens pills for the
  // list-project picker; the commit is one step (no Spec).
  const textarea = await openCapture(page);
  await textarea.fill("Oat milk");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/do/inbox/review");
  await expect(page.getByText("Oat milk")).toBeVisible({ timeout: 10_000 });

  await page.locator(".aa-triage-types button").filter({ hasText: /^List item/ }).click();
  await page.getByRole("combobox", { name: /add to list/i }).selectOption({ label: "Groceries" });
  await page.getByRole("button", { name: /add to groceries/i }).click();
  await expect(page.getByText("Oat milk")).toHaveCount(0, { timeout: 10_000 });

  // The item landed in the list.
  await page.goto("/do/projects/groceries");
  await expect(page.getByRole("checkbox", { name: /check oat milk/i })).toBeVisible({ timeout: 10_000 });
});
