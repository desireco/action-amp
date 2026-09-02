import { expect, test } from "@playwright/test";

import { apiPost, loginAs } from "./helpers";

/**
 * The What Now home spec — S1 port of webapp/e2e/next.spec.ts. Same three
 * transitions, re-bound selectors (the 2026-08-08 centered-session redesign
 * renamed the completion flow: the action is now "Wrap up" → composer →
 * "Mark complete"; the spec-drift note in the webapp suite's header).
 *
 * Data: seeded by `api/src/seed-s4.ts` (run it before the suite):
 *   cd api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-s4.ts
 * `s4-next@test.local` carries "Bench task" (Upcoming, undated) and
 * "Deep work task" (Someday; the spec promotes it to Today, then starts and
 * completes it through focus) — the seed replaces the webapp suite's
 * signup + triage helpers, which belong to S2/S3's surfaces.
 *
 * The suite runs mobile (webapp parity: a reported double-tap bug meant
 * Start must reach focus with no intermediate card).
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const EMAIL = "s4-next@test.local";

async function lensIdOf(page: import("@playwright/test").Page): Promise<string> {
  const appData = await apiPost<{ lenses: { id: string }[] }>(page, "/rpc/tasks/appData", {});
  return (appData.lenses.find((l) => l.isIncluded) ?? appData.lenses[0])!.id;
}

interface RowDto {
  id: string;
  description: string;
}

async function findTask(
  page: import("@playwright/test").Page,
  lensId: string,
  description: string,
): Promise<RowDto> {
  for (const status of ["SOMEDAY", "UPCOMING", "TODAY"] as const) {
    const rows = await apiPost<RowDto[]>(page, "/rpc/tasks/byLens", {
      lensId,
      status,
      isDone: false,
    });
    const hit = rows.find((row) => row.description === description);
    if (hit) return hit;
  }
  throw new Error(`seeded task not found: ${description}`);
}

test.describe("What Now home", () => {
  test("an Upcoming task (no due date) also surfaces on home", async ({ page }) => {
    await loginAs(page, EMAIL);
    await page.goto("/");

    // Pool = Today + undated/future-due Upcoming (WORKFLOW §5.2): with no
    // Today commit, the undated bench task is the engine's #1.
    await expect(page.getByText("Bench task")).toBeVisible();
    // The context line reads "Next in <Lens>".
    await expect(page.getByText(/Next in/)).toBeVisible();
  });

  test("'Start' enters focus mode in one action (F13)", async ({ page }) => {
    await loginAs(page, EMAIL);
    const lensId = await lensIdOf(page);
    const deep = await findTask(page, lensId, "Deep work task");
    // The triage step of the original spec, re-bound: commit the task to
    // Today (the pool's court outranks the bench).
    await apiPost(page, "/rpc/tasks/updateStatus", { id: deep.id, status: "TODAY" });

    await page.goto("/");
    await expect(page.getByText("Deep work task")).toBeVisible();

    await page.getByRole("button", { name: /^start$/i }).click();
    await expect(page).toHaveURL(/\/do\/focus$/);
    await expect(page.getByLabel(/focus:/i)).toBeVisible();
  });

  test("completing a task in focus mode removes it from Next (F16)", async ({ page }) => {
    await loginAs(page, EMAIL);
    // Pin the target (idempotent if test 2 already committed it): completing
    // "whatever is #1" would silently eat another seeded row (e.g. Bench
    // task) when the suite re-runs without a fresh seed.
    const lensId = await lensIdOf(page);
    const deep = await findTask(page, lensId, "Deep work task");
    await apiPost(page, "/rpc/tasks/updateStatus", { id: deep.id, status: "TODAY" });

    await page.goto("/");

    // The task is Now — Start just navigates.
    await page.getByRole("button", { name: /^start$/i }).click();
    await expect(page).toHaveURL(/\/do\/focus$/);

    // Wrap up → composer → Mark complete (current labels per the redesign).
    await page.getByRole("button", { name: /wrap up/i }).click();
    await page.getByRole("button", { name: /mark complete/i }).click();

    await expect(page).toHaveURL(/\/do$/);
    await expect(page.getByText("Deep work task")).toHaveCount(0);
  });
});
