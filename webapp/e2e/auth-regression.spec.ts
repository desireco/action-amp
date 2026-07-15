import { test, expect } from "@playwright/test";
import { signupNewUser } from "./helpers";

/**
 * Auth-gate regression tests.
 *
 * Why these exist: Wasp wraps each *page* in `createAuthRequiredPage`, but
 * `App` is the router layout (the rootElement) and is NOT wrapped. Without a
 * gate in App.tsx, AppShell mounts and stays interactive when the session is
 * stale/null — letting the user fire auth-required actions that 500
 * ("Not authenticated") or 401 ("Invalid credentials"). This regressed once
 * before (commit 0a61944 gated only the query layer, not the action layer).
 *
 * These tests assert the gate holds in two real failure modes. They fail if
 * someone removes the status/!user guard from App.tsx. Each test also watches
 * the network to prove capture never fires an unauthenticated action POST.
 */

// Locally, `/` redirects to `/login` (see RedirectToMarketing.tsx — the
// marketing apex is only used in prod). The gate bounces logged-out /app
// visitors to `/`, which lands on the login page. Assert that heading.
const LANDING_H1 = /welcome back/i;

/** True if a request hits the create-inbox-item action endpoint. */
function isCreateInboxItem(url: string): boolean {
  return url.includes("/operations/create-inbox-item");
}

test.describe("auth gate — stale/absent session must not leave /app interactive", () => {
  test("bogus localStorage token: /app redirects to /, no capture POST", async ({ page }) => {
    // Replicate the real-world desync: a sessionId in localStorage that the
    // server doesn't recognise (post-DB-reset, stale tab, rotated session).
    // addInitScript runs before any app code on every navigation.
    await page.addInitScript(() => {
      localStorage.setItem("wasp:sessionId", "invalid-stale-token-not-in-db");
    });

    // Watch every request so we can prove no auth-required action fires.
    const actionRequests: string[] = [];
    page.on("request", (req) => {
      if (isCreateInboxItem(req.url())) actionRequests.push(req.url());
    });

    await page.goto("/app");

    // The gate must redirect to "/" rather than leaving the user on a broken
    // /app. Generous timeout — the session resolve + redirect takes a moment.
    await expect(page.getByRole("heading", { name: LANDING_H1 })).toBeVisible({
      timeout: 10_000,
    });
    expect(page.url()).not.toMatch(/\/app/);

    // Even if a stale-rendered shell briefly existed, capture must not be
    // reachable. Press the chord and confirm no action POST fires.
    await page.keyboard.press("Meta+K");
    await page.waitForTimeout(500);
    expect(actionRequests).toEqual([]);
  });

  test("after logout, /app redirects to /, no capture POST", async ({ page }) => {
    // Real flow: log in, log out (clearing the real session), then navigate
    // back to /app. The gate must send us to / instead of a broken shell.
    await signupNewUser(page);
    await expect(page).toHaveURL(/\/app/);

    // Log out via the user menu → confirm dialog. Scope the confirm click to
    // the dialog: the trigger button also reads "Log out", so a bare role
    // lookup is ambiguous (strict-mode violation).
    await page.getByRole("button", { name: /log out/i }).first().click();
    await page
      .getByRole("dialog", { name: /log out/i })
      .getByRole("button", { name: /^log out$/i })
      .click();

    // Watch for any capture action after logout.
    const actionRequests: string[] = [];
    page.on("request", (req) => {
      if (isCreateInboxItem(req.url())) actionRequests.push(req.url());
    });

    // Navigate back to /app as if the user hit the back button or pasted URL.
    await page.goto("/app");

    await expect(page.getByRole("heading", { name: LANDING_H1 })).toBeVisible({
      timeout: 10_000,
    });
    expect(page.url()).not.toMatch(/\/app/);

    // Capture must not fire an unauthenticated POST.
    await page.keyboard.press("Meta+K");
    await page.waitForTimeout(500);
    expect(actionRequests).toEqual([]);
  });
});
