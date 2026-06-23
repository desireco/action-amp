import { test, expect } from "@playwright/test";
import { signupNewUser } from "./helpers";

/**
 * Projects — FEATURES.md §2 + DATA-MODEL.md: Projects are multi-step outcomes
 * (live under a Goal). Created via triage or inline.
 *
 * Encodes the spec. A failure is a real gap.
 */

test("a fresh user has a General project ready for filing", async ({ page }) => {
  // ensureOnboarded seeds a General project per lens — the default P-key target.
  // Projects is therefore never empty for a new user.
  await signupNewUser(page);
  await page.goto("/app/projects");
  await expect(page.getByText("General")).toBeVisible({ timeout: 10_000 });
});

test("a project can be created inline from the Projects page", async ({ page }) => {
  await signupNewUser(page);
  await page.goto("/app/projects");

  // Click the exact button (avoid loose regex matching other controls).
  await page.getByRole("button", { name: "New project" }).click();
  // Wait for the inline form's input (aria-label = placeholder) before filling.
  const input = page.getByLabel(/project name/i);
  await input.waitFor({ state: "visible", timeout: 5_000 });
  await input.fill("Brand refresh");
  await input.press("Enter");

  await expect(page.getByText("Brand refresh")).toBeVisible({ timeout: 10_000 });
});
