import { test, expect } from "@playwright/test";
import { signupNewUser, completeTopTask, openCapture } from "./helpers";

/**
 * Goal planning — the full lifecycle + sequence flow (goal-planning spec §G).
 *
 * Walks the end-to-end Planning surface: create a goal → add a project from
 * inside the goal (auto-linked) → reorder → complete the "next" project → see
 * the "Next:" line advance → complete the goal → it appears in the Logbook →
 * reopen restores it. Encodes the spec requirement, not the implementation.
 *
 * Requires `wasp start` serving on :4000 (see playwright.config.ts). Each test
 * gets a fresh, isolated user via signupNewUser.
 */
test("goal → project sequence → complete → logbook → reopen", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task so /app/goals starts clean.
  await completeTopTask(page);

  // ---- 1. Create a goal from the Goals page ----
  await page.goto("/app/goals");
  await page.getByRole("button", { name: /^new goal$/i }).click();
  await page.getByPlaceholder(/goal name/i).fill("Run a 10k");
  await page.getByRole("button", { name: /^create$/i }).click();
  // The goal name surfaces as a card link, and the page title flips to "1 active".
  await expect(page.getByRole("link", { name: "Run a 10k" })).toBeVisible({
    timeout: 10_000,
  });

  // ---- 2. Open the goal; add TWO projects from inside it (auto-linked) ----
  await page.getByRole("link", { name: "Run a 10k" }).click();
  await expect(page.getByRole("heading", { name: "Run a 10k" })).toBeVisible({
    timeout: 10_000,
  });

  // First project — becomes the initial "next".
  await page.getByRole("button", { name: /^add project$/i }).click();
  await page.getByPlaceholder(/project name/i).fill("Couch to 5k");
  await page.getByRole("button", { name: /^create$/i }).click();
  // The project surfaces in the linked-projects list.
  await expect(page.locator(".aa-goal__projects").getByText("Couch to 5k")).toBeVisible({
    timeout: 10_000,
  });

  // Second project — sits below the first in the sequence.
  await page.getByRole("button", { name: /^add project$/i }).click();
  await page.getByPlaceholder(/project name/i).fill("Bridge to 10k");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.locator(".aa-goal__projects").getByText("Bridge to 10k")).toBeVisible({
    timeout: 10_000,
  });

  // The "Next:" line surfaces the first non-done project (Couch to 5k).
  await expect(page.getByText(/Next:/)).toContainText(/Couch to 5k/);

  // ---- 3. Reorder: move "Bridge to 10k" up so it becomes next ----
  await page.getByRole("button", { name: /move bridge to 10k up/i }).click();
  await expect(page.getByText(/Next:/)).toContainText(/Bridge to 10k/, { timeout: 10_000 });

  // ---- 4. Complete the "next" project; the line advances back to Couch to 5k ----
  // Open the project, complete it from its detail page header.
  await page.getByRole("link", { name: "Bridge to 10k" }).first().click();
  await expect(page.getByRole("heading", { name: "Bridge to 10k" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /^complete$/i }).click();

  // Back to the goal — "Next:" should now read "Couch to 5k" (the remaining
  // non-done project). Completing the next project promotes the next one
  // automatically (spec §E).
  await page.goto("/app/goals");
  await page.getByRole("link", { name: "Run a 10k" }).click();
  await expect(page.getByText(/Next:/)).toContainText(/Couch to 5k/, { timeout: 10_000 });

  // ---- 5. Complete the goal; it leaves the active list ----
  await page.getByRole("button", { name: /^complete$/i }).click();
  await expect(page).toHaveURL(/\/app\/goals/, { timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Run a 10k" })).toHaveCount(0, { timeout: 10_000 });

  // ---- 6. It appears in the Logbook with a Goal chip + Reopen ----
  await page.goto("/app/logbook");
  // The goal row carries the teal "Goal" chip; project rows carry "Project".
  // Filter to the one with the Goal chip so the Reopen targets the goal, not
  // the completed Bridge-to-10k project that's also in the Logbook.
  const goalRow = page
    .locator(".aa-logbook-row")
    .filter({ has: page.locator(".aa-chip--teal", { hasText: "Goal" }) })
    .filter({ hasText: "Run a 10k" });
  await expect(goalRow).toBeVisible({ timeout: 10_000 });

  // ---- 7. Reopen restores it to the active list ----
  // Wait for the action response (mirrors commitTriage in helpers) so the
  // refetch settles before we assert the row is gone.
  const reopenResponse = page
    .waitForResponse((r) => r.url().includes("/operations/set-goal-done"), { timeout: 10_000 })
    .catch(() => null);
  await goalRow.getByRole("button", { name: /^reopen$/i }).click();
  const res = await reopenResponse;
  if (res) expect(res.ok()).toBeTruthy();
  await expect(goalRow).toHaveCount(0, { timeout: 10_000 });

  await page.goto("/app/goals");
  await expect(page.getByRole("link", { name: "Run a 10k" })).toBeVisible({ timeout: 10_000 });
});
