import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const ensureOnboarded = vi.fn();
const getAppData = vi.fn();
const getProjectsForResolver = vi.fn();
const getCommandPaletteIndex = vi.fn();
const searchSite = vi.fn();
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
  it("routes to the list when a Simple-list Lens is selected", async () => {
    localStorage.setItem("aa-lens-id", life.id);
    renderShell();
    // SAFETY: querySelector returns Element; cast to HTMLElement for within() interaction.
    const sidebar = document.querySelector(".aa-app-side") as HTMLElement;
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Lens: Life" }),
    );
    fireEvent.click(screen.getByRole("option", { name: /Shopping/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/do/list"),
    );
  });

  it("routes back to home when a Life-area Lens is selected from the list", async () => {
    localStorage.setItem("aa-lens-id", shopping.id);
    renderShell("/do/list");
    // SAFETY: querySelector returns Element; cast to HTMLElement for within() interaction.
    const sidebar = document.querySelector(".aa-app-side") as HTMLElement;
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "Lens: Shopping" }),
    );
    fireEvent.click(screen.getByRole("option", { name: /Life/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/do"),
    );
  });

  it("normalizes a stored Simple-list Lens while retaining universal intake", async () => {
    localStorage.setItem("aa-lens-id", shopping.id);
    renderShell();
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/do/list"),
    );

    // SAFETY: querySelector returns Element; cast to HTMLElement for within() interaction.
    const sidebar = document.querySelector(".aa-app-side") as HTMLElement;
    expect(
      within(sidebar).getByRole("link", { name: "List" }),
    ).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: /Inbox/ })).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole("link", { name: "Today" }),
    ).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByRole("link", { name: "Do" }),
    ).not.toBeInTheDocument();
    expect(within(sidebar).queryByText("Plan")).not.toBeInTheDocument();
    expect(within(sidebar).queryByText("Review")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture" })).toBeInTheDocument();

    const mobile = screen.getByRole("navigation", {
      name: "Mobile navigation",
    });
    expect(
      within(mobile).getByRole("link", { name: "List" }),
    ).toBeInTheDocument();
    expect(
      within(mobile).getByRole("button", { name: "Lens: Shopping" }),
    ).toBeInTheDocument();
    expect(within(mobile).getByRole("link", { name: /Inbox/ })).toBeInTheDocument();
  });

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

  it("routes a command-palette Simple-list switch to the list", async () => {
    localStorage.setItem("aa-lens-id", life.id);
    renderShell();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", metaKey: true });
    const input = screen.getByRole("combobox", { name: "Search ActionAmp" });
    fireEvent.change(input, { target: { value: "shopping" } });
    const option = await screen.findByRole("option", {
      name: /Shopping.*Switch lens/i,
    });
    fireEvent.click(option);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/do/list"),
    );
  });
});
