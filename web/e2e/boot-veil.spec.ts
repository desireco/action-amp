import { test, expect } from "@playwright/test";
import { loginAs, DEV_EMAIL } from "./helpers";

/**
 * The boot veil must never wedge (#18): Jake's phone showed the eternal ✓
 * ("nothing is happening — reload fixes it") when the session read failed on
 * cold open. The boot now retries transient /api/auth/me failures and, if
 * the API stays unreachable, shows a Try-again error state instead.
 */

test("a transient session-read failure retries and boots", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);
  let failures = 0;
  await page.route("**/api/auth/me", async (route) => {
    if (failures < 2) {
      failures += 1;
      await route.abort("connectionrefused");
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  // Two aborted reads, then the retry lands — the shell comes up on its own.
  await expect(page.getByText("Checking your session…")).toBeVisible();
  // The home screen has no heading — the shell nav IS the boot marker.
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });
  expect(failures).toBe(2);
});

test("a dead API shows Try again instead of an eternal checkmark", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  await page.route("**/api/auth/me", (route) => route.abort("connectionrefused"));

  await page.goto("/");
  // The veil stays calm through the retries, then names the failure.
  await expect(page.getByText("Couldn't reach ActionAmp.")).toBeVisible({
    timeout: 15_000,
  });
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();

  // The escape hatch works: the API returns and boot completes.
  await page.unroute("**/api/auth/me");
  await retry.click();
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });
});
