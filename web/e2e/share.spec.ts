import { expect, test, type Page } from "@playwright/test";

import { DEV_EMAIL, apiPost, loginAs } from "./helpers";

/**
 * S12 — the PWA share-target flow. Covers the page flow + the /api/share
 * wire behaviors at the same origin (the vite proxy forwards /api to the
 * Hono server). Ported from the webapp's share posture; the e2e is new (the
 * webapp pinned the route in unit tests, ported to api/src/share.test.ts).
 *
 * Push DELIVERY itself (a real server → browser notification) needs a
 * browser-grant + VAPID harness — V1/manual; the loop's invariants are
 * unit-pinned in api/src/push.test.ts and
 * packages/domain/src/notifications/operationsCore.test.ts.
 *
 * The share POST is a TOP-LEVEL form navigation in production (the installed
 * PWA's share activity): it carries the wasp_session cookie and NO custom
 * headers. page.request replicates that shape — cookies from the context
 * jar, no x-requested-with — which is exactly why the route does its own
 * cookie-only session lift instead of the /rpc CSRF wrapper.
 */

const SHARE_EMAIL = "s12-share@test.local";

/**
 * The two navigation-based tests (SW stash + review page) ride the SEEDED
 * dev user: a freshly dev-login'd user is un-onboarded, and S13's gate
 * would redirect "/" → /welcome mid-test (destroying in-page evaluates).
 * The wire-level tests keep the dedicated share account.
 */

interface InboxItemDto {
  id: string;
  text: string;
}

/** Wait until the PWA service worker controls the page (registered app-wide
 *  by the layout, or explicitly below). */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    // First-ever install: the worker activates but doesn't control this
    // already-loaded page until claimed (the SW calls clients.claim()).
    await new Promise<void>((resolve) => {
      if (navigator.serviceWorker.controller) return resolve();
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => resolve(),
        { once: true },
      );
      void registration.update();
    });
  });
}

/**
 * Load a page and wait until the PWA worker controls it. The layout reloads
 * only on a REAL update activation (first-ever install claims the page
 * silently — webapp useServiceWorkerUpdate parity), so a single settled
 * load is stable for in-page evaluates.
 */
async function loadControlledPage(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await waitForServiceWorker(page);
}

test.describe("share target (S12)", () => {
  test("manifest registers the Android image share intent + the app icons", async ({
    request,
  }) => {
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as {
      name: string;
      start_url: string;
      display: string;
      share_target: {
        action: string;
        method: string;
        enctype: string;
        params: { files: { accept: string[] }[] };
      };
    };
    expect(manifest.name).toBe("ActionAmp");
    // The PWA launches at the explicit home URL, not the redirect shim.
    expect(manifest.start_url).toBe("/next");
    expect(manifest.display).toBe("standalone");
    expect(manifest.share_target.action).toBe("/share");
    expect(manifest.share_target.method).toBe("POST");
    expect(manifest.share_target.enctype).toBe("multipart/form-data");
    // The generic image/* MIME intent (Android's picker key) + specific types.
    expect(manifest.share_target.params.files[0]?.accept).toContain("image/*");
  });

  test("POST /api/share logged out → 303 /login (cookie-only auth, no CSRF header)", async ({
    request,
  }) => {
    const res = await request.post("/api/share", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      form: { title: "X", url: "https://x.com" },
      // The route answers 303 — stop Playwright from following it.
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toBe("/login");
  });

  test("POST /api/share blank fields → 303 /share?error=empty", async ({ page }) => {
    await loginAs(page, SHARE_EMAIL);
    const res = await page.request.post("/api/share", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      form: { title: "   " },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toBe("/share?error=empty");
  });

  test("POST /api/share saves the composed capture → 303 /share?id=…", async ({
    page,
  }) => {
    await loginAs(page, SHARE_EMAIL);
    const res = await page.request.post("/api/share", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      form: { title: "Cool page", url: "https://example.com/article" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    const location = res.headers()["location"] ?? "";
    expect(location).toMatch(/^\/share\?id=/);
    const createdId = decodeURIComponent(location.split("id=")[1] ?? "");
    expect(createdId).not.toBe("");

    // The item landed in the inbox through createInboxItemCore, composed as
    // "Title — url".
    const items = await apiPost<InboxItemDto[]>(page, "/rpc/inbox/list");
    const created = items.find((item) => item.id === createdId);
    expect(created?.text).toBe("Cool page — https://example.com/article");
  });

  test("POST /api/share?response=json returns the SW bridge redirect", async ({
    page,
  }) => {
    await loginAs(page, SHARE_EMAIL);
    const res = await page.request.post("/api/share?response=json", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      form: { url: "https://x.com" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({
      redirect: expect.stringMatching(/^\/share\?id=/),
    });
  });

  test("direct-route error outcomes render the webapp's exact copy", async ({
    page,
  }) => {
    // First load registers the app-wide service worker; wait for it to
    // control the page before the goto sequence (the first-install
    // clients.claim() otherwise races an in-flight navigation).
    await page.goto("/");
    await waitForServiceWorker(page);

    await page.goto("/share");
    await expect(
      page.getByText("Couldn't find that capture."),
    ).toBeVisible();

    await page.goto("/share?error=empty");
    await expect(page.getByText("Nothing to capture.")).toBeVisible();

    await page.goto("/share?error=server");
    await expect(page.getByText("Capture failed — try again.")).toBeVisible();

    await page.goto("/share?pending=not-a-real-id");
    await expect(
      page.getByText("Couldn't find that capture."),
    ).toBeVisible();
  });

  /** The service-worker half of the OS share handoff: the same-origin POST
   *  /share the share activity performs (a fetch with redirect:"manual"
   *  observes the SW's 303 without navigating the harness page), then the
   *  stashed pending record is read straight out of IndexedDB. */
  async function stashOsShare(
    page: Page,
    fields: Record<string, string>,
  ): Promise<string> {
    await page.evaluate((payload) => {
      const body = new FormData();
      for (const [key, value] of Object.entries(payload)) body.set(key, value);
      return fetch("/share", { method: "POST", body, redirect: "manual" }).then(
        (res) => {
          // The SW answers Response.redirect(..., 303): through fetch with
          // redirect:"manual" that surfaces as an opaqueredirect (status 0).
          if (res.type !== "opaqueredirect" && res.status !== 0) {
            throw new Error(
              `SW did not intercept the share POST (type=${res.type} status=${res.status})`,
            );
          }
        },
      );
    }, fields);
    const pending = await page.evaluate(
      () =>
        new Promise<{ id: string; fields: Record<string, string>; createdAt: number }[]>(
          (resolve, reject) => {
            const open = indexedDB.open("actionamp-share", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result;
              const req = db
                .transaction("pending", "readonly")
                .objectStore("pending")
                .getAll();
              req.onsuccess = () => {
                resolve(
                  req.result as {
                    id: string;
                    fields: Record<string, string>;
                    createdAt: number;
                  }[],
                );
                db.close();
              };
              req.onerror = () => reject(req.error);
            };
          },
        ),
    );
    pending.sort((a, b) => a.createdAt - b.createdAt);
    const latest = pending[pending.length - 1];
    expect(latest).toBeDefined();
    return latest!.id;
  }

  test("service worker stashes the OS share POST, review page confirms into the Inbox", async ({
    page,
  }) => {
    await loginAs(page, DEV_EMAIL);
    await loadControlledPage(page);

    // The OS share activity navigates: POST /share (multipart in production;
    // urlencoded fields exercise the same SW stash + 303 handoff).
    const pendingId = await stashOsShare(page, {
      title: "E2E shared article",
      text: "Read this later, maybe over coffee",
      url: "https://example.com/e2e-share",
    });
    expect(pendingId).not.toBe("");

    // The handoff: the review page reads the stash and pre-fills.
    await page.goto(`/share?pending=${encodeURIComponent(pendingId)}`);
    await expect(page.getByText("Keep this for later.")).toBeVisible();
    await expect(page.locator(".aa-share__title-input")).toHaveValue(
      "E2E shared article",
    );
    await expect(page.locator(".aa-share__description-input")).toHaveValue(
      "Read this later, maybe over coffee",
    );
    await expect(page.locator(".aa-share__source-label")).toHaveText("Source");
    await expect(
      page.getByText("example.com/e2e-share"),
    ).toBeVisible();
    // Default destination is the Inbox ("decide later").
    await expect(page.locator(".aa-share__button")).toContainText("Add to Inbox");

    // Confirm → the normal authenticated capture op → the inbox, highlighted.
    await page.locator(".aa-share__button").click();
    await expect(page).toHaveURL(/\/inbox\?item=/, { timeout: 15_000 });
    const itemId = decodeURIComponent(
      new URL(page.url()).searchParams.get("item") ?? "",
    );
    const items = await apiPost<InboxItemDto[]>(page, "/rpc/inbox/list");
    const created = items.find((item) => item.id === itemId);
    expect(created?.text).toBe(
      "E2E shared article: Read this later, maybe over coffee — https://example.com/e2e-share",
    );

    // Confirm consumed the stash — the pending store is empty again.
    const remaining = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open("actionamp-share", 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const req = db.transaction("pending", "readonly").objectStore("pending").count();
            req.onsuccess = () => {
              resolve(req.result);
              db.close();
            };
            req.onerror = () => reject(req.error);
          };
        }),
    );
    expect(remaining).toBe(0);
  });

  test("review page 'Not now' discards the stash and goes home", async ({
    page,
  }) => {
    await loginAs(page, DEV_EMAIL);
    await loadControlledPage(page);

    const pendingId = await stashOsShare(page, {
      url: "https://example.com/discard-me",
    });
    expect(pendingId).not.toBe("");

    await page.goto(`/share?pending=${encodeURIComponent(pendingId)}`);
    await expect(page.getByText("Keep this for later.")).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page).toHaveURL(/\/next$/);
    // The stash row is gone.
    const count = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open("actionamp-share", 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const req = db
              .transaction("pending", "readonly")
              .objectStore("pending")
              .count();
            req.onsuccess = () => {
              resolve(req.result);
              db.close();
            };
            req.onerror = () => reject(req.error);
          };
        }),
    );
    expect(count).toBe(0);
  });

  test("bookmarklet query handoff: ?title=&text=&url= prefills and confirms into the Inbox", async ({
    page,
  }) => {
    await loginAs(page, DEV_EMAIL);
    await page.goto(
      "/share?title=E2E%20bookmarklet&text=Selected%20note&url=https%3A%2F%2Fexample.com%2Fbm",
    );

    // Same review page as the OS share, prefilled from the query.
    await expect(page.getByText("Keep this for later.")).toBeVisible();
    await expect(page.locator(".aa-share__title-input")).toHaveValue(
      "E2E bookmarklet",
    );
    await expect(page.locator(".aa-share__description-input")).toHaveValue(
      "Selected note",
    );
    await expect(page.getByText("example.com/bm")).toBeVisible();
    await expect(page.locator(".aa-share__button")).toContainText("Add to Inbox");

    // Confirm → the normal authenticated capture op → the inbox.
    await page.locator(".aa-share__button").click();
    await expect(page).toHaveURL(/\/inbox\?item=/, { timeout: 15_000 });
    const itemId = decodeURIComponent(
      new URL(page.url()).searchParams.get("item") ?? "",
    );
    const items = await apiPost<InboxItemDto[]>(page, "/rpc/inbox/list");
    const created = items.find((item) => item.id === itemId);
    expect(created?.text).toBe(
      "E2E bookmarklet: Selected note — https://example.com/bm",
    );
  });

  test("bookmarklet handoff blank fields → 'Nothing to capture.'; bare /share unchanged", async ({
    page,
  }) => {
    // Render-only outcomes: the error cards render logged out (same as the
    // direct-route outcomes test above).
    await page.goto("/share?title=%20%20");
    await expect(page.getByText("Nothing to capture.")).toBeVisible();

    await page.goto("/share");
    await expect(page.getByText("Couldn't find that capture.")).toBeVisible();
  });

  test("preferences surfaces the bookmarklet install — drag link targets this origin", async ({
    page,
  }) => {
    await loginAs(page, DEV_EMAIL);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/settings/preferences");

    await expect(
      page.getByRole("heading", { name: "Browser bookmarklet" }),
    ).toBeVisible();

    // The drag link is the one-liner targeting THIS origin (dev → localhost,
    // prod → app.actionamp.com) — never a hardcoded host.
    const href =
      (await page.locator(".aa-bookmarklet__drag").getAttribute("href")) ?? "";
    const origin = await page.evaluate(() => location.origin);
    expect(href.startsWith("javascript:")).toBe(true);
    expect(href).toContain(`${origin}/share?`);

    // The copy fallback puts the same one-liner on the clipboard.
    await page.getByRole("button", { name: "Copy code" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(href);

    // The after-save choice persists through the contract op (inbox default).
    await expect(
      page.getByRole("radio", { name: "Triage now — open the Inbox" }),
    ).toBeChecked();
    await page.getByRole("radio", { name: "Just close this tab" }).click();
    await expect(
      page.getByRole("radio", { name: "Just close this tab" }),
    ).toBeChecked({ timeout: 10_000 });
    const prefsRow = await apiPost<{ shareAfterSave: string }>(
      page,
      "/rpc/prefs/getPreferences",
    );
    expect(prefsRow.shareAfterSave).toBe("close");
    await page.getByRole("radio", { name: "Triage now — open the Inbox" }).click();
    await expect(
      page.getByRole("radio", { name: "Triage now — open the Inbox" }),
    ).toBeChecked({ timeout: 10_000 });
  });

  test("after-save 'close' preference closes the share tab on confirm", async ({
    page,
  }) => {
    await loginAs(page, DEV_EMAIL);
    // Flip the pref straight through the contract op (the settings control is
    // covered above); restored in the finally so other tests keep the default.
    await apiPost(page, "/rpc/prefs/saveShareAfterSave", { value: "close" });
    try {
      // The real bookmarklet opens the review tab with window.open from a
      // real page (a script-opened tab is the only kind window.close() may
      // shut — a goto-opened page ignores close() and the fallback goes
      // home instead). The opener must be ON a page: from about:blank the
      // relative /share URL never resolves.
      await page.goto("/");
      const popupPromise = page.context().waitForEvent("page");
      await page.evaluate(
        (url) => window.open(url),
        "/share?title=E2E%20close&text=tab&url=https%3A%2F%2Fexample.com%2Fclose",
      );
      const popup = await popupPromise;
      await expect(
        popup.getByText("Keep this for later."),
      ).toBeVisible({ timeout: 15_000 });
      await popup.locator(".aa-share__button").click();
      await popup.waitForEvent("close", { timeout: 15_000 });
    } finally {
      await apiPost(page, "/rpc/prefs/saveShareAfterSave", { value: "inbox" });
    }
  });
});
