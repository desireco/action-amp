import { test, expect, type Page } from "@playwright/test";
import { apiPost, loginAs, DEV_EMAIL, activeLensId } from "./helpers";

/**
 * Mobile goal management (docs/specs/mobile-goal-management.md §Tests) —
 * the goals flow at phone width, driven entirely through the thumb-zone
 * chrome: dock Plan button → section menu → Goals → create → detail →
 * complete. Plus project→goal linking through the shared PickerSheet, and
 * the no-horizontal-overflow guard on every surface visited. The desktop
 * lifecycle is covered by goal-planning.spec.ts.
 *
 * 320×568 (iPhone SE) is deliberate: the shared card grid's 320px minmax
 * track only overflows a document at genuinely narrow widths (at 360 the
 * margin is a rounding-error 8px that Chromium can absorb), so this
 * viewport makes the overflow guard genuinely catch a goals.css load
 * regression.
 */

test.use({ viewport: { width: 320, height: 568 } });

function run(): string {
  return String(Date.now());
}

async function expectNoHorizontalOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} overflows horizontally`).toBeLessThanOrEqual(0);
}

test("mobile: Plan menu → goal create → link via sheet → complete", async ({ page }) => {
  // The chained steps each depend on the last; give the chain room.
  test.setTimeout(90_000);
  const suffix = run();
  await loginAs(page, DEV_EMAIL);

  // ---- 1. The dock's Plan item opens the section menu; Goals is in it ----
  await page.goto("/");
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  const planMenu = page.locator(".aa-mobile-plan-menu");
  await expect(planMenu).toBeVisible();
  await expect(planMenu.getByRole("menuitem", { name: "Upcoming" })).toBeVisible();
  await expect(planMenu.getByRole("menuitem", { name: "Projects" })).toBeVisible();
  await expect(planMenu.getByRole("menuitem", { name: "Someday" })).toBeVisible();
  await planMenu.getByRole("menuitem", { name: "Goals" }).click();
  await expect(page).toHaveURL(/\/goals/, { timeout: 10_000 });
  // The menu closed on navigation; the dock's Plan item keeps section state.
  await expect(planMenu).toHaveCount(0);

  // ---- 2. Create a goal from the phone-width composer ----
  const goalName = `Ship mobile goals ${suffix}`;
  await page.getByRole("button", { name: /^new goal$/i }).click();
  await page.getByPlaceholder(/grow audience/i).fill(goalName);
  const createGoalRes = page
    .waitForResponse((r) => r.url().includes("/rpc/goals/create"), { timeout: 10_000 })
    .catch(() => null);
  await page.getByRole("button", { name: /^create goal$/i }).click();
  const goalRes = await createGoalRes;
  let goalId = "";
  if (goalRes) {
    expect(goalRes.ok()).toBeTruthy();
    // RPCLink envelope: {"json":{id,…}} — keep the id for the reopen below
    // (the completed goal is no longer in the active list to look up).
    goalId = ((await goalRes.json()) as { json: { id: string } }).json.id;
  }
  await expect(page.getByRole("link", { name: goalName })).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalOverflow(page, "/goals");

  // ---- 3. Detail at phone width: header, actions, back after Complete ----
  await page.getByRole("link", { name: goalName }).click();
  await expect(page.getByRole("heading", { name: goalName })).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalOverflow(page, "goal detail");
  await page.getByRole("button", { name: /^complete$/i }).click();
  await expect(page).toHaveURL(/\/goals$/, { timeout: 10_000 });
  await expect(page.getByRole("link", { name: goalName })).toHaveCount(0, { timeout: 10_000 });

  // ---- 4. Link a project to a goal through the PickerSheet ----
  // Reopen the goal over the wire (Complete navigated away); the sheet is
  // the same control on every viewport, so this covers the thumb path.
  await apiPost(page, "/rpc/goals/setDone", { id: goalId, isDone: false });
  const projectName = `Mobile link ${suffix}`;
  await apiPost<{ id: string; permalink: string }>(page, "/rpc/projects/create", {
    name: projectName,
    lensId: await activeLensId(page),
  });
  await page.goto("/projects");
  await page.getByRole("link", { name: projectName }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/.+`), { timeout: 10_000 });
  await page.getByRole("button", { name: /link a goal/i }).click();
  const sheetItem = page.locator(".aa-picker-sheet__item").filter({ hasText: goalName });
  await expect(sheetItem).toBeVisible({ timeout: 10_000 });
  await sheetItem.click();
  // The link surfaces in the Why row (with an "Edit goal" affordance).
  await expect(page.getByText(goalName).first()).toBeVisible({ timeout: 10_000 });
  await expectNoHorizontalOverflow(page, "project detail");
});

test("mobile: Plan and Lens dock menus are mutually exclusive", async ({ page }) => {
  await loginAs(page);
  await page.goto("/");
  const plan = page.getByRole("button", { name: "Plan", exact: true });
  const lens = page.locator(".aa-mobile-dock__lens-btn");

  await plan.click();
  await expect(page.locator(".aa-mobile-plan-menu")).toBeVisible();
  await expect(plan).toHaveAttribute("aria-expanded", "true");

  // Opening the Lens menu closes the Plan menu (and vice versa).
  await lens.click();
  await expect(page.locator(".aa-mobile-plan-menu")).toHaveCount(0);
  await expect(page.locator(".aa-mobile-lens-menu")).toBeVisible();
  await lens.click();
  await expect(page.locator(".aa-mobile-lens-menu")).toHaveCount(0);
});
