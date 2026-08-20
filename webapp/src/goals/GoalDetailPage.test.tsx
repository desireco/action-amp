// Component test for GoalDetailPage — the goal-planning spec UI flows that
// live entirely on the page (header affordances + the "Focus:" line + reorder).
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
type TestSlot<T = unknown> = { current: T };
const goalData: TestSlot = { current: null };
const getGoal = vi.fn();
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
  setGoalDone,
  updateGoal,
  deleteGoal,
  reorderGoalProjects,
}));

// Import AFTER vi.mock so the page picks up the mocked module.
const { GoalDetailPage } = await import("./GoalDetailPage");

/** Fixture goal with two linked projects (one done, one not). */
function makeGoal(overrides: Record<string, unknown> = {}) {
  return {
    id: "g1",
    permalink: "grow-audience",
    name: "Grow audience",
    description: "Reach 10k followers",
    isDone: false,
    lensId: "lens-1",
    projects: [
      { id: "p1", permalink: "newsletter", name: "Newsletter", isDone: true, order: 0, dueDate: null, tasks: [{ id: "t2", isDone: true }] },
      { id: "p2", permalink: "twitter", name: "Twitter", isDone: false, order: 1, dueDate: null, tasks: [{ id: "t3", isDone: false }] },
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
            <Route path="/do/goals/:permalink" element={<GoalDetailPage />} />
            <Route path="/do/goals" element={<div data-testid="goals-list" />} />
            <Route path="/do/projects/:permalink" element={<div data-testid="project-detail" />} />
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
});

describe("GoalDetailPage — header affordances (goal-planning spec §B, §C)", () => {
  it("shows Complete (not Reopen) when the goal is active", () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    expect(screen.getByRole("button", { name: /^complete$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reopen$/i })).toBeNull();
  });

  it("clicking Complete fires setGoalDone({ isDone: true })", async () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));
    await waitFor(() =>
      expect(setGoalDone).toHaveBeenCalledWith({ id: "g1", isDone: true }),
    );
  });

  it("shows Reopen when the goal is already done", () => {
    goalData.current = makeGoal({ isDone: true });
    renderAt("/do/goals/g1");
    expect(screen.getByRole("button", { name: /^reopen$/i })).toBeInTheDocument();
  });
});

describe("GoalDetailPage — inline edit (§C)", () => {
  it("Edit reveals name + description inputs, Save fires updateGoal", async () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const nameInput = await screen.findByLabelText(/outcome/i);
    const descInput = screen.getByLabelText(/why this matters/i);
    fireEvent.change(nameInput, { target: { value: "Grow audience fast" } });
    fireEvent.change(descInput, { target: { value: "Reach 20k" } });
    fireEvent.click(screen.getByRole("button", { name: /^save changes$/i }));

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
    renderAt("/do/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    // Goals only own aligned projects. Standalone task creation from goals was
    // removed; tasks live in Inbox or Projects.
    const dialog = screen.getByRole("dialog", { name: /delete this goal/i });
    expect(dialog.textContent).toMatch(/2 items will move to standalone/);
  });

  it("the delete dialog fires deleteGoal on confirm", async () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete goal$/i }));
    await waitFor(() => expect(deleteGoal).toHaveBeenCalledWith({ id: "g1" }));
  });
});

describe("GoalDetailPage — Focus line (spec §E)", () => {
  it("surfaces the first non-done project as 'Focus: <name>' with a link", () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    // p1 is done, p2 (Twitter) is the first non-done → "Focus: Twitter".
    const focusLine = screen.getByText(/Focus:/);
    expect(focusLine.textContent).toMatch(/Twitter/);
    expect(screen.getByRole("link", { name: "Twitter" })).toHaveAttribute(
      "href",
      "/do/projects/twitter",
    );
  });

  it("hides the Focus line when every project under the goal is done", () => {
    goalData.current = makeGoal({
      projects: [
        { id: "p1", permalink: "done-one", name: "Done one", isDone: true, order: 0, dueDate: null, tasks: [] },
      ],
    });
    renderAt("/do/goals/g1");
    expect(screen.queryByText(/Focus:/)).toBeNull();
  });

  it("hides the Focus line when the goal has no projects", () => {
    goalData.current = makeGoal({ projects: [] });
    renderAt("/do/goals/g1");
    expect(screen.queryByText(/Focus:/)).toBeNull();
  });
});

describe("GoalDetailPage — reorder (spec §E)", () => {
  it("the up button on the second project fires reorderGoalProjects with the swapped order", async () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
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
    renderAt("/do/goals/g1");
    expect(screen.getByRole("button", { name: /move newsletter up/i })).toBeDisabled();
  });

  it("the last project's down button is disabled (boundary)", () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    expect(screen.getByRole("button", { name: /move twitter down/i })).toBeDisabled();
  });
});

describe("GoalDetailPage — project alignment only", () => {
  it("does not expose project/task creation controls from the goal page", () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    expect(screen.queryByRole("button", { name: /^add project$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^add task$/i })).toBeNull();
  });
});

describe("GoalDetailPage — breadcrumb navigation (breadcrumb-nav spec)", () => {
  it("renders a breadcrumb with the goal name as the active crumb", () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    // The active crumb has aria-current="location".
    const activeCrumb = screen.getByRole("button", { name: "Grow audience" });
    expect(activeCrumb).toHaveAttribute("aria-current", "location");
  });

  it("renders a Goals-list crumb that navigates to /do/goals on click", () => {
    goalData.current = makeGoal();
    renderAt("/do/goals/g1");
    fireEvent.click(screen.getByRole("button", { name: "Goals" }));
    // The /do/goals route in the test router renders a div with testid
    // "goals-list" — if we navigated there, it should be present.
    expect(screen.getByTestId("goals-list")).toBeInTheDocument();
  });
});
