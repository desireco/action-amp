import { expect, test } from "@playwright/test";
import { signupNewUser } from "./helpers";

test("admin Users route preserves filter and sort URL state", async ({ page }) => {
  await signupNewUser(page, { admin: true });
  await page.goto("/app/admin/users?sort=last_login_desc&access=friend");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByLabel("Sort")).toHaveValue("last_login_desc");
  await expect(page.getByLabel("Access")).toHaveValue("friend");
});

test("non-admin cannot use the Users directory", async ({ page }) => {
  await signupNewUser(page);
  await page.goto("/app/admin/users");
  await expect(page.getByText(/admin access required|don't have access/i)).toBeVisible();
});
