import { describe, expect, it, vi, beforeAll } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
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

type UseAuthReturn = {
  data: { id: string; fullName: string } | null;
  status: "loading" | "success" | "error";
};

let mockUseAuthReturn: UseAuthReturn = { data: null, status: "loading" };

vi.mock("wasp/client/auth", () => ({
  useAuth: () => mockUseAuthReturn,
  // LoginForm + login are imported by LoginPage but unused in this redirect
  // surface — stub them so the page renders without the real Wasp machinery.
  LoginForm: () => <div data-testid="login-form">login form</div>,
  login: vi.fn(),
}));

vi.mock("wasp/client/operations", () => ({
  prepareDevAutologin: vi.fn(),
  requestMagicLogin: vi.fn(),
  verifyMagicLogin: vi.fn(),
}));

// Importing LoginPage AFTER vi.mock so it picks up the mocked useAuth.
const { LoginPage } = await import("./LoginPage");

/** A marker rendered at /do so we can assert the redirect target. */
function AppMarker() {
  return <div data-testid="app-marker">app page</div>;
}

function renderAt(initialPath: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/do" element={<AppMarker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LoginPage redirect on existing session", () => {
  it("renders the form while the session is still resolving (no flash)", () => {
    mockUseAuthReturn = { data: null, status: "loading" };
    renderAt("/login");
    // No redirect yet — the form is what the user sees.
    expect(screen.queryByTestId("app-marker")).not.toBeInTheDocument();
  });

  it("renders the form for a resolved anonymous user", () => {
    mockUseAuthReturn = { data: null, status: "success" };
    renderAt("/login");
    expect(screen.queryByTestId("app-marker")).not.toBeInTheDocument();
  });

  it("redirects to /do when the session resolves to a logged-in user", () => {
    mockUseAuthReturn = {
      data: { id: "u1", fullName: "Jake" },
      status: "success",
    };
    renderAt("/login");
    expect(screen.getByTestId("app-marker")).toBeInTheDocument();
  });
});
