import { expect, test } from "@playwright/test";

import { DEV_EMAIL, SEED_TASK_DESCRIPTIONS, apiPost, loginAs, type TaskDto } from "./helpers";

/**
 * The F11 smoke spec — one lap around the shell, the auth convention, and the
 * seeded data path. Stable markers only (aria labels, roles, the mode
 * indicator) — no styling or text-prose assertions.
 *
 * KNOWN GAP (S-slice, do not "fix" here): the SPA's RPC client
 * (apps/web/src/lib/api.ts → @actionamp/contract createClient) passes no
 * `headers`, and oRPC's RPCLink POSTs EVERY procedure — reads included. The
 * API's CSRF guard rejects cookie-authed POSTs without `x-requested-with`
 * (apps/api/src/auth/resolve.ts), so the TaskList cannot render rows
 * in-browser yet: logged out it shows the 401 message, logged in the 403 one.
 * Until api.ts passes `headers: () => ({ "x-requested-with": "actionamp" })`,
 * test 2 asserts the authenticated data path at the wire (same cookie jar,
 * CSRF header set) instead of on-screen rows.
 */

test.describe("shell smoke", () => {
  /** The TaskList container (TaskList.svelte) — a plain div, no implicit role. */
  function tasksRegion(page: import("@playwright/test").Page) {
    return page.locator('[aria-label="Tasks"]');
  }

  test("unauthenticated visit renders the shell, no crash", async ({ page }) => {
    await page.goto("/");

    // The modal shell is up: Work is the home base, the dial + indicator render.
    // (<section aria-label> has implicit ARIA role `region`, not `section`.)
    const screen = page.getByRole("region", { name: "Work mode" });
    await expect(screen.getByRole("heading", { name: "Work" })).toBeVisible();
    await expect(screen.getByRole("group", { name: "Mode dial" })).toHaveCount(1);
    await expect(page.getByRole("status")).toHaveText("-- WORK --");

    // The TaskList asked the API and degraded to a message (401 without a
    // session) — the data plane is wired, the app just shows the state.
    await expect(tasksRegion(page)).toBeVisible();
    await expect(tasksRegion(page).getByRole("alert")).toBeVisible({ timeout: 10_000 });
    await expect(tasksRegion(page).getByRole("alert")).toContainText(/authentication/i);
  });

  test("dev login renders the seeded tasks (data path via the RPC wire)", async ({ page }) => {
    await loginAs(page, DEV_EMAIL);
    await page.goto("/");

    // Still the shell, no crash, and the tasks region settles (rows once the
    // S-slice header fix lands; the CSRF error message until then — see the
    // gap note above). Either way: no spinner limbo, no blank screen.
    await expect(page.getByRole("heading", { name: "Work" })).toBeVisible();
    await expect(
      tasksRegion(page).locator(".row").or(tasksRegion(page).getByRole("alert")).first(),
    ).toBeVisible({ timeout: 10_000 });

    // The authenticated data path: the browser context's own wasp_session
    // cookie, straight against /rpc — this is the exact data the TaskList
    // would render. The seed script (apps/api/src/seed.ts) guarantees these
    // four rows for the dev user.
    const open = await apiPost<TaskDto[]>(page, "/rpc/tasks/list");
    expect(Array.isArray(open)).toBe(true);
    expect(open.length).toBeGreaterThan(0);
    const descriptions = open.map((t) => t.description);
    for (const seeded of SEED_TASK_DESCRIPTIONS) {
      expect(descriptions, `seeded task missing: ${seeded}`).toContain(seeded);
    }
    // The canonical first row is TODAY + IMPORTANT (the amber marker row).
    const dana = open.find((t) => t.description === SEED_TASK_DESCRIPTIONS[0]);
    expect(dana?.status).toBe("TODAY");
    expect(dana?.priority).toBe("IMPORTANT");
    expect(dana?.isDone).toBe(false);
  });

  test("the keyboard shell still works while logged in", async ({ page }) => {
    await loginAs(page, DEV_EMAIL);
    await page.goto("/");
    await expect(page.getByRole("status")).toHaveText("-- WORK --");

    // `1` = Plan on the mode dial (INTERACTION §2); Esc = universal exit back
    // to the home base (§6). The indicator is the live mode readout.
    await page.keyboard.press("1");
    await expect(page.getByRole("status")).toHaveText("-- PLAN --");
    await expect(page.locator('section[data-mode="plan"] h1')).toHaveText("Plan");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("status")).toHaveText("-- WORK --");
    await expect(page.locator('section[data-mode="work"] h1')).toHaveText("Work");
  });
});
