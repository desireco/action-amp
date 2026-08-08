import { expect, test } from "@playwright/test";
import { openCapture, signupNewUser, triageOneItem } from "./helpers";

test("active-paid command search reaches a Task permalink", async ({
  page,
}) => {
  await signupNewUser(page, { admin: true });
  const title = `Vendor renewal ${Date.now()}`;
  await triageOneItem(page, title, { type: "task", when: "today" });

  await page.goto("/app");
  await page.locator("body").click();
  await page.keyboard.press("Meta+\\");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();

  const searchResponse = page.waitForResponse((response) =>
    response.url().includes("/operations/search-site"),
  );
  await dialog.getByRole("combobox", { name: "Search ActionAmp" }).fill(title);
  expect((await searchResponse).ok()).toBeTruthy();
  await dialog.getByRole("option", { name: new RegExp(title, "i") }).click();

  await expect(page).toHaveURL(/\/app\/tasks\//);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test("active-paid slash search reaches the exact Inbox item", async ({
  page,
}) => {
  await signupNewUser(page, { admin: true });
  const title = `Inbox search target ${Date.now()}`;
  const capture = await openCapture(page);
  await capture.fill(title);
  await capture.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox");
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.locator("body").click();
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Search ActionAmp" });
  await expect(dialog).toBeVisible();

  const searchResponse = page.waitForResponse((response) =>
    response.url().includes("/operations/search-site"),
  );
  await dialog.getByRole("combobox", { name: "Search ActionAmp" }).fill(title);
  expect((await searchResponse).ok()).toBeTruthy();
  await dialog.getByRole("option", { name: new RegExp(title, "i") }).click();

  await expect(page).toHaveURL(/\/app\/inbox\?item=/);
  await expect(
    page.locator(".aa-inbox__item.is-search-target", { hasText: title }),
  ).toBeVisible();
});

test("Free invocation shows the calm shared Pro gate", async ({ page }) => {
  await signupNewUser(page);
  await page.locator("body").click();
  await page.keyboard.press("Meta+\\");

  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toContainText(
    "Command palette and search is a Pro feature.",
  );
  await expect(dialog).toContainText(
    "find and move through all your ActionAmp work from one place",
  );
});

test("Command stays suppressed while Working and Capture keeps Cmd+K", async ({
  page,
}) => {
  await signupNewUser(page, { admin: true });
  const title = `Focused search guard ${Date.now()}`;
  await triageOneItem(page, title, { type: "task", when: "today" });
  await page.goto("/app");
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
