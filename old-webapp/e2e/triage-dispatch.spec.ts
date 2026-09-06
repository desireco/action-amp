import { test, expect } from "@playwright/test";
import { signupNewUser, openCapture, commitTriage, createListProject } from "./helpers";

/**
 * Triage dispatch — the integration contract between the wizard and the
 * server (docs/specs/simple-list-projects.md). Both paths walk the REAL
 * flow in a browser: capture → triage wizard → dispatch → verified landing.
 * Nothing here is mocked; if the op 500s, the keymap desyncs, or the item
 * fails to land where the wizard said it would, this spec fails.
 *
 * Keyboard-first on purpose: the number keys (1 Task · 2 List item) are the
 * documented Classify keymap — this pins the keys to the visual order.
 */

test("triage: a captured thought files into a Simple list and actually lands there", async ({ page }) => {
  await signupNewUser(page);
  await createListProject(page, "Groceries");

  // Capture a plain thought (no hints) — it waits in the universal Inbox.
  const textarea = await openCapture(page);
  await textarea.fill("Buy oat milk");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/do/inbox/review");
  await expect(page.getByText("Buy oat milk")).toBeVisible({ timeout: 10_000 });

  // Classify: "2" selects List item (the keymap mirrors the chooser order).
  await page.locator(".aa-triage-types button").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("2");
  const listPicker = page.getByRole("combobox", { name: /add to list/i });
  await listPicker.waitFor({ state: "visible", timeout: 10_000 });
  // Options carry the lens suffix ("Groceries · Me") — pick by leading name.
  const optionValue = await listPicker.locator("option", { hasText: /^Groceries/ }).getAttribute("value");
  await listPicker.selectOption(optionValue!);

  // Enter commits a complete list-item spec (same gate as the button).
  await commitTriage(page, page.locator(".aa-triage-step__continue"), "Buy oat milk");
  // The queue drained — inbox zero, not just the exit animation.
  await expect(page.getByText("Inbox zero.")).toBeVisible({ timeout: 10_000 });

  // It landed: the checklist row exists at the project URL.
  await page.goto("/do/projects/groceries");
  await expect(page.getByRole("checkbox", { name: /check buy oat milk/i })).toBeVisible({ timeout: 10_000 });
});

test("triage: a captured thought becomes a Task on the Upcoming bench", async ({ page }) => {
  await signupNewUser(page);

  const textarea = await openCapture(page);
  await textarea.fill("Email Sarah about the invoice");
  await textarea.press("Enter");
  await page.keyboard.press("Escape");
  await page.goto("/do/inbox/review");
  await expect(page.getByText("Email Sarah about the invoice")).toBeVisible({ timeout: 10_000 });

  // Classify: "1" selects Task, Enter advances to Spec (the default When is
  // Upcoming — the bench — never Today by default).
  await page.locator(".aa-triage-types button").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/2 · Specify/i)).toBeVisible({ timeout: 10_000 });

  // Ready commits the spec.
  await commitTriage(page, page.getByRole("button", { name: /^ready$|^complete$/i }), "Email Sarah about the invoice");
  await expect(page.getByText("Inbox zero.")).toBeVisible({ timeout: 10_000 });

  // It landed: the task shows on Upcoming.
  await page.goto("/do/upcoming");
  await expect(page.getByText("Email Sarah about the invoice")).toBeVisible({ timeout: 10_000 });
});
