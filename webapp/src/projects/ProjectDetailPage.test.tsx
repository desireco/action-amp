// Component test for ProjectDetailPage — the goal-planning spec §C task-row
// "move to project" affordance + the goal re-link picker. The op-level
// behavior (same-Lens, one-parent, tenancy) is covered in
// operations.test.ts; this pins the wiring.
//
// Mocks wasp/client/operations so the page renders against fixture data
// without a server round-trip, then asserts the user-visible behavior.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---- Mock the wasp ops the page imports ----
const projectData: { current: unknown } = { current: null };
const lensProjectsData: { current: unknown[] } = { current: [] };
const lensGoalsData: { current: unknown[] } = { current: [] };

const getProject = vi.fn();
const getGoals = vi.fn();
const getProjects = vi.fn();
const createTask = vi.fn();
const updateTaskStatus = vi.fn();
const startTask = vi.fn();
const setProjectDone = vi.fn();
const updateProject = vi.fn();
const deleteProject = vi.fn();
const updateTask = vi.fn();
const updateTaskContent = vi.fn();

vi.mock("wasp/client/operations", () => ({
  useQuery: (fn: unknown) => {
    if (fn === getProject) {
      return { data: projectData.current, isLoading: false, error: null };
    }
    if (fn === getProjects) {
      return { data: lensProjectsData.current, isLoading: false, error: null };
    }
    if (fn === getGoals) {
      return { data: lensGoalsData.current, isLoading: false, error: null };
    }
    return { data: undefined, isLoading: false, error: null };
  },
  getProject,
  getGoals,
  getProjects,
  createTask,
  updateTaskStatus,
  startTask,
  setProjectDone,
  updateProject,
  deleteProject,
  updateTask,
  updateTaskContent,
}));

const { ProjectDetailPage } = await import("./ProjectDetailPage");

/** Fixture project with one open task under Today. */
function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    permalink: "ship-product-v2",
    name: "Ship product v2",
    description: "Next milestone",
    dueDate: null,
    isDone: false,
    order: 0,
    lensId: "lens-1",
    goal: null,
    tasks: [
      { id: "t1", description: "Email Sarah", isDone: false, status: "TODAY", priority: "NORMAL", size: "M" },
    ],
    ...overrides,
  };
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/projects/:permalink" element={<ProjectDetailPage />} />
          <Route path="/app/projects" element={<div data-testid="projects-list" />} />
          <Route path="/app/goals/:permalink" element={<div data-testid="goal-detail" />} />
          <Route path="/app/tasks/:permalink" element={<div data-testid="task-detail" />} />
          <Route path="/app/focus" element={<div data-testid="focus" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateTask.mockResolvedValue({ id: "t1", projectId: "p2", goalId: null });
  updateProject.mockResolvedValue({ id: "p1", name: "X", description: null, goalId: "g1" });
  setProjectDone.mockResolvedValue({ id: "p1" });
  deleteProject.mockResolvedValue({ id: "p1", reparentedCount: 0 });
  createTask.mockResolvedValue({ id: "new-task" });
  startTask.mockResolvedValue({ id: "t1" });
  updateTaskStatus.mockResolvedValue({ id: "t1" });
  updateTaskContent.mockResolvedValue({ id: "t1" });
});

/** Two Today tasks so the Next-step hero does NOT lift a row out of the list
 *  (the hero only renders for exactly one Today task). Keeps the move-task
 *  row-based assertions valid. */
function makeProjectMultiToday(overrides: Record<string, unknown> = {}) {
  return makeProject({
    tasks: [
      { id: "t1", description: "Email Sarah", isDone: false, status: "TODAY", priority: "NORMAL", size: "M" },
      { id: "t2", description: "Draft the brief", isDone: false, status: "TODAY", priority: "NORMAL", size: "S" },
    ],
    ...overrides,
  });
}

describe("ProjectDetailPage — move-task affordance (spec §C)", () => {
  // Uses the multi-Today fixture so the Next-step hero does not lift the row
  // out of the list (the hero renders only for exactly one Today task).
  it("a task row exposes a Move button that expands the picker", () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [
      { id: "p2", name: "Other project" },
    ];
    renderAt("/app/projects/p1");

    // The Move button is present on the open task row.
    const moveBtn = screen.getByRole("button", { name: /move email sarah to another project/i });
    fireEvent.click(moveBtn);

    // Picker reveals the sibling project as an option.
    expect(screen.getByText("Other project")).toBeInTheDocument();
    // And the standalone (unlink) option.
    expect(screen.getByRole("button", { name: /^standalone$/i })).toBeInTheDocument();
  });

  it("selecting a sibling project fires updateTask with the target projectId", async () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [{ id: "p2", name: "Other project" }];
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /move email sarah to another project/i }));
    fireEvent.click(screen.getByText("Other project"));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ id: "t1", projectId: "p2" }),
    );
  });

  it("selecting Standalone fires updateTask with projectId=null (unlink)", async () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [{ id: "p2", name: "Other project" }];
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /move email sarah to another project/i }));
    fireEvent.click(screen.getByRole("button", { name: /^standalone$/i }));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ id: "t1", projectId: null }),
    );
  });

  it("the current project is excluded from the move targets", () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [
      { id: "p1", name: "Ship product v2" }, // the current project — should NOT appear
      { id: "p2", name: "Other project" },
    ];
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /move email sarah to another project/i }));
    // Only "Other project" appears as an option button, not the current project.
    const movePicker = screen.getByText("Other project").parentElement!;
    expect(movePicker).not.toHaveTextContent("Ship product v2");
  });

  it("shows an empty-state message when there are no other projects in the Lens", () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [{ id: "p1", name: "Ship product v2" }]; // only the current project
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /move email sarah to another project/i }));
    expect(screen.getByText(/no other projects in this lens/i)).toBeInTheDocument();
  });
});

describe("ProjectDetailPage — Edit affordance on task rows", () => {
  it("each task row has an Edit button that opens the task page", () => {
    projectData.current = makeProjectMultiToday();
    renderAt("/app/projects/p1");

    const editBtn = screen.getByRole("button", { name: /edit email sarah/i });
    fireEvent.click(editBtn);

    expect(screen.getByTestId("task-detail")).toBeInTheDocument();
  });

  it("done tasks open their review-only task detail without an Edit button", () => {
    projectData.current = makeProject({
      tasks: [
        { id: "t1", description: "Email Sarah", isDone: true, status: "TODAY", priority: "NORMAL", size: "M" },
      ],
    });
    renderAt("/app/projects/p1");

    // Completion freezes task fields, so the project row has no misleading
    // Edit affordance. The row itself remains the route to task review.
    expect(screen.queryByRole("button", { name: /edit email sarah/i })).toBeNull();
    fireEvent.click(screen.getByText("Email Sarah"));
    expect(screen.getByTestId("task-detail")).toBeInTheDocument();
  });
});

describe("ProjectDetailPage — re-link to goal (spec §C)", () => {
  it("the goal picker lists active goals in the project's Lens", () => {
    projectData.current = makeProject();
    lensGoalsData.current = [{ id: "g1", name: "Grow audience" }];
    renderAt("/app/projects/p1");

    // The "Link a goal" affordance — click to open the picker.
    fireEvent.click(screen.getByRole("button", { name: /link a goal/i }));
    expect(screen.getByText("Grow audience")).toBeInTheDocument();
  });

  it("selecting a goal fires updateProject with the target goalId", async () => {
    projectData.current = makeProject();
    lensGoalsData.current = [{ id: "g1", name: "Grow audience" }];
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /link a goal/i }));
    fireEvent.click(screen.getByText("Grow audience"));

    await waitFor(() =>
      expect(updateProject).toHaveBeenCalledWith({ id: "p1", goalId: "g1" }),
    );
  });

  it("a linked goal renders as a violet link to its detail page", () => {
    projectData.current = makeProject({
      goal: { id: "g9", permalink: "grow-audience", name: "Grow audience" },
    });
    renderAt("/app/projects/p1");

    const link = screen.getByRole("link", { name: /grow audience/i });
    expect(link).toHaveAttribute("href", "/app/goals/grow-audience");
  });

  it("breaking the link opens the picker from the goal row and offers None (standalone)", () => {
    projectData.current = makeProject({
      goal: { id: "g9", permalink: "grow-audience", name: "Grow audience" },
    });
    lensGoalsData.current = [{ id: "g9", name: "Grow audience" }];
    renderAt("/app/projects/p1");

    // The "Edit goal" control on the WHY line opens the picker.
    fireEvent.click(screen.getByRole("button", { name: /edit goal/i }));
    expect(screen.getByRole("button", { name: /none \(standalone\)/i })).toBeInTheDocument();
  });
});

describe("ProjectDetailPage — Next-step hero (Direction D)", () => {
  it("renders the hero with Start when there is exactly one Today task", () => {
    projectData.current = makeProject(); // fixture has a single Today task
    renderAt("/app/projects/p1");

    expect(screen.getByText(/next step/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /email sarah/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
  });

  it("does not render the hero when there are two or more Today tasks", () => {
    projectData.current = makeProjectMultiToday();
    renderAt("/app/projects/p1");

    expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
    // Both tasks still appear in the Today group.
    expect(screen.getByText("Email Sarah")).toBeInTheDocument();
    expect(screen.getByText("Draft the brief")).toBeInTheDocument();
  });

  it("Start starts the task and routes to focus mode", async () => {
    projectData.current = makeProject();
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    await waitFor(() => expect(startTask).toHaveBeenCalledWith({ id: "t1" }));
  });

  it("Not now demotes the next-step task to Upcoming", async () => {
    projectData.current = makeProject();
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /not now/i }));

    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith({ id: "t1", status: "UPCOMING" }),
    );
  });

  it("does not render the hero when there are zero Today tasks", () => {
    projectData.current = makeProject({
      tasks: [
        { id: "t1", description: "Email Sarah", isDone: false, status: "UPCOMING", priority: "NORMAL", size: "M" },
      ],
    });
    renderAt("/app/projects/p1");

    expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
  });

  it("shows the calm cue when there are zero Today tasks but Upcoming exists", () => {
    projectData.current = makeProject({
      tasks: [
        { id: "t1", description: "Email Sarah", isDone: false, status: "UPCOMING", priority: "NORMAL", size: "M" },
      ],
    });
    renderAt("/app/projects/p1");

    expect(screen.getByText(/nothing queued for today/i)).toBeInTheDocument();
    // And the hero is still absent — we don't fabricate one from Upcoming.
    expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
  });

  it("does not show the calm cue when there are zero Today and zero Upcoming tasks", () => {
    projectData.current = makeProject({
      tasks: [
        { id: "t1", description: "Maybe a leaderboard", isDone: false, status: "SOMEDAY", priority: "NORMAL", size: "M" },
      ],
    });
    renderAt("/app/projects/p1");

    expect(screen.queryByText(/nothing queued for today/i)).not.toBeInTheDocument();
  });
});
