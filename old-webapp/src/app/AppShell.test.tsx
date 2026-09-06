import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const ensureOnboarded = vi.fn();
const getAppData = vi.fn();
const getProjectsForResolver = vi.fn();
const getCommandPaletteIndex = vi.fn();
const searchSite = vi.fn();
const initializeTimeZone = vi.fn().mockResolvedValue({ ok: true });
const entitled = { current: true };

const life = {
  id: "life",
  name: "Life",
  kind: "PERSONAL",
  type: "LIFE_AREA",
  color: "emerald",
  purpose: "Daily life",
};
const shopping = {
  id: "shopping",
  name: "Shopping",
  kind: "CUSTOM",
  type: "SIMPLE_LIST",
  color: "cyan",
  purpose: "Groceries",
};

vi.mock("wasp/client/auth", () => ({
  useAuth: () => ({
    data: { id: "u1", fullName: "Test User", isAdmin: false },
  }),
  logout: vi.fn(),
}));

vi.mock("wasp/client/operations", () => ({
  ensureOnboarded,
  getAppData,
  getProjectsForResolver,
  getCommandPaletteIndex,
  searchSite,
  createInboxItem: vi.fn(),
  submitFeedback: vi.fn(),
  initializeTimeZone,
  useQuery: (operation: unknown) => {
    if (operation === getAppData) {
      return {
        data: {
          lenses: [life, shopping],
          counts: {
            inbox: 1,
            today: 2,
            upcoming: 3,
            someday: 4,
            projects: 5,
            goals: 6,
          },
          reviewPreferences: { today: true, week: true, month: true },
        },
      };
    }
    if (operation === getCommandPaletteIndex) {
      return { data: { items: [] }, isFetching: false };
    }
    return { data: undefined, isFetching: false };
  },
}));

vi.mock("../billing/useEntitled", () => ({
  useEntitled: () => entitled.current,
}));

vi.mock("../notifications/client", () => ({
  registerServiceWorker: vi.fn(),
  useServiceWorkerUpdate: () => ({
    updateAvailable: false,
    applyUpdate: vi.fn(),
  }),
  useDeployedVersionUpdate: () => ({
    updateAvailable: false,
    applyUpdate: vi.fn(),
  }),
}));

const { AppShell } = await import("./AppShell");

function LocationMarker() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderShell(path = "/do") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/do/*"
            element={
              <>
                <AppShell>
                  <div>Page content</div>
                </AppShell>
                <LocationMarker />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  entitled.current = true;
});

describe("AppShell Lens workflows", () => {
  it("keeps Inbox routes open and Cmd+K capture available in a Simple-list Lens", async () => {
    localStorage.setItem("aa-lens-id", shopping.id);
    renderShell("/do/inbox");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/do/inbox"));
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("keeps Command+L and Free Lens gating intact", async () => {
    entitled.current = false;
    localStorage.setItem("aa-lens-id", life.id);
    renderShell();
    fireEvent.keyDown(window, { key: "l", metaKey: true });
    expect(
      screen.getByRole("dialog", { name: "Switch Lens" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Shopping/ }));
    expect(
      screen.getByText(/bring your work life into ActionAmp/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/do");
  });


});
