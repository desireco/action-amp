import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getProjects = vi.fn();
const getGoals = vi.fn();
const updateTaskDetails = vi.fn();

vi.mock("wasp/client/operations", () => ({
  getProjects,
  getGoals,
  updateTaskDetails,
  useQuery: () => ({ data: [] }),
}));

const { TaskRowEditor } = await import("./TaskRowEditor");

const TASK = {
  id: "task-1",
  permalink: "email-sarah",
  description: "Email Sarah",
  content: "",
  status: "UPCOMING" as const,
  priority: "NORMAL" as const,
  size: "M" as const,
  scheduledDate: null,
  project: null,
  goal: null,
  isDone: false,
};

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/do/upcoming"]}>
        <Routes>
          <Route
            path="/do/tasks/:permalink"
            element={<div data-testid="task-detail" />}
          />
          <Route
            path="*"
            element={<TaskRowEditor task={TASK} lensId="lens-1" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateTaskDetails.mockResolvedValue({});
});

describe("TaskRowEditor", () => {
  it("renders the property chips row", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "M" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Normal" })).toBeInTheDocument();
  });

  it("Edit opens the task detail page (title/notes editing lives there)", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /edit email sarah/i }));
    expect(screen.getByTestId("task-detail")).toBeInTheDocument();
  });

  it("renders nothing for done tasks", () => {
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TaskRowEditor task={{ ...TASK, isDone: true }} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.querySelector(".aa-row-editor")).toBeNull();
  });

  it("autosaves a size pick through updateTaskDetails", async () => {
    // Drive a pick through the real PropertyChips: open the size popover and
    // choose L. The chips row is the editor's public surface; this is the
    // "dropdowns are inline" contract.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TaskRowEditor task={TASK} lensId="lens-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    // Option names concatenate label + hint (e.g. "L 1 hr").
    const option = await screen.findByRole("button", { name: /1 hr/ });
    fireEvent.click(option);

    await waitFor(() =>
      expect(updateTaskDetails).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: "task-1", size: "L" }),
      ),
    );
  });
});
