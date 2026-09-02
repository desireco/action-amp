import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

/**
 * S17 — the admin workspace spec, ported from webapp/e2e/admin-users.spec.ts
 * (the 3 behaviors the P0 notes pin) + the slice's own additions (overview
 * stats render; grant/revoke roundtrip through the real /rpc/admin surface).
 *
 * Requires the idempotent admin fixtures (run once from apps/api):
 *   DATABASE_URL=postgres://jake@localhost:5432/actionamp_dev bun src/seed-admin.ts
 * The admin fixture user is admin@local.test (isAdmin); dev@local.test is the
 * plain non-admin the other specs use.
 */

const ADMIN_EMAIL = "admin@local.test";

test("admin Users route preserves filter and sort URL state", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);
  await page.goto("/do/admin/users?sort=last_login_desc&access=friend");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByLabel("Sort")).toHaveValue("last_login_desc");
  await expect(page.getByLabel("Access")).toHaveValue("friend");
});

test("non-admin cannot use the Users directory", async ({ page }) => {
  await loginAs(page);
  await page.goto("/do/admin/users");
  await expect(page.getByText(/admin access required|don't have access/i)).toBeVisible();
});

test("admin can select visible users and cancel one bulk-delete confirmation", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);
  await page.goto("/do/admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await page.getByRole("button", { name: "Select visible users" }).click();
  await expect(page.getByText(/selected on this page/)).toBeVisible();
  await page.getByRole("button", { name: "Delete selected" }).click();
  await expect(page.getByRole("dialog", { name: "Delete selected users" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Delete selected users" })).not.toBeVisible();
});

test("admin overview renders live stats tiles", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);
  await page.goto("/do/admin/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  // The stats query answers with real numbers (never NaN) — the tiles flip
  // from the "—" placeholder to a formatted count.
  await expect(page.getByText("Total signups")).toBeVisible();
  await expect(
    page.locator(".aa-admin-tile__num").filter({ hasText: /\d/ }).first(),
  ).toBeVisible({ timeout: 15_000 });
  // The range filter writes back to the URL (URL is the state store).
  await page.getByRole("button", { name: "All time" }).click();
  await expect(page).toHaveURL(/range=all/);
});

test("admin can grant and revoke a manual access grant (roundtrip)", async ({ page }) => {
  await loginAs(page, ADMIN_EMAIL);
  // Unfiltered view: a grant changes the row's access, which would drop it
  // from a filtered view (the refetch applies the same filter).
  await page.goto("/do/admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  // A deletable (non-admin) row: grant Friend → confirm → the row's access
  // column flips to the Admin-grant label; then remove it again. Rows re-sort
  // between steps is not an issue — the row is located by its email each time.
  const grantableRow = page
    .locator(".aa-table tbody tr")
    .filter({ has: page.getByRole("button", { name: "Grant Friend" }) })
    .first();
  await expect(grantableRow).toBeVisible({ timeout: 15_000 });
  const email = (await grantableRow.locator("small").first().textContent()) ?? "";
  expect(email).not.toBe("");

  await grantableRow.getByRole("button", { name: "Grant Friend" }).click();
  await expect(page.getByRole("dialog", { name: "Grant Friend" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("dialog", { name: "Grant Friend" })).not.toBeVisible();

  const grantedRow = page.locator(".aa-table tbody tr").filter({ hasText: email }).first();
  await expect(grantedRow.getByText(/Friend · Admin grant/)).toBeVisible({ timeout: 15_000 });

  await grantedRow.getByRole("button", { name: "Remove grant" }).click();
  await expect(page.getByRole("dialog", { name: "Remove manual grant" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("dialog", { name: "Remove manual grant" })).not.toBeVisible();
  await expect(grantedRow.getByText(/Friend · Admin grant/)).not.toBeVisible({ timeout: 15_000 });
});
