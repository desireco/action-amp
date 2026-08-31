import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTasks = vi.fn();
const queryState = {
  // SAFETY: test fixture; empty array narrowed to SomedayTask[] for type compatibility.
  current: { data: [] as SomedayTask[], isLoading: false },
};

interface SomedayTask {
  id: string;
  permalink: string;
  description: string;
  status: "SOMEDAY";
  isDone: false;
}

vi.mock("wasp/client/operations", () => ({
  getTasks,
  // Consumed by TaskRowEditor (inline row editing) — stubbed, not exercised here.
  getProjects: vi.fn(),
  getGoals: vi.fn(),
  updateTaskDetails: vi.fn(),
  updateTaskStatus: vi.fn(),
  useQuery: () => queryState.current,
}));

vi.mock("../app/lensContext", () => ({
  useActiveLens: () => ({ id: "lens-1", name: "Work" }),
}));

const { SomedayPage } = await import("./SomedayPage");

function renderPage() {
  // QueryClientProvider: TaskRowEditor (inline row editing) needs a client.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SomedayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryState.current = { data: [], isLoading: false };
});

describe("SomedayPage", () => {
  it("keeps page identity visible in the empty state", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Someday", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nothing parked." })).toBeInTheDocument();
  });

  it("shows a stable loading surface", () => {
    queryState.current = { data: [], isLoading: true };
    renderPage();

    expect(screen.getByLabelText("Loading Someday tasks")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nothing parked." })).not.toBeInTheDocument();
  });

  it("renders parked tasks inside the same page structure", () => {
    queryState.current = {
      data: [
        {
          id: "task-1",
          permalink: "learn-piano",
          description: "Learn piano",
          status: "SOMEDAY",
          isDone: false,
        },
      ],
      isLoading: false,
    };
    renderPage();

    expect(screen.getByText(/1 parked · kept without asking for attention today/i)).toBeInTheDocument();
    expect(screen.getByText("Learn piano")).toBeInTheDocument();
  });
});
