import { test, expect } from "@playwright/test";
import { signupNewUser, triageOneItem } from "./helpers";

/**
 * Logbook — /do/logbook.
 *
 * Guards the wont-do lifecycle end-to-end: declining a task from its detail
 * page must surface it in the Logbook's "Won't do" section (getLogbook once
 * queried Task on a non-existent archivedAt column and 500'd, so the declined
 * task was visible nowhere), and Restore must return it to Upcoming.
 */
test("declining a task surfaces it in the Logbook; Restore returns it to Upcoming", async ({
  page,
}) => {
  await signupNewUser(page);
  const title = `Wont do roundtrip ${Date.now()}`;
  await triageOneItem(page, title, { type: "task" });

  // Open the task from the Upcoming bench and decline it (X → confirm).
  await page.goto("/do/upcoming");
  const row = page.locator(".aa-upcoming__row", { hasText: title });
  await row.locator(".aa-task-row__title").click();
  await row.getByRole("button", { name: /^edit$/i }).click();
  await expect(page).toHaveURL(/\/do\/tasks\//);

  await page.getByRole("button", { name: "Mark as won't do" }).click();
  await page.getByRole("button", { name: "Mark won't do" }).click();

  // Declining drops the task from the active surface — back on the bench
  // (returnTo) it is gone.
  await expect(page).toHaveURL(/\/do\/upcoming/, { timeout: 10_000 });
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 10_000 });

  // The Logbook loads (getLogbook answered, not a 500) and lists the decline.
  const logbookRes = page.waitForResponse((r) =>
    r.url().includes("/operations/get-logbook"),
  );
  await page.goto("/do/logbook");
  expect((await logbookRes).ok()).toBeTruthy();
  const declined = page.locator(".aa-logbook-row", { hasText: title });
  await expect(declined).toBeVisible({ timeout: 10_000 });
  await expect(declined.getByText("Won't do")).toBeVisible();

  // Restore returns the task to active work (Upcoming) and out of the Logbook.
  await declined.getByRole("button", { name: /^restore$/i }).click();
  await expect(page.locator(".aa-logbook-row", { hasText: title })).toHaveCount(
    0,
    { timeout: 10_000 },
  );
  await page.goto("/do/upcoming");
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
});
