import { test, expect } from "@playwright/test";
import { signupNewUser, completeTopTask, openCapture, triageOneItem } from "./helpers";

/**
 * Goal planning — the full lifecycle + sequence flow (goal-planning spec §G).
 *
 * Create a goal → create two projects → link each to the goal from the
 * project's detail page → reorder → complete the focused project → see
 * "Focus:" advance → complete the goal → it appears in the Logbook → reopen
 * restores it. Encodes the spec requirement, not the implementation.
 *
 * The add-project-from-inside-the-goal flow was removed; projects link to a
 * goal via their own detail page ("Link a goal" → pick). "Next:" became
 * "Focus:".
 *
 * Requires `wasp start` serving on :4000 (see playwright.config.ts).
 */

test("goal → link projects → complete → focus advances → logbook → reopen", async ({ page }) => {
  // This walks the full 7-step lifecycle (create → link × 2 → complete →
  // logbook → reopen), each step depending on the last. The default 30s
  // per-test cap isn't enough for the chain.
  test.setTimeout(90_000);
  await signupNewUser(page);
  // Clear the seeded starter task so /do/goals starts clean.
  await completeTopTask(page);

  // ---- 1. Create a goal from the Goals page ----
  await page.goto("/do/goals");
  await page.getByRole("button", { name: /^new goal$/i }).click();
  await page.getByPlaceholder(/grow audience/i).fill("Run a 10k");
  // Wait for the create-goal action to settle before asserting (avoids a stale
  // list read racing the write).
  const createGoalRes = page
    .waitForResponse((r) => r.url().includes("/operations/create-goal"), { timeout: 10_000 })
    .catch(() => null);
  await page.getByRole("button", { name: /^create goal$/i }).click();
  const goalRes = await createGoalRes;
  if (goalRes) expect(goalRes.ok()).toBeTruthy();
  // The goal name surfaces as a card link.
  await expect(page.getByRole("link", { name: "Run a 10k" })).toBeVisible({
    timeout: 10_000,
  });

  // ---- 2. Create two projects via triage (the create path), then link each ----
  // Navigate home first so the app shell is in a known state for openCapture.
  await page.goto("/do");
  await triageOneItem(page, "Couch to 5k", { type: "project" });
  await page.goto("/do");
  await triageOneItem(page, "Bridge to 10k", { type: "project" });

  // Link "Couch to 5k" to the goal from its detail page.
  await page.goto("/do/projects");
  await page.getByText("Couch to 5k").click();
  await expect(page.getByRole("heading", { name: "Couch to 5k" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /link a goal/i }).click();
  await page.locator(".aa-project__relink-opt").filter({ hasText: "Run a 10k" }).click();
  // The link surfaces as the goal name (with an "Edit goal" affordance).
  await expect(page.getByText("Run a 10k").first()).toBeVisible({ timeout: 10_000 });

  // Link "Bridge to 10k" likewise.
  await page.goto("/do/projects");
  await page.getByText("Bridge to 10k").click();
  await expect(page.getByRole("heading", { name: "Bridge to 10k" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /link a goal/i }).click();
  await page.locator(".aa-project__relink-opt").filter({ hasText: "Run a 10k" }).click();

  // ---- 3. Open the goal; "Focus:" surfaces the first non-done project ----
  await page.goto("/do/goals");
  await page.getByRole("link", { name: "Run a 10k" }).click();
  await expect(page.getByRole("heading", { name: "Run a 10k" })).toBeVisible({
    timeout: 10_000,
  });
  // Both linked projects surface in the goal's project list.
  await expect(page.locator(".aa-goal__projects").getByText("Couch to 5k")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator(".aa-goal__projects").getByText("Bridge to 10k")).toBeVisible({
    timeout: 10_000,
  });
  // "Focus:" points at the first non-done project.
  await expect(page.getByText(/Focus:/)).toContainText(/Couch to 5k|Bridge to 10k/);

  // ---- 4. Complete one project; "Focus:" advances to the other ----
  // Open the focused project, complete it from its header.
  const focusedName = (await page.getByText(/Focus:/).textContent())?.replace(/.*Focus:\s*/, "").trim();
  await page.goto("/do/projects");
  await page.getByText(focusedName ?? "Couch to 5k").click();
  await expect(page.getByRole("heading", { name: focusedName ?? "Couch to 5k" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: /^complete$/i }).click();

  // Back to the goal — "Focus:" now names the remaining project.
  await page.goto("/do/goals");
  await page.getByRole("link", { name: "Run a 10k" }).click();
  const otherName = focusedName === "Couch to 5k" ? "Bridge to 10k" : "Couch to 5k";
  await expect(page.getByText(/Focus:/)).toContainText(otherName, { timeout: 10_000 });

  // ---- 5. Complete the goal; it leaves the active list ----
  await page.getByRole("button", { name: /^complete$/i }).click();
  await expect(page).toHaveURL(/\/do\/goals/, { timeout: 10_000 });
  await expect(page.getByRole("link", { name: "Run a 10k" })).toHaveCount(0, { timeout: 10_000 });

  // ---- 6. It appears in the Logbook with a Reopen ----
  await page.goto("/do/logbook");
  // A linked project's row also shows "Run a 10k" (as its parent-goal chip),
  // so scope to rows carrying the teal "Goal" kind chip to target the goal
  // itself, not the completed project beside it.
  const goalRow = page
    .locator(".aa-logbook-row")
    .filter({ has: page.locator(".aa-chip--teal", { hasText: /^Goal$/ }) })
    .filter({ hasText: "Run a 10k" });
  await expect(goalRow).toBeVisible({ timeout: 10_000 });

  // ---- 7. Reopen restores it to the active list ----
  const reopenResponse = page
    .waitForResponse((r) => r.url().includes("/operations/set-goal-done"), { timeout: 10_000 })
    .catch(() => null);
  await goalRow.getByRole("button", { name: /^reopen$/i }).click();
  const res = await reopenResponse;
  if (res) expect(res.ok()).toBeTruthy();
  // The goal row leaves the Logbook (re-query with the same kind-chip scoping
  // so the linked project's row — which stays — doesn't keep the count at 1).
  await expect(
    page
      .locator(".aa-logbook-row")
      .filter({ has: page.locator(".aa-chip--teal", { hasText: /^Goal$/ }) })
      .filter({ hasText: "Run a 10k" }),
  ).toHaveCount(0, { timeout: 10_000 });

  await page.goto("/do/goals");
  await expect(page.getByRole("link", { name: "Run a 10k" })).toBeVisible({ timeout: 10_000 });
});
