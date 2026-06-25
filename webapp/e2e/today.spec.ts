import { test, expect } from "@playwright/test";
import { signupNewUser, triageOneItem } from "./helpers";

/**
 * Today — FEATURES.md §4 F12: Today is capped (default 5). To add a 6th, you
 * must bump one out. This forces the "what actually matters today" decision.
 *
 * Encodes the spec. The cap is the feature, not a limit.
 *
 * ponytail: avoid leading "Today" in task text — parseCapture treats it as a
 * date keyword and strips it, breaking text matches.
 */

const TASK = (n: number) => `Focus task ${n}`;

test("empty Today shows a calm empty state", async ({ page }) => {
  await signupNewUser(page);
  await page.goto("/app/today");
  await expect(page.getByText(/nothing|clear|empty|no .*today/i)).toBeVisible({ timeout: 10_000 });
});

test("triaged-to-Today items appear in the Today list", async ({ page }) => {
  await signupNewUser(page);
  await triageOneItem(page, TASK(1), { type: "task", when: "today" });
  await page.goto("/app/today");
  await expect(page.getByText(TASK(1))).toBeVisible({ timeout: 10_000 });
});

test("F12: Today is capped at 5 — a 6th item is flagged as over-capacity", async ({ page }) => {
  await signupNewUser(page);

  // Triage 6 items to Today through the wizard (one at a time). triageOneItem
  // captures + walks the full spec flow per item.
  for (let i = 1; i <= 6; i++) {
    await triageOneItem(page, TASK(i), { type: "task", when: "today" });
  }

  await page.goto("/app/today");

  // F12: the cap is surfaced. The heading reads "N of 5 committed" (proving
  // the cap is 5 and it's exceeded), an "Over capacity" banner appears, and
  // the overflow tasks live in a separate "Beyond the cap" section.
  await expect(page.getByRole("heading", { name: /of 5 committed/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/over capacity/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /beyond the cap/i })).toBeVisible();
});

test("'Not today' demotes to Upcoming; the bench shows it; 'Today' promotes back", async ({ page }) => {
  await signupNewUser(page);

  // Capture + triage one item to Today.
  await triageOneItem(page, "Swap me around", { type: "task", when: "today" });

  // On Today, demote it via "Not today".
  await page.goto("/app/today");
  await expect(page.getByText("Swap me around")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Not today" }).click();

  // It leaves the Today list...
  await expect(page.getByText("Swap me around")).toHaveCount(0, { timeout: 10_000 });

  // ...and appears on the Upcoming bench.
  await page.getByRole("button", { name: /see upcoming/i }).click();
  await expect(page.getByText("Swap me around")).toBeVisible({ timeout: 10_000 });

  // Promote it back: it leaves the bench...
  // (Scope to the upcoming section — the sidebar "Today" nav link also matches.)
  const upcomingSection = page.locator(".aa-today__upcoming");
  await upcomingSection.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("Swap me around")).toHaveCount(0, { timeout: 10_000 });

  // ...and returns to the Today list.
  await page.getByRole("button", { name: /back to today/i }).click();
  await expect(page.getByText("Swap me around")).toBeVisible({ timeout: 10_000 });
});
