import { test, expect } from "@playwright/test";
import { signupNewUser, triageOneItem, completeTopTask } from "./helpers";

// The reported double-tap came from the mobile path. Keep this entire chooser
// suite touch-sized so Start must reach focus without an intermediate card.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/**
 * Next — FEATURES.md §3 F8/F10: the home screen is a chooser, not a list.
 *
 * Keep: the three cross-layer state-machine transitions — (1) an Upcoming task
 * with no due date surfaces on home (bench is in the candidate pool, per
 * WORKFLOW.md §5.2), (2) Start → focus in one action (F13 Now/Next state), (3)
 * complete-in-focus removes the task from Next (F16). Dropped: empty-state,
 * "a Today task appears", "Now persists", Pause, "Not now" — trivial variants
 * or component-testable, and the core transitions cover the state machine.
 */

test("an Upcoming task (no due date) also surfaces on home", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  // Triage to Upcoming (the default since 2026-06-25) — no When chosen, so it
  // lands on the bench with no scheduledDate. Next's candidate pool is Today +
  // Upcoming-with-no-future-due, so a triaged task must be actionable, not
  // hidden behind the Today toggle (WORKFLOW.md §5.2).
  await triageOneItem(page, "Bench task", { type: "task" });

  await page.goto("/do");
  await expect(page.getByText("Bench task")).toBeVisible({ timeout: 10_000 });
});

test("'Start' enters focus mode in one action (F13)", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  await triageOneItem(page, "Deep work task", { type: "task", when: "today" });
  await page.goto("/do");

  await expect(page.getByText("Deep work task")).toBeVisible({ timeout: 10_000 });

  // Default state is Next — one Start action records Now and enters focus.
  await expect(page.getByText(/Next in/)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /^start$/i }).click();
  await page.waitForURL(/\/do\/focus$/, { timeout: 10_000 });
  await expect(page.getByLabel(/focus:/i)).toBeVisible({ timeout: 10_000 });
});

test("completing a task in focus mode removes it from Next (F16)", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task (now visible on home under the Me default) so
  // the triaged task below is the single focus item, not the seed.
  await completeTopTask(page);

  await triageOneItem(page, "Finish this now", { type: "task", when: "today" });
  await page.goto("/do");

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
