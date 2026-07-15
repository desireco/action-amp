import { test, expect } from "@playwright/test";
import { signupNewUser, triageOneItem, completeTopTask } from "./helpers";

/**
 * Today — FEATURES.md §4 F12: Today is capped (default 5). To add a 6th, you
 * must bump one out. This forces the "what actually matters today" decision.
 *
 * Keep: the cap (the feature, not a limit) + the Not-today → bench → promote
 * horizon flow. Dropped: empty-state and "triaged item appears" (trivial, and
 * the latter is covered by triage.spec.ts).
 *
 * ponytail: avoid leading "Today" in task text — parseCapture treats it as a
 * date keyword and strips it, breaking text matches.
 */

const TASK = (n: number) => `Focus task ${n}`;

test("F12: Today is capped at 5 — a 6th item is flagged as over-capacity", async ({ page }) => {
  await signupNewUser(page);

  // Triage 6 items to Today through the wizard (one at a time). triageOneItem
  // captures + walks the full spec flow per item.
  for (let i = 1; i <= 6; i++) {
    await triageOneItem(page, TASK(i), { type: "task", when: "today" });
  }

  await page.goto("/app/today");

  // F12: the cap is surfaced. The heading reads "6 of 5 committed" (cap is 5
  // and exceeded), an amber "Over capacity" banner appears, and the overflow
  // tasks render in a list labelled "Beyond the cap" (aria-label on the <ul>,
  // not a visible heading — the banner already states the count).
  await expect(page.getByRole("heading", { name: /of 5 committed/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/over capacity/i)).toBeVisible();
  await expect(page.locator("[aria-label^='Beyond the cap']")).toBeVisible();
});

test("'Move to Upcoming' demotes; Upcoming's 'Today' promotes back", async ({ page }) => {
  await signupNewUser(page);
  // Clear the seeded starter task so "Swap me around" is the only Today row
  // (deterministic per-row demote click).
  await completeTopTask(page);

  // Capture + triage one item to Today.
  await triageOneItem(page, "Swap me around", { type: "task", when: "today" });

  // On Today, demote it via "Move to Upcoming" → confirm dialog.
  await page.goto("/app/today");
  await expect(page.getByText("Swap me around")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /move to upcoming/i }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /move to upcoming/i }).click();

  // It leaves the Today list...
  await expect(page.getByText("Swap me around")).toHaveCount(0, { timeout: 10_000 });

  // ...and appears on the Upcoming page (its own route now, not an inline bench).
  await page.goto("/app/upcoming");
  await expect(page.getByText("Swap me around")).toBeVisible({ timeout: 10_000 });

  // Promote it back via Upcoming's per-row "Today" button.
  await page.locator(".aa-task-row").filter({ hasText: "Swap me around" })
    .getByRole("button", { name: /^today$/i }).click();
  await expect(page.getByText("Swap me around")).toHaveCount(0, { timeout: 10_000 });

  // ...and returns to the Today list.
  await page.goto("/app/today");
  await expect(page.getByText("Swap me around")).toBeVisible({ timeout: 10_000 });
});
