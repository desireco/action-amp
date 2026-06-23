import { test, expect } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

/**
 * Projects — FEATURES.md §2 + DATA-MODEL.md: Projects are multi-step outcomes
 * (live under a Goal). Created via triage or inline.
 *
 * Encodes the spec. A failure is a real gap.
 */

test("empty Projects shows a calm empty state", async ({ page }) => {
  await signupNewUser(page);
  await page.goto("/app/projects");
  await expect(page.getByText(/nothing|no projects|empty/i)).toBeVisible({ timeout: 10_000 });
});

test("triaging an item as a Project creates it in the Projects list", async ({ page }) => {
  await signupNewUser(page);

  const textarea = await openCapture(page);
  await textarea.fill("Ship Q3 launch");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");

  await page.goto("/app/inbox/review");
  await page.getByRole("button", { name: /project/i }).first().click();

  await page.goto("/app/projects");
  await expect(page.getByText("Ship Q3 launch")).toBeVisible({ timeout: 10_000 });
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
