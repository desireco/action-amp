import { expect, test, type Page } from "@playwright/test";
import { apiPost, loginAs, DEV_EMAIL } from "./helpers";

/**
 * Search + command palette spec — S9 port of webapp/e2e/search.spec.ts
 * (the P0 e2e inventory: packages/contract/src/s9-search-resources/README.md
 * §6 — the same 4 behaviors).
 *
 * Adaptations for the new stack (behavior identical, setup re-authed):
 * - webapp's `signupNewUser({ admin: true })` → `loginAs(DEV_EMAIL)`: the
 *   seeded dev user carries a PRO manual grant, which is exactly the
 *   whole-account entitlement the sitewide-search guard admits (admins were
 *   only ever the bypass shortcut for "an entitled account").
 * - webapp's `signupNewUser()` (Free) → `loginAs` a FRESH unique email: the
 *   dev login route creates the user FREE with no grant, so the calm gate
 *   shows.
 * - webapp's `triageOneItem` → direct RPC setup (`/rpc/projects/create` +
 *   `/rpc/projects/createTask` + `/rpc/projects/setTaskStatus`) — triage is
 *   S2/S3's surface and its endpoint path reaches the same Today state.
 * - the response wait targets `/rpc/search/site` (was
 *   `/operations/search-site`);
 * - webapp's `/do` home is this stack's `/` (routes/do/+page.svelte has not
 *   composed yet — S1 hosts WhatNow at the root), and an OPEN task renders
 *   its title in the "Task title" input on the task page (the readonly h1 is
 *   for done tasks), so the destination assertion reads the input's value.
 */

async function createTodayTask(page: Page, description: string) {
  const project = await apiPost<{ id: string }>(page, "/rpc/projects/create", {
    name: `Search harness ${Date.now()}`,
  });
  const task = await apiPost<{ id: string; permalink: string }>(
    page,
    "/rpc/projects/createTask",
    { description, projectId: project.id },
  );
  await apiPost(page, "/rpc/projects/setTaskStatus", {
    id: task.id,
    status: "TODAY",
  });
  return task;
}

test("active-paid command search reaches a Task permalink", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);
  const title = `Vendor renewal ${Date.now()}`;
  await createTodayTask(page, title);

  await page.goto("/");
  await page.locator("body").click();
  await page.keyboard.press("Meta+\\");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();

  const searchResponse = page.waitForResponse((response) =>
    response.url().includes("/rpc/search/site"),
  );
  await dialog.getByRole("combobox", { name: "Search ActionAmp" }).fill(title);
  expect((await searchResponse).ok()).toBeTruthy();
  await dialog.getByRole("option", { name: new RegExp(title, "i") }).click();

  await expect(page).toHaveURL(/\/do\/tasks\//);
  await expect(page.getByLabel("Task title")).toHaveValue(title);
});

test("active-paid slash search reaches the exact Inbox item", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);
  const title = `Inbox search target ${Date.now()}`;
  await apiPost(page, "/rpc/inbox/create", {
    text: title,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  await page.goto("/do/inbox");
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.locator("body").click();
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Search ActionAmp" });
  await expect(dialog).toBeVisible();

  const searchResponse = page.waitForResponse((response) =>
    response.url().includes("/rpc/search/site"),
  );
  await dialog.getByRole("combobox", { name: "Search ActionAmp" }).fill(title);
  expect((await searchResponse).ok()).toBeTruthy();
  await dialog.getByRole("option", { name: new RegExp(title, "i") }).click();

  await expect(page).toHaveURL(/\/do\/inbox\?item=/);
  await expect(
    page.locator(".aa-inbox__item.is-search-target", { hasText: title }),
  ).toBeVisible();
});

test("Free invocation shows the calm shared Pro gate", async ({ page }) => {
  await loginAs(page, `s9-free-${Date.now()}@test.local`);
  await page.goto("/");
  await page.locator("body").click();
  await page.keyboard.press("Meta+\\");

  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toContainText("Command palette and search is a Pro feature.");
  await expect(dialog).toContainText(
    "find and move through all your ActionAmp work from one place",
  );
});

test("Command stays suppressed while Working and Capture keeps Cmd+K", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  const title = `Focused search guard ${Date.now()}`;
  await createTodayTask(page, title);
  await page.goto("/");
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByLabel(/focus:/i)).toBeVisible();

  await page.keyboard.press("Meta+\\");
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toHaveCount(0);

  await page.keyboard.press("Meta+K");
  await expect(
    page.getByRole("dialog", { name: /quick capture/i }),
  ).toBeVisible();
});

// S9 addition — the Resources section on the project page (the surface S5
// deferred; not part of the webapp spec's 4-test inventory but this slice's
// only visible UI, so it gets the same end-to-end treatment).
test("resources section creates, edits anchor, and removes a resource", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  const project = await apiPost<{ id: string; permalink: string }>(
    page,
    "/rpc/projects/create",
    { name: `Resource host ${Date.now()}` },
  );

  await page.goto(`/do/projects/${project.permalink}`);
  await expect(
    page.getByRole("heading", { name: "Resources" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Nothing saved here yet.")).toBeVisible();

  // Create through the sheet.
  await page.getByRole("button", { name: "Add resource" }).click();
  const sheet = page.getByRole("dialog", { name: "Add resource" });
  await sheet.getByPlaceholder("What is this?").fill("Spec handbook");
  await sheet.getByPlaceholder("https://…").fill("https://example.com/spec");
  await sheet.getByPlaceholder("Why keep this?").fill("Chapter 3 has the tokens");
  await sheet.getByRole("button", { name: "Save resource" }).click();
  const row = page.locator(".aa-project__resource", { hasText: "Spec handbook" });
  await expect(row).toBeVisible({ timeout: 10_000 });

  // Edit through the same sheet.
  await row.getByRole("button", { name: "Edit" }).click();
  const editSheet = page.getByRole("dialog", { name: "Edit resource" });
  await editSheet.getByPlaceholder("What is this?").fill("Spec handbook v2");
  await editSheet.getByRole("button", { name: "Save resource" }).click();
  await expect(
    page.locator(".aa-project__resource", { hasText: "Spec handbook v2" }),
  ).toBeVisible({ timeout: 10_000 });

  // The search anchor: /do/projects/<permalink>#resource-<id> highlights the
  // row (the resource result's href lands here from the palette).
  const rowId = await page
    .locator(".aa-project__resource", { hasText: "Spec handbook v2" })
    .getAttribute("id");
  await page.goto(`/do/projects/${project.permalink}#resource-${rowId?.replace(/^resource-/, "")}`);
  await expect(page.locator(".aa-project__resource.is-search-target")).toHaveCount(1);

  // Remove through the confirm.
  await page
    .locator(".aa-project__resource", { hasText: "Spec handbook v2" })
    .getByRole("button", { name: "Remove" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Remove this resource?" });
  await expect(confirm).toContainText("Tasks and their Context links stay unchanged.");
  await confirm.getByRole("button", { name: "Remove resource" }).click();
  await expect(page.getByText("Nothing saved here yet.")).toBeVisible({ timeout: 10_000 });
});
