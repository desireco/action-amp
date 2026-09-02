import { expect, test, type Page } from "@playwright/test";
import { DEV_EMAIL, apiPost, loginAs } from "./helpers";

/**
 * Triage — ported from webapp/e2e/triage.spec.ts (S3; P0 notes:
 * packages/contract/src/s3-inbox-triage/README.md). The four kept behaviors:
 * the #project token preselect, becomes-a-Project naming, the
 * resource-parent commit gate, and Archive's losslessness.
 *
 * Selector/landing adaptations for the mid-switch stack (the P0 "stale e2e"
 * note — port the BEHAVIORS, not the old selectors):
 *  - The wizard has no Archive row (removed upstream in 001ae76); the archive
 *    behavior is exercised at the wire (the decision remains fully
 *    server-supported) and its on-screen Logbook assertions land with S8.
 *  - Project/checklist landing pages (/do/projects, /do/upcoming) belong to
 *    S4/S5; where a landing surface does not exist yet the spec asserts the
 *    dispatch response kind + the created record through the wire. The
 *    Upcoming landing asserts on-screen (S4 is live).
 *  - Tests share the seeded dev user (seed-inbox.ts: Me lens with
 *    General/Briefs/Groceries + a PRO grant for project-cap headroom), so
 *    each test drains the queue through the wire first.
 */

const SEED_TEXTS = [
  "Outline the launch announcement",
  "Sketch the triage walkthrough notes",
];

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

/** Empty the queue via the wire so a test owns the whole walkthrough. */
async function drainInbox(page: Page): Promise<void> {
  const items = await apiPost<InboxItemDto[]>(page, "/rpc/inbox/list");
  for (const item of items) {
    await apiPost<TriageResultDto>(page, "/rpc/inbox/triage", {
      inboxItemId: item.id,
      decision: "delete",
    });
  }
}

/** Capture one item through the ⌘K popover and close it. */
async function capture(page: Page, text: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /quick capture/i });
  const alreadyOpen = await dialog.isVisible().catch(() => false);
  const textarea = alreadyOpen
    ? dialog.getByRole("textbox", { name: "Capture" })
    : await openCapture(page);
  await textarea.fill(text);
  await textarea.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 5_000 });
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

/** Walk to /do/inbox/review and wait for the item's text on the card. */
async function openReview(page: Page, text: string): Promise<void> {
  await page.goto("/do/inbox/review");
  // .first(): a resolved project destination renders the capture text twice
  // (card body + "Destination: <name> · <lens>" banner).
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Click the commit button and wait for triage to ACTUALLY settle — the exit
 * animation fires before the server resolves (webapp helpers.ts commitTriage).
 * Returns the parsed dispatch response (kind pins what was created).
 */
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
  if (res) {
    expect(res.ok()).toBeTruthy();
  }
  await expect(page.getByText(text)).toHaveCount(0, { timeout: 10_000 });
  return res ? ((await res.json()).json as TriageResultDto) : null;
}

async function readyButton(page: Page) {
  return page.getByRole("button", { name: /^ready$/i });
}

test("a #project capture token preselects the project link (type stays Task)", async ({
  page,
}) => {
  // Regression guard (TRIAGE.md §7.5 — link, don't create): #briefs means
  // "this task belongs to that project". The seed created a uniquely-named
  // Me-lens project so the resolver pins unambiguously (the seeded "General"
  // would be ambiguous across lenses).
  await loginAs(page, DEV_EMAIL);
  await drainInbox(page);
  await page.goto("/do/inbox");

  // Unique per run — the shared dev user accumulates filed tasks.
  const brief = `Draft the brief ${Date.now().toString(36)}`;
  // The #token opens the autocomplete; the first Enter accepts the
  // suggestion (closing the menu), the second submits the capture.
  const textarea = await openCapture(page);
  await textarea.fill(`${brief} #briefs`);
  // The resolver prefetch races the fill — wait for the dropdown, then
  // Enter accepts the suggestion and a second Enter submits the capture.
  await page
    .getByRole("listbox", { name: "Projects" })
    .waitFor({ state: "visible", timeout: 10_000 });
  await textarea.press("Enter"); // accept the suggestion
  await textarea.press("Enter"); // submit the capture
  await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeHidden();

  await openReview(page, brief);

  // Task is the default type (key 1); Enter advances to Spec.
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Specify the task")).toBeVisible({ timeout: 10_000 });

  // Ready files it under Briefs with no manual project selection.
  const result = await commitTriage(page, await readyButton(page), brief);
  expect(result?.kind).toBe("task");
  await expect(page.getByText("Inbox zero.")).toBeVisible({ timeout: 10_000 });

  // Landed under the Briefs project in the Me lens (the free-included lens
  // the tasks list reads) — the wire view of the project-detail row.
  const tasks = await apiPost<TaskDto[]>(page, "/rpc/tasks/list");
  expect(tasks.map((t) => t.description)).toContain(brief);
});

test("becoming a Project uses the item text as the name", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);
  await drainInbox(page);
  await page.goto("/do/inbox");

  // Unique per run AND free of substrings that could free-text-match an
  // accumulated project (a match routes the capture into a destination
  // banner instead of the "becomes a new project" path under test).
  const text = `Zephyr quilt ${Date.now().toString(36)}`;
  await capture(page, text);
  await openReview(page, text);

  // "4" selects Project; Enter advances to Spec; Ready commits.
  await expect(
    page.getByRole("button", { name: /Project an outcome needing more than one step/ }),
  ).toBeVisible();
  await page.keyboard.press("4");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Specify the project")).toBeVisible({ timeout: 10_000 });

  const result = await commitTriage(page, await readyButton(page), text);
  expect(result?.kind).toBe("project");
  await expect(page.getByText("Inbox zero.")).toBeVisible({ timeout: 10_000 });

  // The created project's name IS the capture text — the resolver source (a
  // cross-lens read) is the wire view of the projects page until S5 composes.
  const projects = await apiPost<{ name: string }[]>(page, "/rpc/inbox/projectsForResolver");
  expect(projects.map((p) => p.name)).toContain(text);

  // The queue drained — the inbox is clear.
  await page.goto("/do/inbox");
  await expect(page.getByText(/inbox clear/i)).toBeVisible();
});

test("becoming a Resource requires a parent before Ready", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);
  await drainInbox(page);
  await page.goto("/do/inbox");

  const text = "Competitor pricing PDF";
  await capture(page, text);
  await openReview(page, text);

  await expect(page.getByRole("button", { name: /Resource a link or reference/ })).toBeVisible();
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expect(page.getByText("File the resource")).toBeVisible({ timeout: 10_000 });

  // Commit is disabled until a parent is chosen: the parent chip shows
  // "Pick project…" when unset; clicking it opens the "File resource under…"
  // bottom sheet.
  const commit = await readyButton(page);
  await expect(commit).toBeDisabled();

  const parentChip = page.getByRole("button", { name: /^parent:/i });
  await parentChip.click();
  await page
    .locator(".aa-picker-sheet__item")
    .filter({ hasText: "General" })
    .first()
    .click();
  await expect(commit).toBeEnabled();

  const result = await commitTriage(page, commit, text);
  expect(result?.kind).toBe("project"); // resource reports `project` for now
  await expect(page.getByText("Inbox zero.")).toBeVisible({ timeout: 10_000 });
});

test("Archive keeps the note — it leaves the inbox and Restore returns it", async ({
  page,
}) => {
  // The wizard's type chooser no longer exposes an Archive row (removed
  // upstream); the decision remains fully server-supported, so the lossless
  // round-trip is exercised at the wire. The Logbook's Restore UI lands
  // with S8 — until then restoreArchivedItem is the same seam the button
  // calls.
  await loginAs(page, DEV_EMAIL);
  await drainInbox(page);
  await page.goto("/do/inbox");

  const text = "Decline this for now";
  await capture(page, text);
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });

  const items = await apiPost<InboxItemDto[]>(page, "/rpc/inbox/list");
  const target = items.find((i) => i.text === text);
  expect(target).toBeDefined();

  // Not actionable anywhere — it leaves the inbox without becoming work.
  const archived = await apiPost<TriageResultDto>(page, "/rpc/inbox/triage", {
    inboxItemId: target!.id,
    decision: "archive",
  });
  expect(archived.kind).toBe("archive");
  await page.reload();
  await expect(page.getByText(/inbox clear/i)).toBeVisible();
  const afterArchive = await apiPost<InboxItemDto[]>(page, "/rpc/inbox/list");
  expect(afterArchive.map((i) => i.text)).not.toContain(text);

  // …and it is NOT lost — restoring returns it to the inbox for re-triage.
  await apiPost<{ id: string }>(page, "/rpc/inbox/restore", {
    inboxItemId: target!.id,
  });
  await page.reload();
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });

  // Clean up.
  await apiPost(page, "/rpc/inbox/triage", {
    inboxItemId: target!.id,
    decision: "delete",
  });
  void SEED_TEXTS;
});
