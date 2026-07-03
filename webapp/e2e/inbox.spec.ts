import { test, expect } from "@playwright/test";
import { signupNewUser, openCapture } from "./helpers";

/**
 * Inbox — FEATURES.md §1 F3: everything captured lands here unassigned until
 * clarified. The inbox count is the only "queue" concept.
 *
 * Encodes the spec. A failure is a real gap.
 */

test("empty inbox shows a calm zero state", async ({ page }) => {
  await signupNewUser(page);
  await page.goto("/app/inbox");

  // F3: a fresh user sees an empty inbox, not a wall of rows. The empty state
  // should communicate "inbox zero" — the exact wording may evolve.
  await expect(page.getByText(/nothing left to decide/i)).toBeVisible();
});

test("captured items appear in the inbox, newest first", async ({ page }) => {
  await signupNewUser(page);

  const textarea = await openCapture(page);
  await textarea.fill("First captured");
  // ⌘Enter = rapid-fire: capture + keep the dialog open for the next item.
  // A plain Enter would close the dialog, leaving `textarea` detached.
  await textarea.press("Meta+Enter");
  await textarea.fill("Second captured");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");

  await page.goto("/app/inbox");

  // Both items present. "Newest first" = second appears above first.
  const first = page.getByText("Second captured");
  const second = page.getByText("First captured");
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  // Newest first: second captured should render above first captured.
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox && secondBox && firstBox.y < secondBox.y).toBeTruthy();
});

test("the inbox has a path to triage (review mode)", async ({ page }) => {
  await signupNewUser(page);

  const textarea = await openCapture(page);
  await textarea.fill("Something to decide");
  // Enter = capture + close. The dialog closing is the signal that capture
  // completed (the textarea unmounts, so asserting its value would fail).
  await textarea.press("Enter");
  await expect(
    page.getByRole("dialog", { name: /quick capture/i }),
  ).toBeHidden({ timeout: 5_000 });

  await page.goto("/app/inbox");

  // F6: there must be a way to enter the one-at-a-time review flow.
  await expect(page.getByRole("link", { name: "Triage" }).first()).toBeVisible();
});
