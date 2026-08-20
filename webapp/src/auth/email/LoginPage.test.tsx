import { describe, expect, it, beforeAll } from "vitest";
import { screen, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * LoginPage redirect regression test.
 *
 * A logged-in user hitting /login (browser back, stale bookmark, the dev
 * autologin just finished) should land on /do, not see the login form.
 * The fix lives in LoginPage.tsx: a `useAuth` check + `<Navigate to="/do">`
 * after the session resolves. These tests fail the moment someone removes
 * the redirect — the form renders instead of the redirect marker.
 *
 * Note: like App.test.tsx, this mocks useAuth directly (renderInContext
 * hardcodes a real query client + BrowserRouter; we need neither here).
 */

// LoginPage's footer renders `v{__APP_VERSION__}` (a Vite build-time define).
// The test harness doesn't inject it (same gap App.test.tsx works around by
// not rendering AppShell chrome). Stub it globally before the page mounts.
beforeAll(() => {
  // SAFETY: __APP_VERSION__ is a Vite build-time global the test harness
  // doesn't inject; casting globalThis once to stub it.
  (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = "test";
});

// No module mocking: the auth state is injected through the page's explicit
// `deps` seam (see PasswordlessAuthPage.tsx). The real useAuth() still runs
// under the QueryClientProvider below; its value is ignored while deps is set.
import { LoginPage } from "./LoginPage";
import type { PasswordlessAuthDeps } from "./PasswordlessAuthPage";

/** A marker rendered at /do so we can assert the redirect target. */
function AppMarker() {
  return <div data-testid="app-marker">app page</div>;
}

function renderAt(
  initialPath: string,
  authData: PasswordlessAuthDeps["authData"],
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage deps={{ authData }} />} />
          <Route path="/do" element={<AppMarker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LoginPage redirect on existing session", () => {
  it("renders the form while the session is still resolving (no flash)", () => {
    renderAt("/login", { data: null, status: "loading" });
    // No redirect yet — the form is what the user sees.
    expect(screen.queryByTestId("app-marker")).not.toBeInTheDocument();
  });

  it("renders the form for a resolved anonymous user", () => {
    renderAt("/login", { data: null, status: "success" });
    expect(screen.queryByTestId("app-marker")).not.toBeInTheDocument();
  });

  it("redirects to /do when the session resolves to a logged-in user", () => {
    renderAt("/login", { data: { id: "u1" }, status: "success" });
    expect(screen.getByTestId("app-marker")).toBeInTheDocument();
  });
});
