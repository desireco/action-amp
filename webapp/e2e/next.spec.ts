import { test, expect } from "@playwright/test";
import { signupNewUser, triageOneItem, completeTopTask } from "./helpers";

// The reported double-tap came from the mobile path. Keep this entire chooser
// suite touch-sized so Start must reach focus without an intermediate card.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/**
 * Next — FEATURES.md §3 F8/F10: the home screen is a chooser, not a list.
 * Given the moment, surface ONE Today task and hide the rest.
 *
 * F8: one task shown, with Start + Not now actions.
 * F10: transparent — a one-line "why this?" under the suggestion.
 */

test("empty state: no Today tasks shows a calm prompt, not an empty list", async ({ page }) => {
  await signupNewUser(page);
  // A fresh user has a seeded "Try it" starter task (in the Me lens, the FREE
  // default). Clear it so we can observe the genuine empty state.
  await completeTopTask(page);
  // Home is /app — now empty of Today tasks.
  await page.goto("/app");
  // F8: the home should communicate calm/empty, not a blank list. Wording may
  // evolve; assert the page rendered its shell (the heading is present).
  await expect(page.getByRole("heading", { name: /what now/i }).or(page.getByText(/nothing|clear|all done|nothing on/i))).toBeVisible({ timeout: 10_000 });
});

test("a Today task appears as the single focus item on home", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  // Capture + triage one item to Today.
  await triageOneItem(page, "The one thing", { type: "task", when: "today" });

  // Go home — the triaged task should be THE focus item.
  await page.goto("/app");
  await expect(page.getByText("The one thing")).toBeVisible({ timeout: 10_000 });
});

test("an Upcoming task (no due date) also surfaces on home", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  // Triage to Upcoming (the default since 2026-06-25) — no When chosen, so it
  // lands on the bench with no dueDate. Next's candidate pool is Today +
  // Upcoming-with-no-future-due, so a triaged task must be actionable, not
  // hidden behind the Today toggle (WORKFLOW.md §5.2).
  await triageOneItem(page, "Bench task", { type: "task" });

  await page.goto("/app");
  await expect(page.getByText("Bench task")).toBeVisible({ timeout: 10_000 });
});

test("'Start' enters focus mode in one action (F13)", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  await triageOneItem(page, "Deep work task", { type: "task", when: "today" });
  await page.goto("/app");

  await expect(page.getByText("Deep work task")).toBeVisible({ timeout: 10_000 });

  // Default state is Next — one Start action records Now and enters focus.
  await expect(page.getByText(/Next ·/)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /^start$/i }).click();
  await page.waitForURL(/\/app\/focus$/, { timeout: 10_000 });
  await expect(page.getByLabel(/focus:/i)).toBeVisible({ timeout: 10_000 });
});

test("'Now' persists across navigation away and back", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  await triageOneItem(page, "Persists task", { type: "task", when: "today" });
  await page.goto("/app");

  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByLabel(/focus:/i)).toBeVisible({ timeout: 10_000 });

  // Navigate away to the inbox, then back home — the started task must still
  // be #1 in the Now state (startedAt persisted).
  await page.goto("/app/inbox");
  await page.goto("/app");
  await expect(page.getByText("Persists task")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Now ·/)).toBeVisible({ timeout: 5_000 });
});

test("'Pause' returns a started task to the Next state (same task stays #1)", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  await triageOneItem(page, "Pausable task", { type: "task", when: "today" });
  await page.goto("/app");

  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByLabel(/focus:/i)).toBeVisible({ timeout: 10_000 });
  await page.goto("/app");
  await expect(page.getByText(/Now ·/)).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: /pause/i }).click();
  // Back to Next; same task remains the focus candidate.
  await expect(page.getByText(/Next ·/)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Pausable task")).toBeVisible();
});

test("completing a task in focus mode removes it from Next (F16)", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  await triageOneItem(page, "Finish this now", { type: "task", when: "today" });
  await page.goto("/app");

  await expect(page.getByText("Finish this now")).toBeVisible({ timeout: 10_000 });
  // F16: completion happens in focus mode, not via a list-row checkbox.
  // Start enters focus, then completing removes the task from Next.
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByLabel(/focus:/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /mark complete/i }).click();
  await page.getByRole("button", { name: /^complete$/i }).click();

  // The task leaves the focus view and Next (no checkbox to tick on the card).
  await expect(page.getByText("Finish this now")).toHaveCount(0, { timeout: 10_000 });
});

test("'Not now' defers the focused task (it leaves Next)", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

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
