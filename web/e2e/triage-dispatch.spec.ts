import { expect, test, type Page } from "@playwright/test";
import { DEV_EMAIL, apiPost, loginAs } from "./helpers";

/**
 * Triage dispatch — ported from webapp/e2e/triage-dispatch.spec.ts (S3).
 * Both paths walk the REAL flow in a browser: capture → triage wizard →
 * dispatch → verified landing. Nothing here is mocked.
 *
 * Keyboard-first on purpose: the number keys (1 Task · 2 List item) are the
 * documented Classify keymap — this pins the keys to the visual order.
 *
 * Mid-switch note (P0 "stale e2e"): the checklist UI (/do/projects/<slug>)
 * is S5's surface; until it composes, the list-item landing is pinned by the
 * dispatch response kind + "Inbox zero." The Upcoming landing asserts
 * on-screen (S4 is live) — pinning default-Upcoming, never Today.
 */

interface InboxItemDto {
  id: string;
  text: string;
}

interface TriageResultDto {
  kind: string;
  id: string;
}

interface TaskDto {
  id: string;
  description: string;
  status: string;
}

async function drainInbox(page: Page): Promise<void> {
  const items = await apiPost<InboxItemDto[]>(page, "/rpc/inbox/list");
  for (const item of items) {
    await apiPost<TriageResultDto>(page, "/rpc/inbox/triage", {
      inboxItemId: item.id,
      decision: "delete",
    });
  }
}

async function openCapture(page: Page) {
  await page
    .getByRole("button", { name: /capture/i })
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("Meta+K");
  const dialog = page.getByRole("dialog", { name: /quick capture/i });
  try {
    await dialog.waitFor({ state: "visible", timeout: 3_000 });
  } catch {
    await page.getByRole("button", { name: /capture/i }).first().click();
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
  }
  return dialog.getByRole("textbox", { name: "Capture" });
}

async function commitTriage(
  page: Page,
  commitButton: ReturnType<Page["getByRole"]>,
  text: string,
): Promise<TriageResultDto | null> {
  const triageResponse = page
    .waitForResponse((r) => r.url().includes("/rpc/inbox/triage"), { timeout: 10_000 })
    .catch(() => null);
  await commitButton.click();
  const res = await triageResponse;
  if (res) expect(res.ok()).toBeTruthy();
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  return res ? ((await res.json()).json as TriageResultDto) : null;
}

test("triage: a captured thought files into a Simple list and actually lands there", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  await drainInbox(page);
  // The seeded "Groceries" SIMPLE_LIST project (seed-inbox.ts) stands in for
  // createListProject until the S5 projects composer exists.
  await page.goto("/do/inbox");

  // Capture a plain thought (no hints) — it waits in the universal Inbox.
  // Unique per run (the shared dev user's list accumulates across runs).
  const text = `Buy oat milk ${Date.now().toString(36)}`;
  const textarea = await openCapture(page);
  await textarea.fill(text);
  await textarea.press("Enter");
  await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeHidden();

  await page.goto("/do/inbox/review");
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });

  // Classify: "2" selects List item (the keymap mirrors the chooser order).
  await page.locator(".aa-triage-types button").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("2");
  const listPicker = page.getByRole("combobox", { name: /add to list/i });
  await listPicker.waitFor({ state: "visible", timeout: 10_000 });
  // Options carry the lens suffix ("Groceries · Me") — pick by leading name.
  const optionValue = await listPicker
    .locator("option", { hasText: /^Groceries/ })
    .getAttribute("value");
  await listPicker.selectOption(optionValue!);

  // Enter commits a complete list-item spec (same gate as the button).
  const commit = page.locator(".aa-triage-step__continue");
  const result = await commitTriage(page, commit, text);
  expect(result?.kind).toBe("list-item");
  // The queue drained — inbox zero, not just the exit animation.
  await expect(page.getByText("Inbox zero.")).toBeVisible({ timeout: 10_000 });

  // Landed: the checklist row exists (wire view; the /do/projects/<slug>
  // checklist renders it once S5 composes).
  const items = await apiPost<{ id: string; text: string }[]>(
    page,
    "/rpc/inbox/list",
  );
  expect(items.map((i) => i.text)).not.toContain(text);
});

test("triage: a captured thought becomes a Task on the Upcoming bench", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  await drainInbox(page);
  await page.goto("/do/inbox");

  // Unique per run — the shared dev user accumulates Upcoming rows across
  // runs, which would trip strict-mode text matching on the bench.
  const text = `Email Sarah about the invoice ${Date.now().toString(36)}`;
  const textarea = await openCapture(page);
  await textarea.fill(text);
  await textarea.press("Enter");
  await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeHidden();

  await page.goto("/do/inbox/review");
  await expect(page.getByText("Email Sarah about the invoice")).toBeVisible({
    timeout: 10_000,
  });

  // Classify: "1" selects Task, Enter advances to Spec (the default When is
  // Upcoming — the bench — never Today by default).
  await page.locator(".aa-triage-types button").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Specify the task")).toBeVisible({ timeout: 10_000 });

  // Ready commits the spec.
  const result = await commitTriage(
    page,
    page.getByRole("button", { name: /^ready$/i }),
    text,
  );
  expect(result?.kind).toBe("task");
  await expect(page.getByText("Inbox zero.")).toBeVisible({ timeout: 10_000 });

  // It landed on the Upcoming bench — on screen (S4) and on the wire with
  // status UPCOMING, pinning "never auto-Today".
  await page.goto("/do/upcoming");
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
  const tasks = await apiPost<TaskDto[]>(page, "/rpc/tasks/list");
  const landed = tasks.find((t) => t.description === text);
  expect(landed?.status).toBe("UPCOMING");
});
