import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers";

/**
 * Simple-list checklist spec — S4 port of webapp/e2e/simple-lists.spec.ts.
 *
 * Data: seeded by `api/src/seed-s4.ts` (run it before the suite):
 *   cd api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-s4.ts
 * `s4-lists@test.local` carries the SIMPLE_LIST projects "Packing"
 * (/do/projects/packing) and "Groceries".
 *
 * Spec drift (P0 notes): the original test 1 created the project through the
 * /do/projects composer (S5's surface) and test 2 triaged a captured thought
 * into a list (S2/S3's surface). Those two steps port with their own slices;
 * this spec covers the checklist surface itself — add, check/reopen,
 * clear-checked, and the n/j/k/space/e/Delete/Esc keyset — on a seeded list.
 */
const EMAIL = "s4-lists@test.local";

test.describe("Simple lists", () => {
  test("a Simple-list project opens and items check off in place", async ({ page }) => {
    await loginAs(page, EMAIL);
    await page.goto("/do/projects/packing");

    // The project page marks the SIMPLE_LIST context (a "List" badge or a
    // breadcrumb with the project name, per the page host).
    await expect(
      page.getByText("List", { exact: true }).or(page.locator(".aa-crumbs__current", { hasText: "Packing" })),
    ).toBeVisible();

    // Add an item; it appears with a Check checkbox.
    await page.getByLabel("Add an item").fill("Passport");
    await page.keyboard.press("Enter");
    const check = page.getByRole("checkbox", { name: "Check Passport" });
    await expect(check).toBeVisible();

    // Checking off flips the affordance to Reopen.
    await check.click();
    const reopen = page.getByRole("checkbox", { name: "Reopen Passport" });
    await expect(reopen).toBeVisible();

    // Clear checked → confirm → the list reads empty again.
    await page.locator(".aa-simple-list__clear").click();
    const dialog = page.getByRole("dialog", { name: "Clear checked items?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Clear checked" }).click();
    await expect(page.getByText("List clear.")).toBeVisible();
  });

  test("the n/j/k/space/e/Delete/Esc keyset drives the checklist", async ({ page }) => {
    await loginAs(page, EMAIL);
    await page.goto("/do/projects/packing");
    // The checklist loads before keys flow (the keyset is suppressed while
    // the store is saving).
    await page.getByLabel("Add an item").waitFor();

    // N focuses the add input (the typing guard is off — we're on the body).
    await page.keyboard.press("n");
    await page.keyboard.type("Oat milk");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("checkbox", { name: "Check Oat milk" })).toBeVisible();

    // Add a second item so J/K have somewhere to move.
    await page.getByLabel("Add an item").fill("Toothbrush");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("checkbox", { name: "Check Toothbrush" })).toBeVisible();

    // The add flow refocuses the input after each add (parity) — blur it so
    // the single-key keyset applies again.
    await page.locator(".aa-simple-list__section h2").first().click();

    // J moves the selection down; Space toggles the selected item.
    await page.keyboard.press("j");
    await page.keyboard.press(" ");
    await expect(page.getByRole("checkbox", { name: "Reopen Toothbrush" })).toBeVisible();

    // K moves back up; E renames the selected item in place.
    await page.keyboard.press("k");
    await page.keyboard.press("e");
    const rename = page.getByLabel(/Rename Oat milk/);
    await expect(rename).toBeVisible();
    await rename.fill("Rolled oats");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("checkbox", { name: "Check Rolled oats" }),
    ).toBeVisible();

    // Delete removes the selected (open) item.
    await page.keyboard.press("Delete");
    await expect(page.getByText("Rolled oats")).toHaveCount(0);

    // Esc cancels a rename and deselects (no crash, selection cleared).
    await page.keyboard.press("e");
    await page.keyboard.press("Escape");
    await expect(page.getByText("Toothbrush")).toBeVisible();
  });
});
