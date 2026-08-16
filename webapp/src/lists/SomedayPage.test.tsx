import { render, screen } from "@testing-library/react";
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
  useQuery: () => queryState.current,
}));

vi.mock("../app/lensContext", () => ({
  useActiveLens: () => ({ id: "lens-1", name: "Work" }),
}));

vi.mock("./useTaskListActions", () => ({
  useTaskListActions: () => ({ promoteToToday: vi.fn() }),
}));

const { SomedayPage } = await import("./SomedayPage");

function renderPage() {
  return render(
    <MemoryRouter>
      <SomedayPage />
    </MemoryRouter>,
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
