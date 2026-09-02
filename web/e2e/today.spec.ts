import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers";

/**
 * Today spec — S4 port of webapp/e2e/today.spec.ts.
 *
 * Data: seeded by `api/src/seed-s4.ts` (run it before the suite):
 *   cd api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-s4.ts
 * `s4-today@test.local` carries "Focus task 1..6" + "Swap me around", all
 * committed to Today (the seed replaces the webapp suite's triage helper —
 * capture/triage belong to S2/S3).
 *
 * Spec drift (P0 notes): the old "Move to Upcoming"/confirm-dialog and the
 * per-row "Today" button predate the chips-only row editor reshape
 * (2026-08-31) — demote/promote is now the **When chip** in the expanded row
 * drawer. The behaviors ported here are the same Today ↔ Upcoming round-trip.
 */
const EMAIL = "s4-today@test.local";

test.describe("Today", () => {
  test("F12: Today is capped at 5 — a 6th item is flagged as over-capacity", async ({
    page,
  }) => {
    await loginAs(page, EMAIL);
    await page.goto("/do/today");

    // The hero counts the total, so over-capacity reads "7 of 5 committed".
    await expect(page.getByRole("heading", { name: /of 5 committed/ })).toBeVisible();
    await expect(page.getByText("Over capacity")).toBeVisible();
    await expect(page.locator('[aria-label^="Beyond the cap"]')).toBeVisible();
  });

  test("the When chip demotes to Upcoming; Upcoming's When chip promotes back", async ({
    page,
  }) => {
    await loginAs(page, EMAIL);

    // Demote: expand the row drawer, open the When chip, pick Upcoming.
    // (The capped rows host the row editor; overflow rows carry only "Do".)
    await page.goto("/do/today");
    const row = page.locator(".aa-task-row", { hasText: "Focus task 1" }).first();
    await expect(row).toBeVisible();
    await row.click();
    await page.getByRole("button", { name: /^status: Today$/i }).click();
    await page.getByRole("button", { name: /^Upcoming/ }).click();

    // Demoted → gone from Today…
    await expect(page.getByText("Focus task 1")).toHaveCount(0);

    // …on the bench…
    await page.goto("/do/upcoming");
    await expect(page.getByText("Focus task 1")).toBeVisible();

    // …promote back via the same When chip.
    const benchRow = page.locator(".aa-task-row", { hasText: "Focus task 1" }).first();
    await benchRow.click();
    await page.getByRole("button", { name: /^status: Upcoming$/i }).click();
    await page.getByRole("button", { name: /^Today/ }).click();

    // Back on Today.
    await page.goto("/do/today");
    await expect(page.getByText("Focus task 1")).toBeVisible();
  });
});
