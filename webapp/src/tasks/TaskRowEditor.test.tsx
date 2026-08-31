import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getProjects = vi.fn();
const getGoals = vi.fn();
const updateTaskDetails = vi.fn();
const updateTaskStatus = vi.fn();

vi.mock("wasp/client/operations", () => ({
  getProjects,
  getGoals,
  updateTaskDetails,
  updateTaskStatus,
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
      <MemoryRouter>
        <TaskRowEditor task={TASK} lensId="lens-1" onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateTaskDetails.mockResolvedValue({});
  updateTaskStatus.mockResolvedValue({});
});

describe("TaskRowEditor", () => {
  it("renders the chips row with an Edit toggle, not a navigation button", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: "Edit title and notes" })).toBeInTheDocument();
  });

  it("Edit opens the title/notes working copy; Save is gated until something changes", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit title and notes" }));

    const title = screen.getByLabelText("Task title");
    expect(title).toHaveValue("Email Sarah");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.change(title, { target: { value: "Email Sarah about the draft" } });
    expect(save).toBeEnabled();

    fireEvent.click(save);
    await waitFor(() =>
      expect(updateTaskDetails).toHaveBeenCalledWith({
        taskId: "task-1",
        description: "Email Sarah about the draft",
        content: "",
      }),
    );
  });

  it("Cancel returns to chips without writing", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit title and notes" }));
    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Discarded change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateTaskDetails).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit title and notes" })).toBeInTheDocument();
  });

  it("won't do confirms, then writes WONT_DO through the status op", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Edit title and notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark as won't do" }));

    // Confirm dialog gates the decline.
    expect(updateTaskStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Mark won't do" }));

    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith({
        id: "task-1",
        status: "WONT_DO",
      }),
    );
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
});
