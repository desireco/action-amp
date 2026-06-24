import { test, expect, type Page } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

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

/** Capture one item and dispatch it to Today via the triage review. */
async function captureAndDispatchToToday(page: Page, text: string) {
  const textarea = await openCapture(page);
  await textarea.fill(text);
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  await expect(page.getByRole("button", { name: "Trash" })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("t");
  // Wait for the dispatch to process (text leaves the triage view).
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
}

test("empty Today shows a calm empty state", async ({ page }) => {
  await signupNewUser(page);
  await page.goto("/app/today");
  await expect(page.getByText(/nothing|clear|empty|no .*today/i)).toBeVisible({ timeout: 10_000 });
});

test("triaged-to-Today items appear in the Today list", async ({ page }) => {
  await signupNewUser(page);
  await captureAndDispatchToToday(page, TASK(1));
  await page.goto("/app/today");
  await expect(page.getByText(TASK(1))).toBeVisible({ timeout: 10_000 });
});

test("F12: Today is capped at 5 — a 6th item is flagged as over-capacity", async ({ page }) => {
  await signupNewUser(page);

  // Capture 6 items.
  const textarea = await openCapture(page);
  for (let i = 1; i <= 6; i++) {
    await textarea.fill(TASK(i));
    await textarea.press("Enter");
  }
  await expect(textarea).toHaveValue("");
  await page.keyboard.press("Escape");

  // Dispatch all 6 to Today via the "1" shortcut. The gap must cover the API
  // await (~150ms) + the 320ms exit animation + a render buffer, otherwise the
  // dispatch guard (if exit) drops the press. 800ms is conservative but the
  // test only runs in CI/local, not on the hot path.
  await page.goto("/app/inbox/review");
  await expect(page.getByRole("button", { name: /today/i })).toBeVisible({ timeout: 10_000 });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("t");
    await page.waitForTimeout(1000);
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
  const textarea = await openCapture(page);
  await textarea.fill("Swap me around");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("");
  await page.keyboard.press("Escape");
  await page.goto("/app/inbox/review");
  await expect(page.getByRole("button", { name: "Trash" })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("t");
  // Wait for the dispatch to commit (320ms exit animation + API) before
  // navigating — otherwise the task hasn't landed on Today yet.
  await page.waitForTimeout(600);

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
