import { test, expect, type Page } from "@playwright/test";
import { apiPost, loginAs, DEV_EMAIL } from "./helpers";

/**
 * Goal planning — the full lifecycle + sequence flow (S6 port of
 * webapp/e2e/goal-planning.spec.ts; goal-planning spec §G).
 *
 * Create a goal → create two projects → link each to the goal from the
 * project's detail page → complete the focused project → see "Focus:" advance
 * → complete the goal → it appears in the Logbook → reopen restores it.
 *
 * Adaptations for the new stack (behavior identical, setup re-authed):
 * - signupNewUser → the API dev login (the seeded dev user carries the Me
 *   lens + a PRO grant so repeated runs never trip the FREE caps); goal and
 *   project names get a per-run suffix (goal names are unique per user).
 * - "Create goal" waits on /rpc/goals/create (the webapp waited on the Wasp
 *   /operations/create-goal path).
 * - The two projects are created via /rpc/projects/create (triage's project
 *   branch is S2/S3's surface).
 * - Steps 6–7 (Logbook row + Reopen) are ported as test.fixme: /do/logbook is
 *   S8's surface. Reopen calls the same /rpc/goals/set-done endpoint the
 *   Complete step exercises.
 */

function run(): string {
  return String(Date.now());
}

async function createProject(page: Page, name: string) {
  return apiPost<{ id: string; permalink: string; name: string }>(
    page,
    "/rpc/projects/create",
    { name },
  );
}

test("goal → link projects → complete → focus advances", async ({ page }) => {
  // The chained steps each depend on the last; give the chain room.
  test.setTimeout(90_000);
  const suffix = run();
  await loginAs(page, DEV_EMAIL);

  // ---- 1. Create a goal from the Goals page ----
  await page.goto("/do/goals");
  await page.getByRole("button", { name: /^new goal$/i }).click();
  const goalName = `Run a 10k ${suffix}`;
  await page.getByPlaceholder(/grow audience/i).fill(goalName);
  // Wait for the create-goal action to settle before asserting (avoids a
  // stale list read racing the write).
  const createGoalRes = page
    .waitForResponse((r) => r.url().includes("/rpc/goals/create"), { timeout: 10_000 })
    .catch(() => null);
  await page.getByRole("button", { name: /^create goal$/i }).click();
  const goalRes = await createGoalRes;
  if (goalRes) expect(goalRes.ok()).toBeTruthy();
  // The goal name surfaces as a card link.
  await expect(page.getByRole("link", { name: goalName })).toBeVisible({ timeout: 10_000 });

  // ---- 2. Create two projects, then link each from its detail page ----
  await createProject(page, `Couch to 5k ${suffix}`);
  await createProject(page, `Bridge to 10k ${suffix}`);

  for (const projectName of [`Couch to 5k ${suffix}`, `Bridge to 10k ${suffix}`]) {
    await page.goto("/do/projects");
    // Click the card and WAIT for the detail route (the list card's title is
    // also a heading — a bare toBeVisible could match the list page itself).
    await page.getByRole("link", { name: projectName }).click();
    await expect(page).toHaveURL(new RegExp(`/do/projects/.+`), { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: /link a goal/i }).click();
    await page.locator(".aa-project__relink-opt").filter({ hasText: goalName }).click();
    // The link surfaces as the goal name (with an "Edit goal" affordance).
    await expect(page.getByText(goalName).first()).toBeVisible({ timeout: 10_000 });
  }

  // ---- 3. Open the goal; "Focus:" surfaces the first non-done project ----
  await page.goto("/do/goals");
  await page.getByRole("link", { name: goalName }).click();
  await expect(page.getByRole("heading", { name: goalName })).toBeVisible({ timeout: 10_000 });
  // Both linked projects surface in the goal's project list.
  await expect(page.locator(".aa-goal__projects").getByText(`Couch to 5k ${suffix}`)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator(".aa-goal__projects").getByText(`Bridge to 10k ${suffix}`)).toBeVisible({
    timeout: 10_000,
  });
  // "Focus:" points at the first non-done project.
  await expect(page.getByText(/Focus:/)).toContainText(/Couch to 5k|Bridge to 10k/);
  const focusedName = (
    await page.getByText(/Focus:/).textContent()
  )?.replace(/.*Focus:\s*/, "").trim();
  expect(focusedName).toBeTruthy();

  // ---- 4. Complete the focused project; "Focus:" advances to the other ----
  await page.goto("/do/projects");
  await page.getByRole("link", { name: focusedName ?? "" }).click();
  await expect(page).toHaveURL(new RegExp(`/do/projects/.+`), { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: focusedName ?? "" })).toBeVisible({
    timeout: 10_000,
  });
  // Complete lives behind ⋯ (Project actions), with a confirm.
  await page.getByRole("button", { name: "Project actions" }).click();
  await page.getByRole("menuitem", { name: /^complete$/i }).click();
  await page.getByRole("button", { name: /^complete project$/i }).click();

  // Back to the goal — "Focus:" now names the remaining project.
  await page.goto("/do/goals");
  await page.getByRole("link", { name: goalName }).click();
  const otherName = focusedName?.startsWith("Couch")
    ? `Bridge to 10k ${suffix}`
    : `Couch to 5k ${suffix}`;
  await expect(page.getByText(/Focus:/)).toContainText(otherName, { timeout: 10_000 });

  // ---- 5. Complete the goal; it leaves the active list ----
  await page.getByRole("button", { name: /^complete$/i }).click();
  await expect(page).toHaveURL(/\/do\/goals/, { timeout: 10_000 });
  await expect(page.getByRole("link", { name: goalName })).toHaveCount(0, { timeout: 10_000 });
});

// Ported from webapp steps 6–7 — the completed goal surfaces in /do/logbook
// (S8) as a row with the teal Goal chip; Reopen drives /rpc/goals/setDone
// {isDone:false} and the goal returns to /do/goals. Self-contained: creates +
// completes its own goal over the RPC wire.
test("completed goals appear in the Logbook and reopen from there", async ({ page }) => {
  await loginAs(page);
  const name = `Logbook reopen ${run()}`;
  const created = await apiPost<{ id: string }>(page, "/rpc/goals/create", { name });
  expect(created.id).toBeTruthy();
  await apiPost(page, "/rpc/goals/setDone", { id: created.id, isDone: true });

  await page.goto("/do/logbook");
  const row = page.locator(".aa-logbook-row", { hasText: name }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator(".aa-logbook-row__meta").getByText("Goal")).toBeVisible();
  await row.getByRole("button", { name: "Reopen" }).click();
  await expect(row).toHaveCount(0, { timeout: 10_000 });
  // The goal is active again.
  await page.goto("/do/goals");
  await expect(page.getByRole("link", { name })).toBeVisible({ timeout: 10_000 });
});
