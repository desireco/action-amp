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
const setProjectDone = vi.fn();
const updateProject = vi.fn();
const deleteProject = vi.fn();
const updateTask = vi.fn();

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
  setProjectDone,
  updateProject,
  deleteProject,
  updateTask,
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
});

describe("ProjectDetailPage — move-task affordance (spec §C)", () => {
  it("a task row exposes a Move button that expands the picker", () => {
    projectData.current = makeProject();
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
    projectData.current = makeProject();
    lensProjectsData.current = [{ id: "p2", name: "Other project" }];
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /move email sarah to another project/i }));
    fireEvent.click(screen.getByText("Other project"));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ id: "t1", projectId: "p2" }),
    );
  });

  it("selecting Standalone fires updateTask with projectId=null (unlink)", async () => {
    projectData.current = makeProject();
    lensProjectsData.current = [{ id: "p2", name: "Other project" }];
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /move email sarah to another project/i }));
    fireEvent.click(screen.getByRole("button", { name: /^standalone$/i }));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ id: "t1", projectId: null }),
    );
  });

  it("the current project is excluded from the move targets", () => {
    projectData.current = makeProject();
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
    projectData.current = makeProject();
    lensProjectsData.current = [{ id: "p1", name: "Ship product v2" }]; // only the current project
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /move email sarah to another project/i }));
    expect(screen.getByText(/no other projects in this lens/i)).toBeInTheDocument();
  });
});

describe("ProjectDetailPage — re-link to goal (spec §C)", () => {
  it("the goal picker lists active goals in the project's Lens", () => {
    projectData.current = makeProject();
    lensGoalsData.current = [{ id: "g1", name: "Grow audience" }];
    renderAt("/app/projects/p1");

    // The relink value button — click to open the picker.
    fireEvent.click(screen.getByText(/click to link a goal/i));
    expect(screen.getByText("Grow audience")).toBeInTheDocument();
  });

  it("selecting a goal fires updateProject with the target goalId", async () => {
    projectData.current = makeProject();
    lensGoalsData.current = [{ id: "g1", name: "Grow audience" }];
    renderAt("/app/projects/p1");

    fireEvent.click(screen.getByText(/click to link a goal/i));
    fireEvent.click(screen.getByText("Grow audience"));

    await waitFor(() =>
      expect(updateProject).toHaveBeenCalledWith({ id: "p1", goalId: "g1" }),
    );
  });
});
