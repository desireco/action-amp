import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTasks = vi.fn();
const getAppData = vi.fn();
const unscheduleOverdueTasks = vi.fn();
const promoteToToday = vi.fn();
const moveToSomeday = vi.fn();
const queryState = {
  // SAFETY: test fixture; empty array narrowed to UpcomingTask[] for type compatibility.
  current: { data: [] as UpcomingTask[], isLoading: false },
  appData: { counts: { today: 3 } },
};

interface UpcomingTask {
  id: string;
  permalink: string;
  description: string;
  status: "UPCOMING";
  isDone: false;
  scheduledDate: string | null;
}

vi.mock("wasp/client/operations", () => ({
  getTasks,
  getAppData,
  unscheduleOverdueTasks,
  useQuery: (operation: unknown) =>
    operation === getAppData
      ? { data: queryState.appData, isLoading: false }
      : queryState.current,
}));

vi.mock("../app/lensContext", () => ({
  useActiveLens: () => ({ id: "lens-1", name: "Work" }),
}));

vi.mock("./useTaskListActions", () => ({
  useTaskListActions: () => ({ promoteToToday, moveToSomeday }),
}));

const { UpcomingPage } = await import("./UpcomingPage");

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UpcomingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryState.current = { data: [], isLoading: false };
  queryState.appData = { counts: { today: 3 } };
  vi.clearAllMocks();
});

describe("UpcomingPage overdue recovery", () => {
  it("shows the Today item count in the shared cross-link button", () => {
    renderPage();

    expect(
      screen.getByRole("link", { name: "Open Today, 3 items" }),
    ).toBeInTheDocument();
  });

  it("offers one bulk unschedule action and individual Someday actions", () => {
    queryState.current = {
      data: [
        {
          id: "task-1",
          permalink: "past-task",
          description: "Past task",
          status: "UPCOMING",
          isDone: false,
          scheduledDate: "2000-07-09T12:00:00.000Z",
        },
      ],
      isLoading: false,
    };

    renderPage();

    expect(screen.getByRole("button", { name: "Unschedule 1 overdue" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Past task"));
    expect(screen.getByRole("button", { name: "Someday" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("opens and closes a task's action drawer instead of navigating on row click", () => {
    queryState.current = {
      data: [
        {
          id: "task-1",
          permalink: "future-task",
          description: "Future task",
          status: "UPCOMING",
          isDone: false,
          scheduledDate: "2099-07-11T12:00:00.000Z",
        },
      ],
      isLoading: false,
    };

    renderPage();
    const row = screen.getByText("Future task").closest(".aa-task-row")!;
    const trigger = row.querySelector(".aa-task-row__main")!;

    fireEvent.click(screen.getByText("Future task"));
    expect(row).toHaveClass("aa-upcoming__row--active");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByText("Future task"));
    expect(row).not.toHaveClass("aa-upcoming__row--active");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("does not show recovery controls without overdue tasks", () => {
    queryState.current = {
      data: [
        {
          id: "task-1",
          permalink: "future-task",
          description: "Future task",
          status: "UPCOMING",
          isDone: false,
          scheduledDate: "2099-07-11T12:00:00.000Z",
        },
      ],
      isLoading: false,
    };

    renderPage();

    expect(screen.queryByRole("button", { name: /Unschedule/ })).not.toBeInTheDocument();
  });

  it("sends the active Lens to the bulk recovery action", async () => {
    queryState.current = {
      data: [
        {
          id: "task-1",
          permalink: "past-task",
          description: "Past task",
          status: "UPCOMING",
          isDone: false,
          scheduledDate: "2000-07-09T12:00:00.000Z",
        },
      ],
      isLoading: false,
    };
    unscheduleOverdueTasks.mockResolvedValue({ count: 1 });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Unschedule 1 overdue" }));

    expect(unscheduleOverdueTasks).toHaveBeenCalledWith({ lensId: "lens-1" });
  });
});
