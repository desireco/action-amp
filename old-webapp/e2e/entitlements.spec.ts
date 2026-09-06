import { test, expect } from "@playwright/test";
import { signupNewUser } from "./helpers";

/**
 * Entitlement enforcement — docs/specs/entitlement-enforcement.md.
 *
 * Keep: the cross-layer gate (FREE user clicks Work lens → ProGate shows, lens
 * does NOT switch, no Work queries fire — client gate + server 402 boundary).
 * Dropped: allowance-chip tests ("N of M used") — those are component renders
 * and the cap math is covered by src/billing/entitlements.ops.test.ts.
 */

test("FREE user clicking the Work lens shows the ProGate, not Work content", async ({ page }) => {
  await signupNewUser(page);

  // Wait for app data to resolve before clicking: the lens tabs render from a
  // static fallback before the lenses query lands, and the gate logic
  // (selectLens → lenses.find) only fires once real lenses are in hand. The Me
  // tab's today-count badge (e.g. "Me 3") only appears once appData loads, so
  // it's the readiness signal that the gate can actually evaluate.
  await expect(page.getByRole("tab", { name: /^me\b.*\d/i })).toBeVisible({ timeout: 10_000 });

  // Clicking Work does NOT switch to it — the main area shows the ProGate panel.
  await page.getByRole("tab", { name: /work/i }).click();
  await expect(page.getByText(/Pro feature/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: /see plans/i })).toBeVisible();

  // The lens did NOT switch: the Me tab stays selected (the gate intercepts).
  // The tab's accessible name includes its count badge ("Me 3 today tasks"),
  // so match by the leading "Me" + the selected state.
  await expect(page.getByRole("tab", { name: /^me\b/i })).toHaveAttribute("aria-selected", "true");
});
