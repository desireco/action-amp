import { test, expect } from "@playwright/test";
import { apiPost, loginAs, DEV_EMAIL } from "./helpers";

/**
 * A long link in the focused task's title must not break the focus layout
 * (#17, Jake: "link is actually in focus — it should be shortened like it
 * was already in inbox"). The title wraps (overflow-wrap: anywhere, the
 * inbox row-text rule) and clamps at three lines; the page never gains
 * horizontal overflow at phone widths.
 */

const LONG_URL_TASK =
  "Read https://example.com/some/really/long/path/that/keeps/going/and/never/stops/finally-end?query=1234567890 today";

test("a long link in focus wraps and clamps — no horizontal overflow at 320px", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  const lenses = await apiPost<{ id: string }[]>(page, "/rpc/inbox/lenses");
  const project = await apiPost<{ id: string }>(page, "/rpc/projects/create", {
    name: `Focus link ${Date.now().toString(36)}`,
    lensId: lenses[0]!.id,
  });
  const task = await apiPost<{ id: string }>(page, "/rpc/projects/createTask", {
    description: LONG_URL_TASK,
    lensId: lenses[0]!.id,
    projectId: project.id,
  });
  await apiPost(page, "/rpc/tasks/updateStatus", { id: task.id, status: "TODAY" });
  await apiPost(page, "/rpc/tasks/start", { id: task.id });

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/focus");
  await expect(page.getByRole("heading", { name: /Read https/ })).toBeVisible({
    timeout: 10_000,
  });

  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollW).toBeLessThanOrEqual(overflow.clientW);

  // The actions stayed on-screen under the clamped title.
  await expect(page.getByRole("button", { name: /wrap up/i })).toBeVisible();
});
