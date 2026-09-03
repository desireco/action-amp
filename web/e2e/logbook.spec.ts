import { test, expect, type Page } from "@playwright/test";
import { DEV_EMAIL, apiPost, loginAs, activeLensId } from "./helpers";

/**
 * Logbook — /do/logbook (S8 port of webapp/e2e/logbook.spec.ts).
 *
 * Guards the wont-do lifecycle end-to-end: declining a task from its detail
 * page must surface it in the Logbook (getLogbook once queried Task on a
 * non-existent archivedAt column and 500'd, so the declined task was visible
 * nowhere), and Restore must return it to Upcoming — the safe default horizon,
 * never straight onto Today.
 *
 * Adaptations for the new stack (behavior identical):
 * - signupNewUser → the API dev login (seeded dev user, Me lens + PRO grant);
 * - webapp's triageOneItem → direct capture + triage via /rpc (capture is the
 *   ⌘K popover; the API path is the same surface the wizard drives);
 * - the Logbook load is awaited on /rpc/logbook/data (the webapp waited on
 *   /operations/get-logbook) — the same "getLogbook answered, not a 500"
 *   regression;
 * - declining navigates to /do (the new detail page's returnTo) instead of
 *   back to /do/upcoming — the "gone from the bench" check navigates there.
 */

interface InboxItemDto {
  id: string;
}

async function createUpcomingTask(page: Page, text: string): Promise<void> {
  const capture = await apiPost<InboxItemDto>(page, "/rpc/inbox/create", {
    text,
  });
  // The shell's entitlement-aware active lens (AppShell parity): the dev
  // fixture user is PRO, so the UI opens on the seeded default (Work), not
  // the included lens.
  const lensId = await activeLensId(page);
  const result = await apiPost<{ kind: string }>(page, "/rpc/inbox/triage", {
    inboxItemId: capture.id,
    decision: "upcoming",
    lensId,
  });
  expect(result.kind).toBe("task");
}

test("declining a task surfaces it in the Logbook; Restore returns it to Upcoming", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  const title = `Wont do roundtrip ${Date.now()}`;
  await createUpcomingTask(page, title);

  // Open the task from the Upcoming bench and decline it (row → Edit → × →
  // confirm).
  await page.goto("/do/upcoming");
  const row = page.locator(".aa-task-row", { hasText: title });
  await row.first().waitFor({ state: "visible", timeout: 10_000 });
  await row.click();
  await row.getByRole("link", { name: `Edit ${title}` }).click();
  await expect(page).toHaveURL(/\/do\/tasks\//, { timeout: 10_000 });

  await page.getByRole("button", { name: "Mark as won't do" }).click();
  await page.getByRole("button", { name: "Mark won't do" }).click();

  // Declining drops the task from the active surface — the detail page
  // returns to /do, and the bench no longer lists it.
  await expect(page).toHaveURL(/\/do\/?$/, { timeout: 10_000 });
  await page.goto("/do/upcoming");
  await expect(page.getByText(title)).toHaveCount(0, { timeout: 10_000 });

  // The Logbook loads (getLogbook answered, not a 500) and lists the decline.
  const logbookRes = page.waitForResponse((r) =>
    r.url().includes("/rpc/logbook/data"),
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
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });
});
