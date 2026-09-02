import { expect, test } from "@playwright/test";

import { DEV_EMAIL, SEED_TASK_DESCRIPTIONS, apiPost, loginAs, type TaskDto } from "./helpers";

/**
 * The smoke spec — one lap around the What Now home, the auth convention, and
 * the seeded data path. Rebound from the F11 ModeScreen shell (this batch's
 * mandate: `/` IS the What Now screen now) per docs/plans/slices/
 * s1-s4-wiring.md §2.
 *
 * What changed in the rebinding:
 * - Test 1 asserts the What Now chrome renders signed-out (empty-state branch,
 *   no crash) instead of the mode dial.
 * - Test 2 keeps the wire-level data-path assertions on `/rpc/tasks/list`
 *   verbatim and swaps the on-screen half to the What Now surface.
 * - The old exact `status === "TODAY"` assertion on the first seeded row is
 *   intentionally relaxed to TODAY-or-UPCOMING: the app's lazy daily rollover
 *   (getAppData on every app load — WORKFLOW §2.3) sweeps incomplete TODAY
 *   rows to UPCOMING once per calendar day, and `seed.ts` is find-or-create
 *   (it never resets status). Priority + isDone stay exact. The F11 suite's
 *   third test (mode-dial keys `1`/Esc) died with ModeScreen; focus-mode
 *   keyboard parity lives with the What Now specs (next.spec).
 */

test.describe("shell smoke", () => {
  test("unauthenticated visit renders the What Now home, no crash", async ({ page }) => {
    await page.goto("/");

    // The What Now chrome is up without a session: the eyebrow + the
    // caught-up empty state (the signed-out visitor has no lens, so the
    // chooser degrades to its empty branch — the data plane answered 401,
    // the screen shows a state, never a blank page or spinner limbo).
    const screen = page.locator(".aa-wn");
    await expect(screen.getByText("What now")).toBeVisible();
    await expect(screen.getByRole("heading", { name: "Nothing on the table." })).toBeVisible();
    await expect(screen.getByRole("link", { name: "See Today →" })).toBeVisible();
  });

  test("dev login renders What Now + the seeded tasks (data path via the RPC wire)", async ({
    page,
  }) => {
    await loginAs(page, DEV_EMAIL);
    await page.goto("/");

    // The What Now surface settles to a card (the ranked #1) or the
    // caught-up empty state — either proves the screen rendered on live
    // API data instead of spinner limbo.
    await expect(
      page.locator(".aa-wn-card__title").or(page.locator(".aa-wn-empty")),
    ).toBeVisible({ timeout: 10_000 });

    // The authenticated data path: the browser context's own wasp_session
    // cookie, straight against /rpc. The seed script (apps/api/src/seed.ts)
    // guarantees these four rows for the dev user. (Status note: see the
    // header — the first row's status legitimately drifts TODAY → UPCOMING
    // via the lazy rollover, so only presence, priority, and isDone are
    // asserted exactly.)
    const open = await apiPost<TaskDto[]>(page, "/rpc/tasks/list");
    expect(Array.isArray(open)).toBe(true);
    expect(open.length).toBeGreaterThan(0);
    const descriptions = open.map((t) => t.description);
    for (const seeded of SEED_TASK_DESCRIPTIONS) {
      expect(descriptions, `seeded task missing: ${seeded}`).toContain(seeded);
    }
    // The canonical first row is IMPORTANT (the amber lead on the card).
    const dana = open.find((t) => t.description === SEED_TASK_DESCRIPTIONS[0]);
    expect(dana?.priority).toBe("IMPORTANT");
    expect(dana?.isDone).toBe(false);
    expect(
      ["TODAY", "UPCOMING"],
      "rollover may have swept the seeded TODAY commit to the bench",
    ).toContain(dana?.status as string);
  });
});
