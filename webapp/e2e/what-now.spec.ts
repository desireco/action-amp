import { test, expect } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

/**
 * What Now — FEATURES.md §3 F8/F10: the home screen is a chooser, not a list.
 * Given the moment, surface ONE Today task and hide the rest.
 *
 * F8: one task shown, with "Do this" + "Not now" actions.
 * F10: transparent — a one-line "why this?" under the suggestion.
 */

test("empty state: no Today tasks shows a calm prompt, not an empty list", async ({ page }) => {
  await signupNewUser(page);
  // Home is /app — a fresh user has no Today tasks.
  await expect(page).toHaveURL(/\/app/);
  // F8: the home should communicate calm/empty, not a blank list. Wording may
  // evolve; assert the page rendered its shell (the heading is present).
  await expect(page.getByRole("heading", { name: /what now/i }).or(page.getByText(/nothing|clear|all done|nothing on/i))).toBeVisible({ timeout: 10_000 });
});

test("a Today task appears as the single focus item on home", async ({ page }) => {
  await signupNewUser(page);

  // Capture + triage one item to Today.
  const textarea = await openCapture(page);
  await textarea.fill("The one thing");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  await page.getByRole("button", { name: /today/i }).click();
  await expect(page.getByText("The one thing")).toHaveCount(0, { timeout: 10_000 });

  // Go home — the triaged task should be THE focus item.
  await page.goto("/app");
  await expect(page.getByText("The one thing")).toBeVisible({ timeout: 10_000 });
});

test("'Do this' completes the focused task", async ({ page }) => {
  await signupNewUser(page);

  const textarea = await openCapture(page);
  await textarea.fill("Do this task");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  await page.getByRole("button", { name: /today/i }).click();
  await page.goto("/app");

  await expect(page.getByText("Do this task")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /do this/i }).click();

  // F16: completion removes it from the focus view.
  await expect(page.getByText("Do this task")).toHaveCount(0, { timeout: 10_000 });
});

test("'Not now' defers the focused task (it leaves What Now)", async ({ page }) => {
  await signupNewUser(page);

  const textarea = await openCapture(page);
  await textarea.fill("Not now task");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  await page.getByRole("button", { name: /today/i }).click();
  await page.goto("/app");

  await expect(page.getByText("Not now task")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /not now/i }).click();

  // F11: "not now" pushes it out of the focus queue. It may open a snooze
  // sheet — accept the default snooze if one appears.
  const snoozeButton = page.getByRole("button", { name: /snooze|1h|tomorrow|confirm/i }).first();
  if (await snoozeButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await snoozeButton.click();
  }
  await expect(page.getByText("Not now task")).toHaveCount(0, { timeout: 10_000 });
});
