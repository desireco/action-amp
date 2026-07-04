// Component test for GoalDetailPage — the goal-planning spec UI flows that
// live entirely on the page (header affordances + the "Next:" line + reorder).
// The op-level behavior (tenancy, cross-Lens rejection, re-parenting) is
// covered in operations.test.ts; this pins the wiring.
//
// Mocks wasp/client/operations so the page renders against fixture data
// without a server round-trip, then asserts the user-visible behavior.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---- Mock the wasp ops the page imports ----
// Each op the page touches becomes a vi.fn so the test can drive return values
// per-test and assert call args. `goalData` is a mutable slot the fake useQuery
// reads — vi.mock factories run before the module body, so we can't reach
// instance properties on the mocks from inside the factory; a hoisted binding
// works because it's a plain object.
const goalData: { current: unknown } = { current: null };
const getGoal = vi.fn();
const createTask = vi.fn();
const createProject = vi.fn();
const updateTaskStatus = vi.fn();
const setGoalDone = vi.fn();
const updateGoal = vi.fn();
const deleteGoal = vi.fn();
const reorderGoalProjects = vi.fn();

vi.mock("wasp/client/operations", () => ({
  useQuery: (fn: unknown) => {
    // The page calls useQuery(getGoal, { id }). Return whatever the test has
    // staged in goalData.current.
    if (fn === getGoal) {
      return { data: goalData.current, isLoading: false, error: null };
    }
    return { data: undefined, isLoading: false, error: null };
  },
  getGoal,
  createTask,
  createProject,
  updateTaskStatus,
  setGoalDone,
  updateGoal,
  deleteGoal,
  reorderGoalProjects,
}));

// Import AFTER vi.mock so the page picks up the mocked module.
const { GoalDetailPage } = await import("./GoalDetailPage");

/** Fixture goal with two linked projects (one done, one not) + a standalone task. */
function makeGoal(overrides: Record<string, unknown> = {}) {
  return {
    id: "g1",
    name: "Grow audience",
    description: "Reach 10k followers",
    isDone: false,
    lensId: "lens-1",
    tasks: [
      { id: "t1", description: "Email Sarah", isDone: false, status: "UPCOMING", priority: "NORMAL", size: "M", tags: [], project: null, goal: { id: "g1", name: "Grow audience" } },
    ],
    projects: [
      { id: "p1", name: "Newsletter", isDone: true, order: 0, dueDate: null, tasks: [{ id: "t2", isDone: true }] },
      { id: "p2", name: "Twitter", isDone: false, order: 1, dueDate: null, tasks: [{ id: "t3", isDone: false }] },
    ],
    ...overrides,
  };
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/app/goals/:id" element={<GoalDetailPage />} />
            <Route path="/app/goals" element={<div data-testid="goals-list" />} />
            <Route path="/app/projects/:id" element={<div data-testid="project-detail" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setGoalDone.mockResolvedValue({ id: "g1" });
  updateGoal.mockResolvedValue({ id: "g1", name: "X", description: null });
  deleteGoal.mockResolvedValue({ id: "g1", reparentedCount: 0 });
  reorderGoalProjects.mockResolvedValue({ goalId: "g1" });
  createTask.mockResolvedValue({ id: "new-task" });
  createProject.mockResolvedValue({ id: "new-project", name: "X" });
});

describe("GoalDetailPage — header affordances (goal-planning spec §B, §C)", () => {
  it("shows Complete (not Reopen) when the goal is active", () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    expect(screen.getByRole("button", { name: /^complete$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reopen$/i })).toBeNull();
  });

  it("clicking Complete fires setGoalDone({ isDone: true })", async () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));
    await waitFor(() =>
      expect(setGoalDone).toHaveBeenCalledWith({ id: "g1", isDone: true }),
    );
  });

  it("shows Reopen when the goal is already done", () => {
    goalData.current = makeGoal({ isDone: true });
    renderAt("/app/goals/g1");
    expect(screen.getByRole("button", { name: /^reopen$/i })).toBeInTheDocument();
  });
});

describe("GoalDetailPage — inline edit (§C)", () => {
  it("Edit reveals name + description inputs, Save fires updateGoal", async () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const nameInput = await screen.findByLabelText(/goal name/i);
    const descInput = screen.getByLabelText(/goal description/i);
    fireEvent.change(nameInput, { target: { value: "Grow audience fast" } });
    fireEvent.change(descInput, { target: { value: "Reach 20k" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(updateGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "g1",
          name: "Grow audience fast",
          description: "Reach 20k",
        }),
      ),
    );
  });
});

describe("GoalDetailPage — delete confirm copy (§C)", () => {
  it("the delete dialog states the re-parenting outcome (N children)", () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    // 2 projects + 1 standalone task = 3 children.
    const dialog = screen.getByRole("dialog", { name: /delete this goal/i });
    expect(dialog.textContent).toMatch(/3 items will move to standalone/);
  });

  it("the delete dialog fires deleteGoal on confirm", async () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete goal$/i }));
    await waitFor(() => expect(deleteGoal).toHaveBeenCalledWith({ id: "g1" }));
  });
});

describe("GoalDetailPage — Next: line (spec §E)", () => {
  it("surfaces the first non-done project as 'Next: <name>' with a link", () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    // p1 is done, p2 (Twitter) is the first non-done → "Next: Twitter".
    const nextLine = screen.getByText(/Next:/);
    expect(nextLine.textContent).toMatch(/Twitter/);
    expect(screen.getByRole("link", { name: "Twitter" })).toHaveAttribute(
      "href",
      "/app/projects/p2",
    );
  });

  it("hides the Next: line when every project under the goal is done", () => {
    goalData.current = makeGoal({
      projects: [
        { id: "p1", name: "Done one", isDone: true, order: 0, dueDate: null, tasks: [] },
      ],
    });
    renderAt("/app/goals/g1");
    expect(screen.queryByText(/Next:/)).toBeNull();
  });

  it("hides the Next: line when the goal has no projects", () => {
    goalData.current = makeGoal({ projects: [] });
    renderAt("/app/goals/g1");
    expect(screen.queryByText(/Next:/)).toBeNull();
  });
});

describe("GoalDetailPage — reorder (spec §E)", () => {
  it("the up button on the second project fires reorderGoalProjects with the swapped order", async () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    // Second project (Twitter, index 1) — move up. The aria-label is
    // "Move <name> up".
    fireEvent.click(screen.getByRole("button", { name: /move twitter up/i }));
    await waitFor(() =>
      expect(reorderGoalProjects).toHaveBeenCalledWith({
        goalId: "g1",
        // Swapped: Twitter first, then Newsletter.
        orderedIds: ["p2", "p1"],
      }),
    );
  });

  it("the first project's up button is disabled (boundary)", () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    expect(screen.getByRole("button", { name: /move newsletter up/i })).toBeDisabled();
  });

  it("the last project's down button is disabled (boundary)", () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    expect(screen.getByRole("button", { name: /move twitter down/i })).toBeDisabled();
  });
});

describe("GoalDetailPage — create-from-goal (§C)", () => {
  it("'Add project' reveals the create field and creating fires createProject with the goal link", async () => {
    goalData.current = makeGoal();
    renderAt("/app/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^add project$/i }));
    const input = await screen.findByPlaceholderText(/project name/i);
    fireEvent.change(input, { target: { value: "Podcast relaunch" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() =>
      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Podcast relaunch",
          lensId: "lens-1",
          goalId: "g1",
        }),
      ),
    );
  });
});
