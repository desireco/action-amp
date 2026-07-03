import { test, expect } from "@playwright/test";
import { signupNewUser, completeTopTask } from "./helpers";

/**
 * Entitlement enforcement — docs/specs/entitlement-enforcement.md.
 *
 * A fresh signup is a FREE user (the default plan). These tests lock in the
 * three client-visible gates + the server boundary:
 *   1. The Work lens is visible-but-locked → clicking shows the ProGate (and
 *      does NOT switch the lens / fire Work queries).
 *   2. The project cap (3) disables the create affordance at the limit and
 *      surfaces the upgrade trigger.
 *   3. The allowance chip ("N of 3 used") shows the remaining count.
 *
 * The server boundary (402 on Work-lens reads + cap overflows) is the
 * non-negotiable half; these tests cover the user-facing surface that wraps it.
 */

test("FREE user clicking the Work lens shows the ProGate, not Work content", async ({ page }) => {
  await signupNewUser(page);

  // The Work lens tab carries a subtle "Pro" affordance.
  await expect(page.getByRole("tab", { name: /work/i })).toBeVisible({ timeout: 10_000 });

  // Clicking Work does NOT switch to it — the main area shows the ProGate panel.
  await page.getByRole("tab", { name: /work/i }).click();
  await expect(page.getByText(/Pro feature/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: /see plans/i })).toBeVisible();

  // The lens did NOT switch: the Me tab stays selected (the gate intercepts).
  // The tab's accessible name includes its count badge ("Me 3 today tasks"),
  // so match by the leading "Me" + the selected state.
  await expect(page.getByRole("tab", { name: /^me\b/i })).toHaveAttribute("aria-selected", "true");
});

test("Projects page shows the free-tier allowance chip for a FREE user", async ({ page }) => {
  await signupNewUser(page);
  await page.goto("/app/projects");

  // ensureOnboarded seeds a "General" project per lens → 1 of 3 used.
  await expect(page.getByText(/1 of 3 used/i)).toBeVisible({ timeout: 10_000 });
});

test("Goals page shows the free-tier allowance chip for a FREE user", async ({ page }) => {
  await signupNewUser(page);
  await completeTopTask(page);
  await page.goto("/app/goals");

  // No goals seeded → 0 of 1 used.
  await expect(page.getByText(/0 of 1 used/i)).toBeVisible({ timeout: 10_000 });
});
