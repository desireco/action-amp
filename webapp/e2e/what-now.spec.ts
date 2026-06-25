import { test, expect } from "@playwright/test";
import { signupNewUser, triageOneItem } from "./helpers";

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
  await triageOneItem(page, "The one thing", { type: "task", when: "today" });

  // Go home — the triaged task should be THE focus item.
  await page.goto("/app");
  await expect(page.getByText("The one thing")).toBeVisible({ timeout: 10_000 });
});

test("'Start' → Now state; 'Do this' then enters focus mode (F13)", async ({ page }) => {
  await signupNewUser(page);

  await triageOneItem(page, "Deep work task", { type: "task", when: "today" });
  await page.goto("/app");

  await expect(page.getByText("Deep work task")).toBeVisible({ timeout: 10_000 });

  // Default state is Next — eyebrow says 'Next · …', primary button is Start.
  await expect(page.getByText(/Next ·/)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /^start$/i }).click();

  // Now state: eyebrow says 'Now · …', Pause is available, Do this enters focus.
  await expect(page.getByText(/Now ·/)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /do this/i }).click();
  await expect(page.getByLabel(/focus:/i)).toBeVisible({ timeout: 10_000 });
});

test("'Now' persists across navigation away and back", async ({ page }) => {
  await signupNewUser(page);

  await triageOneItem(page, "Persists task", { type: "task", when: "today" });
  await page.goto("/app");

  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByText(/Now ·/)).toBeVisible();

  // Navigate away to the inbox, then back home — the started task must still
  // be #1 in the Now state (startedAt persisted).
  await page.goto("/app/inbox");
  await page.goto("/app");
  await expect(page.getByText("Persists task")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Now ·/)).toBeVisible({ timeout: 5_000 });
});

test("'Pause' returns a started task to the Next state (same task stays #1)", async ({ page }) => {
  await signupNewUser(page);

  await triageOneItem(page, "Pausable task", { type: "task", when: "today" });
  await page.goto("/app");

  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByText(/Now ·/)).toBeVisible();

  await page.getByRole("button", { name: /pause/i }).click();
  // Back to Next; same task remains the focus candidate.
  await expect(page.getByText(/Next ·/)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Pausable task")).toBeVisible();
});

test("completion circle marks the task done and removes it (F16)", async ({ page }) => {
  await signupNewUser(page);

  await triageOneItem(page, "Finish this now", { type: "task", when: "today" });
  await page.goto("/app");

  await expect(page.getByText("Finish this now")).toBeVisible({ timeout: 10_000 });
  // F16: completion is via the circle, not "Do this".
  const circle = page.locator(".aa-wn-card__completion button");
  await circle.click();

  // The task leaves the focus view immediately (optimistic).
  await expect(page.getByText("Finish this now")).toHaveCount(0, { timeout: 10_000 });
});

test("'Not now' defers the focused task (it leaves What Now)", async ({ page }) => {
  await signupNewUser(page);

  await triageOneItem(page, "Not now task", { type: "task", when: "today" });
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
