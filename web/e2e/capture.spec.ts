import { expect, test, type Page } from "@playwright/test";
import { DEV_EMAIL, loginAs } from "./helpers";

/**
 * Capture — ported from webapp/e2e/capture.spec.ts (S2). See the P0 notes
 * (packages/contract/src/s2-capture/README.md): the cross-layer bits are the
 * global ⌘K wiring and the Enter vs ⌘Enter commit semantics. NL-chip parsing
 * is pinned by the domain parser suite (66 cases); inbox landing by
 * triage.spec.ts.
 *
 * The overlay is global (⌘K works everywhere once the integrator mounts it in
 * +layout.svelte); until that line lands, the S2/S3 route pages mount it — so
 * the spec runs from /inbox.
 */

/** Open the capture popover: ⌘K first (the spec under test), FAB fallback. */
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
    // Shortcut didn't register — use the visible button. NOT a fallback for
    // the test that asserts the shortcut itself; that one presses the key.
    await page.getByRole("button", { name: /capture/i }).first().click();
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
  }
  const textarea = dialog.getByRole("textbox", { name: "Capture" });
  await textarea.waitFor({ state: "visible", timeout: 5_000 });
  return textarea;
}

test("⌘K opens the capture popover", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);
  await page.goto("/inbox");
  // Focus the document so the global key handler receives the event.
  await page.locator("body").click();

  await page.keyboard.press("Meta+K");

  await expect(page.getByRole("dialog", { name: /quick capture/i })).toBeVisible({
    timeout: 5_000,
  });
});

test("⌘Enter keeps the popover open (rapid-fire); Enter commits and closes", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  await page.goto("/inbox");

  // ⌘Enter = add another: stays open, input clears, focus retained.
  const textarea = await openCapture(page);
  await textarea.fill("Email Sarah");
  await textarea.press("Meta+Enter");
  const dialog = page.getByRole("dialog", { name: /quick capture/i });
  await expect(dialog).toBeVisible();
  await expect(textarea).toHaveValue("");
  await expect(textarea).toBeFocused();

  // Enter = capture + close (commit this one and get back to work).
  await textarea.fill("One thing on my mind");
  await textarea.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 5_000 });
});

/** A 1×1 transparent PNG — the smallest valid image the intake accepts. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("attach an image from the capture popover; it lands on the inbox row", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  await page.goto("/inbox");
  const textarea = await openCapture(page);
  await textarea.fill("Whiteboard sketch");

  const dialog = page.getByRole("dialog", { name: /quick capture/i });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "sketch.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(dialog.getByRole("img", { name: "sketch.png" })).toBeVisible();

  await textarea.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 5_000 });

  // The saved item carries the inbox row's media cover — the bytes
  // round-tripped through the S12 attachment contract.
  const row = page
    .locator(".aa-inbox__item", { hasText: "Whiteboard sketch" })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator(".aa-attach-cover")).toBeVisible();
});

test("a staged image can be removed before saving", async ({ page }) => {
  await loginAs(page, DEV_EMAIL);
  await page.goto("/inbox");
  const textarea = await openCapture(page);
  await textarea.fill("Receipt to file");

  const dialog = page.getByRole("dialog", { name: /quick capture/i });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(dialog.getByRole("img", { name: "receipt.png" })).toBeVisible();
  await dialog.getByRole("button", { name: "Remove receipt.png" }).click();
  await expect(dialog.getByRole("img", { name: "receipt.png" })).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Attach images" })).toBeEnabled();

  // The capture still saves — text-only again after the removal.
  await textarea.press("Enter");
  await expect(dialog).toBeHidden({ timeout: 5_000 });
});

/** Dispatch a synthetic paste carrying files (screenshots land this way). */
async function pasteFiles(el: Element, name: string, png: Buffer) {
  await el.evaluate(
    (node, { name, bytes }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(bytes)], name, { type: "image/png" }));
      node.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { name, bytes: Array.from(png) },
  );
}

/** Dispatch a synthetic plain-text paste (no files on the payload). */
async function pasteText(el: Element, text: string) {
  await el.evaluate((node, text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

test("pasting an image stages it; a plain-text paste stages nothing", async ({
  page,
}) => {
  await loginAs(page, DEV_EMAIL);
  await page.goto("/inbox");
  const textarea = await openCapture(page);
  const dialog = page.getByRole("dialog", { name: /quick capture/i });

  await pasteFiles(textarea, "pasted.png", PNG_1X1);
  await expect(dialog.getByRole("img", { name: "pasted.png" })).toBeVisible();

  // Text-only payload: the handler steps aside — no extra thumb, no error.
  await pasteText(textarea, "just words");
  await expect(dialog.locator(".aa-capture__attachment")).toHaveCount(1);
  await expect(dialog.getByRole("alert")).toBeHidden();
});
