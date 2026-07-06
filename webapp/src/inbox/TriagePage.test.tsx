import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inboxItems = {
  current: [
    {
      id: "ix-1",
      text: "Email Sarah",
      createdAt: new Date(),
      parsedDate: null,
      parsedLens: null,
      parsedProject: null,
      parsedPriority: null,
      parsedSize: null,
      parsedTags: [],
    },
  ],
};

const appData = {
  current: {
    lenses: [{ id: "lens-1", name: "Work", kind: "WORK", color: "indigo" }],
  },
};

const activeLens = {
  current: { id: "lens-1", name: "Work", kind: "WORK", color: "indigo" },
};

const projects = {
  current: [] as Array<{
    id: string;
    name: string;
    lensId: string;
    goal?: { name: string } | null;
  }>,
};

const resolverProjects = {
  current: [] as Array<{
    id: string;
    name: string;
    lensId: string;
  }>,
};

const getInboxItems = vi.fn();
const triageInboxItem = vi.fn();
const getAppData = vi.fn();
const getProjects = vi.fn();
const getProjectsForResolver = vi.fn();
const getGoals = vi.fn();

vi.mock("wasp/client/operations", () => ({
  useQuery: (fn: unknown) => {
    if (fn === getInboxItems) return { data: inboxItems.current, isLoading: false, error: null };
    if (fn === getAppData) return { data: appData.current, isLoading: false, error: null };
    if (fn === getProjects) return { data: projects.current, isLoading: false, error: null };
    if (fn === getProjectsForResolver) return { data: resolverProjects.current, isLoading: false, error: null };
    if (fn === getGoals) return { data: [], isLoading: false, error: null };
    return { data: undefined, isLoading: false, error: null };
  },
  getInboxItems,
  triageInboxItem,
  getAppData,
  getProjects,
  getProjectsForResolver,
  getGoals,
}));

vi.mock("../app/lensContext", () => ({
  useActiveLens: () => activeLens.current,
}));

const { TriagePage } = await import("./TriagePage");

function renderTriagePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/inbox/review"]}>
        <Routes>
          <Route path="/app/inbox/review" element={<TriagePage />} />
          <Route path="/app/inbox" element={<div>Inbox</div>} />
          <Route path="/app" element={<div>App home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  appData.current = {
    lenses: [{ id: "lens-1", name: "Work", kind: "WORK", color: "indigo" }],
  };
  activeLens.current = { id: "lens-1", name: "Work", kind: "WORK", color: "indigo" };
  projects.current = [];
  resolverProjects.current = [];
  inboxItems.current = [
    {
      id: "ix-1",
      text: "Email Sarah",
      createdAt: new Date(),
      parsedDate: null,
      parsedLens: null,
      parsedProject: null,
      parsedPriority: null,
      parsedSize: null,
      parsedTags: [],
    },
  ];
  triageInboxItem.mockRejectedValue(new Error("Server unavailable"));
});

describe("TriagePage", () => {
  it("starts on Classify and advances straight to Spec with one Continue", async () => {
    renderTriagePage();

    expect(screen.getByText("1 · Classify")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /task/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Work" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(await screen.findByText(/2 · Specify the task/i)).toBeInTheDocument();
  });

  it("Back from Spec returns to Classify so the type can be changed", async () => {
    renderTriagePage();
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByText(/2 · Specify the task/i)).toBeInTheDocument();

    // Back returns to the classify step — type/lens chooser reappears.
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(await screen.findByText("1 · Classify")).toBeInTheDocument();
    // And the type chooser is reachable again (one-line rows now, so the
    // accessible name is the label + sub-description combined).
    expect(screen.getByRole("button", { name: /project/i })).toBeInTheDocument();
  });

  it("uses a resolved Project as the destination and skips standalone Lens selection", async () => {
    appData.current = {
      lenses: [
        { id: "lens-1", name: "Work", kind: "WORK", color: "indigo" },
        { id: "lens-2", name: "Me", kind: "PERSONAL", color: "emerald" },
      ],
    };
    activeLens.current = { id: "lens-2", name: "Me", kind: "PERSONAL", color: "emerald" };
    inboxItems.current = [
      {
        id: "ix-1",
        text: "Draft MVP plan",
        createdAt: new Date(),
        parsedDate: null,
        parsedLens: null,
        parsedProject: null,
        parsedPriority: null,
        parsedSize: null,
        parsedTags: [],
      },
    ];
    projects.current = [{ id: "project-1", name: "MVP", lensId: "lens-1", goal: null }];
    resolverProjects.current = [{ id: "project-1", name: "MVP", lensId: "lens-1" }];
    triageInboxItem.mockResolvedValue({ id: "task-1" });

    renderTriagePage();

    expect(await screen.findByText("Destination")).toBeInTheDocument();
    expect(screen.getByText("MVP · Work")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Me" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^complete$/i }));

    await waitFor(() =>
      expect(triageInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          inboxItemId: "ix-1",
          lensId: "lens-1",
          projectId: "project-1",
        }),
      ),
    );
  });

  it("uses Classify number keys to choose the type before Continue", async () => {
    renderTriagePage();

    fireEvent.keyDown(window, { key: "2" });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(await screen.findByText(/2 · Specify the project/i)).toBeInTheDocument();
  });

  it("keeps the current item visible when dispatch fails", async () => {
    renderTriagePage();

    expect(screen.getByText("Email Sarah")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));

    await waitFor(() => expect(screen.getByText("Server unavailable")).toBeInTheDocument());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(screen.getByText("Email Sarah")).toBeInTheDocument();
    expect(screen.queryByText(/inbox zero/i)).not.toBeInTheDocument();
  });

  it("lets task notes be added during Spec and sends them to triage", async () => {
    triageInboxItem.mockResolvedValue({ id: "task-1" });
    renderTriagePage();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    const notes = await screen.findByLabelText(/task notes/i);
    fireEvent.change(notes, { target: { value: "  Call out invoice terms  " } });
    fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));

    await waitFor(() =>
      expect(triageInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          inboxItemId: "ix-1",
          content: "Call out invoice terms",
        }),
      ),
    );
  });
});
