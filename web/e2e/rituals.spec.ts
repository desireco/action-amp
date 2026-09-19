import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers";

/**
 * Rituals spec — the habits layer per docs/specs/rituals.md §Work part 9.
 *
 * Data: seeded by `api/src/seed-rituals.ts` (run before the suite):
 *   cd api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-rituals.ts
 * `rituals-pro@test.local` (billed PRO) carries "Take vitamins" (DAILY,
 * MORNING), "Evening stretch" (DAILY, EVENING) — both due every run day —
 * and "Week plan review" (WEEKLY Monday, Planning-list only).
 * `s4-today@test.local` (FREE, from seed-s4) is the gate probe.
 *
 * The downgrade-preservation leg is intentionally NOT here: flipping
 * planRenewsAt mid-run needs DB access the browser context does not have,
 * and the guarantee is structural (no ritual op deletes rows on a 402 —
 * the gate throws before any core call; see procedures/rituals.ts +
 * the domain suite's assertRitualsAllowed tests).
 */
const PRO_EMAIL = "rituals-pro@test.local";
const FREE_EMAIL = "s4-today@test.local";

/** Normalize a row to unchecked before a test's own check gesture — a
 *  checked circle unchecks on tap instead of opening the dialog, and suite
 *  state (or a prior run without a re-seed) may have left it checked.
 *  The visibility wait comes FIRST: a row that merely doesn't exist yet
 *  (fetch in flight) is not "unchecked", and clicking a late-rendered
 *  checked row would silently uncheck it. */
async function ensureUnchecked(page: import("@playwright/test").Page, name: string) {
  const row = page.locator(".aa-ritual-strip__row", { hasText: name });
  await expect(row).toBeVisible();
  if ((await row.locator(".aa-cc--filled").count()) > 0) {
    await row.locator(".aa-cc").click();
    await expect(row.locator(".aa-cc--filled")).toHaveCount(0);
    await page.waitForTimeout(400); // let the loadToday refresh settle
  }
}

test.describe("Rituals", () => {
  test("creation defaults to the Me lens and lands on the Planning list", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/rituals");
    await expect(page.getByRole("heading", { name: "Rituals" })).toBeVisible();

    // Self-healing: a prior run without a re-seed leaves its creation
    // behind (the seed's reset also purges it) — archive the leftovers so
    // the row locator below resolves to exactly this run's row. One row per
    // pass: each archive refreshes the list, detaching every row locator.
    for (let guardCount = 0; guardCount < 5; guardCount += 1) {
      const leftover = page.locator(".aa-rituals__row", { hasText: "Read 10 pages" }).first();
      if ((await leftover.count()) === 0) break;
      await leftover.getByRole("button", { name: "Archive" }).click();
      await page.waitForTimeout(400);
    }
    await expect(page.locator(".aa-rituals__row", { hasText: "Read 10 pages" })).toHaveCount(0);

    // Create without touching the lens picker — the default IS Me — and
    // link it to the seeded Wellbeing goal (the why at all).
    await page.getByRole("button", { name: "New ritual" }).click();
    await page.getByPlaceholder("Morning walk").fill("Read 10 pages");
    await page.getByRole("radio", { name: "Wellbeing" }).click();
    await page.getByRole("button", { name: "Create ritual" }).click();

    const row = page.locator(".aa-rituals__row", { hasText: "Read 10 pages" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Morning")).toBeVisible();
    await expect(row.getByText("Every day")).toBeVisible();
    await expect(row.locator(".aa-rituals__row-goal")).toHaveText(/Wellbeing/);
  });

  test("due rituals group by interval on Today, outside the cap", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/today");

    const strip = page.locator(".aa-ritual-strip");
    await expect(strip).toBeVisible();

    // MORNING group carries the vitamins; EVENING the stretch.
    const morning = strip.locator(".aa-ritual-strip__group", { hasText: "Morning" });
    await expect(morning.locator(".aa-ritual-strip__row", { hasText: "Take vitamins" })).toBeVisible();
    const evening = strip.locator(".aa-ritual-strip__group", { hasText: "Evening" });
    await expect(evening.locator(".aa-ritual-strip__row", { hasText: "Evening stretch" })).toBeVisible();

    // Outside the cap by construction: rituals render while the commitment
    // count stays untouched ("0 of 5 committed" — no tasks, no ritual dots).
    await expect(page.getByRole("heading", { name: /of 5 committed/ })).toHaveText("0 of 5 committed");
  });

  test("check opens the reflection; X exits without checking; Complete commits it", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/today");
    await ensureUnchecked(page, "Take vitamins");

    const row = page.locator(".aa-ritual-strip__row", { hasText: "Take vitamins" });
    await row.locator(".aa-cc").click();

    const dialog = page.locator(".aa-ritual-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("How did it go?")).toBeVisible();

    // X exits WITHOUT checking — nothing saved, nothing checked.
    await dialog.getByRole("button", { name: "Close", exact: false }).click();
    await expect(dialog).not.toBeVisible();
    await expect(row.locator(".aa-cc--filled")).toHaveCount(0);

    // Reopen and complete with a mood + note.
    await row.locator(".aa-cc").click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: /Good/ }).click();
    await dialog.locator(".aa-ritual-dialog__note").fill("Easy today");
    await dialog.getByRole("button", { name: "Complete" }).click();

    await expect(dialog).not.toBeVisible();
    // Checked: the circle fills and the recorded mood renders its glyph.
    await expect(row.locator(".aa-cc--filled")).toBeVisible();
    await expect(row.locator(".aa-ritual-strip__mood")).toHaveText("▲");
  });

  test("Complete with nothing entered is also a valid check", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/today");
    await ensureUnchecked(page, "Evening stretch");

    const row = page.locator(".aa-ritual-strip__row", { hasText: "Evening stretch" });
    await row.locator(".aa-cc").click();
    await page.locator(".aa-ritual-dialog").getByRole("button", { name: "Complete" }).click();

    await expect(row.locator(".aa-cc--filled")).toBeVisible();
    await expect(row.locator(".aa-ritual-strip__mood")).toHaveCount(0);
  });

  test("a checked row reopens the reflection for view/edit; uncheck removes it", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/today");

    // Check the vitamins first (this test owns its state).
    await ensureUnchecked(page, "Take vitamins");
    const row = page.locator(".aa-ritual-strip__row", { hasText: "Take vitamins" });
    await row.locator(".aa-cc").click();
    await page.locator(".aa-ritual-dialog").getByRole("button", { name: "Complete" }).click();
    await expect(row.locator(".aa-cc--filled")).toBeVisible();

    // Reopen over the saved entry — mood + note editable.
    await row.locator(".aa-ritual-strip__name").click();
    const dialog = page.locator(".aa-ritual-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: /Rough/ }).click();
    await dialog.locator(".aa-ritual-dialog__note").fill("Rushed");
    await dialog.getByRole("button", { name: "Complete" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(row.locator(".aa-ritual-strip__mood")).toHaveText("▼");

    // The quiet history on the Planning page: today's day + glyph + note.
    await page.goto("/rituals");
    const planRow = page.locator(".aa-rituals__row", { hasText: "Take vitamins" });
    await planRow.getByRole("button", { name: "History" }).click();
    const historyEntry = planRow.locator(".aa-rituals__history-list li").first();
    await expect(historyEntry.locator(".aa-rituals__history-mood")).toHaveText("▼");
    await expect(historyEntry).toContainText("Rushed");

    // Uncheck — one direct tap, no modal; the entry and its reflection go.
    await page.goto("/today");
    await row.locator(".aa-cc").click();
    await expect(row.locator(".aa-cc--filled")).toHaveCount(0);
    await expect(row.locator(".aa-ritual-strip__mood")).toHaveCount(0);
  });

  test("pause hides a ritual from Today without deleting it", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/today");
    await expect(page.locator(".aa-ritual-strip__row", { hasText: "Take vitamins" })).toBeVisible();

    await page.goto("/rituals");
    const row = page.locator(".aa-rituals__row", { hasText: "Take vitamins" });
    await row.getByRole("button", { name: "Pause" }).click();
    await expect(row.getByText("Paused")).toBeVisible();

    await page.goto("/today");
    await expect(page.locator(".aa-ritual-strip__row", { hasText: "Take vitamins" })).toHaveCount(0);

    // Resume restores it (and the seed's RESET covers the next run).
    await page.goto("/rituals");
    await page.locator(".aa-rituals__row", { hasText: "Take vitamins" }).getByRole("button", { name: "Resume" }).click();
    await page.goto("/today");
    await expect(page.locator(".aa-ritual-strip__row", { hasText: "Take vitamins" })).toBeVisible();
  });

  test("the empty state offers one-tap starting points that prefill the composer", async ({ page }) => {
    await loginAs(page, "rituals-empty@test.local");
    await page.goto("/rituals");
    await expect(page.getByText("No rituals yet.")).toBeVisible();

    await page.getByRole("button", { name: "Journaling", exact: true }).click();

    // Prefilled: name, evening interval, guidance/benefit with markdown.
    await expect(page.getByPlaceholder("Morning walk")).toHaveValue("Journaling");
    await expect(
      page.locator("input[placeholder='Ten minutes, three bullets, no editing']"),
    ).toHaveValue(/no editing/);
    await expect(
      page.locator("input[placeholder='Clears the noise before the day starts']"),
    ).toHaveValue(/Clears the noise/);
    await page.getByRole("button", { name: "Create ritual" }).click();

    const row = page.locator(".aa-rituals__row", { hasText: "Journaling" });
    await expect(row).toBeVisible();
    await expect(row.locator(".aa-md strong", { hasText: "no editing" })).toBeVisible();
  });

  test("drag a row onto another to reorder (order = index write)", async ({ page }) => {
    await loginAs(page, PRO_EMAIL);
    await page.goto("/rituals");

    // "Week plan review" is seeded last; drag it onto the first row.
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    const src = page.locator(".aa-rituals__row", { hasText: "Week plan review" });
    const target = page.locator(".aa-rituals__row", { hasText: "Take vitamins" });
    await src.dispatchEvent("dragstart", { dataTransfer });
    await target.dispatchEvent("dragover", { dataTransfer });
    await target.dispatchEvent("drop", { dataTransfer });
    await src.dispatchEvent("dragend", { dataTransfer });
    await page.waitForTimeout(900);

    await expect(page.locator(".aa-rituals__row").first()).toContainText("Week plan review");
  });

  test("FREE sees the ProGate on /rituals, a 402 on the wire, and no strip on Today", async ({ page }) => {
    await loginAs(page, FREE_EMAIL);

    await page.goto("/rituals");
    await expect(page.getByText("Rituals is a Pro feature.")).toBeVisible();
    await expect(page.getByRole("button", { name: "New ritual" })).toHaveCount(0);

    // The wire-level gate: every op — reads included — answers 402.
    const res = await page.request.post("/rpc/rituals/list", {
      headers: { "content-type": "application/json", "x-requested-with": "actionamp-e2e" },
      data: { json: {} },
    });
    expect(res.status()).toBe(402);

    await page.goto("/today");
    await expect(page.locator(".aa-ritual-strip")).toHaveCount(0);
  });
});
