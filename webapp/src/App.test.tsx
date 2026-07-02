import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * App auth-gate regression test.
 *
 * The gate (App.tsx) exists because Wasp wraps each *page* in
 * `createAuthRequiredPage`, but `App` is the layout (`rootElement`) and is not
 * wrapped. Without the gate, AppShell mounts and renders interactive chrome
 * (capture FAB, logout) during session resolution and when the session is
 * stale/null — letting the user fire auth-required actions that 500/401.
 *
 * These tests assert the gate holds across the three `useAuth` states. They
 * fail the moment someone removes the `status`/`!user` guard from App.tsx.
 *
 * Note: we don't use renderInContext here. That helper hardcodes BrowserRouter
 * and a fresh QueryClient; this test needs a MemoryRouter (to set the initial
 * entry to /app and observe the redirect to /) and a mocked useAuth.
 */

// The shape Wasp's useAuth() returns (a TanStack UseQueryResult<AuthUser|null>).
// fullName etc. are included because AppShell reads them when the shell mounts.
type UseAuthReturn = {
  data: {
    id: string;
    fullName: string;
    hasSeenOnboarding: boolean;
  } | null;
  status: "loading" | "success" | "error";
};

// Controlled per-test via mockUseAuthReturn.
let mockUseAuthReturn: UseAuthReturn = { data: null, status: "loading" };

vi.mock("wasp/client/auth", () => ({
  useAuth: () => mockUseAuthReturn,
}));

// Importing App AFTER vi.mock so it picks up the mocked useAuth.
const { App } = await import("./App");

/** A landing marker rendered at "/", so we can assert a redirect landed there. */
function LandingMarker() {
  return <div data-testid="landing-marker">landing</div>;
}

/** A minimal child that the shell's Outlet renders for an /app route. */
function AppChild() {
  return <div data-testid="app-child">app page</div>;
}

/**
 * Render App as a layout route with a /app/* child, plus a / landing route so
 * the gate's <Navigate to="/" /> has somewhere to land that we can observe.
 * `initialPath` lets a caller start at /app (the path the gate guards).
 */
function renderAt(initialPath: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<App />}>
            <Route path="/app" element={<AppChild />} />
            <Route path="/app/*" element={<AppChild />} />
          </Route>
          <Route path="/" element={<LandingMarker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // jsdom doesn't implement matchMedia; AppShell reads it for the theme. A
  // no-op stub is enough — we're testing the auth gate, not theming.
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

beforeEach(() => {
  // Reset to the "still resolving" state before each test.
  mockUseAuthReturn = { data: null, status: "loading" };
});

describe("App auth gate", () => {
  it("renders the shell only when the session resolves to a user", () => {
    mockUseAuthReturn = {
      data: { id: "u1", fullName: "Test User", hasSeenOnboarding: true },
      status: "success",
    };
    renderAt("/app");

    // Shell chrome (the brand mark) and the child page both render.
    expect(document.querySelector(".aa-app-brand")).toBeInTheDocument();
    expect(screen.getByTestId("app-child")).toBeInTheDocument();
  });

  it("redirects to / when the session resolves but there is no user", () => {
    mockUseAuthReturn = { data: null, status: "success" };
    renderAt("/app");

    // No shell chrome, no app child — redirected to the landing marker.
    expect(document.querySelector(".aa-app-brand")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-child")).not.toBeInTheDocument();
    expect(screen.getByTestId("landing-marker")).toBeInTheDocument();
  });

  it("renders nothing interactive while the session is still loading", () => {
    mockUseAuthReturn = { data: null, status: "loading" };
    renderAt("/app");

    // No shell chrome and NOT redirected to / either — just waiting. (The gate
    // returns null during loading; the landing route only renders after a
    // successful resolve-to-null.)
    expect(document.querySelector(".aa-app-brand")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-child")).not.toBeInTheDocument();
    expect(screen.queryByTestId("landing-marker")).not.toBeInTheDocument();
  });
});
