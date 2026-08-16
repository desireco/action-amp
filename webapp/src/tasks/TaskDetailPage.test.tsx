// Component test for TaskDetailPage — breadcrumb navigation wiring.
// The task page has the deepest crumb chain (Goal › Project › Task) and the
// most fragile derivation, so this pins the route-model navigation.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---- Mock wasp ops ----
const taskData: { current: unknown } = { current: null };
const getTask = vi.fn();
const getProject = vi.fn();
const getProjects = vi.fn(() => []);
const getGoals = vi.fn(() => []);
const submitFeedback = vi.fn();
const setTaskOutcome = vi.fn();
const updateTaskDetails = vi.fn();

vi.mock("wasp/client/operations", () => ({
  useQuery: (fn: unknown) => {
    if (fn === getTask)
      return { data: taskData.current, isLoading: false, error: null };
    if (fn === getProject) return { data: null, isLoading: false, error: null };
    if (fn === getProjects) return { data: [], isLoading: false, error: null };
    if (fn === getGoals) return { data: [], isLoading: false, error: null };
    return { data: undefined, isLoading: false, error: null };
  },
  getTask,
  getProject,
  getProjects,
  getGoals,
  submitFeedback,
  setTaskOutcome,
  updateTaskDetails,
}));

const { TaskDetailPage } = await import("./TaskDetailPage");

/** Fixture task with both a goal and project ancestor. */
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    permalink: "send-issue-1",
    description: "Send issue #1",
    content: null,
    isDone: false,
    status: "UPCOMING",
    priority: "NORMAL",
    size: "M",
    dueDate: null,
    outcome: null,
    lensId: "lens-1",
    project: { id: "p1", permalink: "newsletter", name: "Newsletter" },
    goal: { id: "g1", permalink: "grow-audience", name: "Grow audience" },
    tags: [],
    updates: [],
    attachments: [],
    ...overrides,
  };
}

function renderAt(entry: string | { pathname: string; state?: unknown }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/do/tasks/:permalink" element={<TaskDetailPage />} />
          <Route
            path="/do/goals/:permalink"
            element={<div data-testid="goal-detail" />}
          />
          <Route
            path="/do/projects/:permalink"
            element={<div data-testid="project-detail" />}
          />
          <Route
            path="/do/upcoming"
            element={<div data-testid="upcoming" />}
          />
          <Route path="/do" element={<div data-testid="home" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  taskData.current = null;
});

describe("TaskDetailPage — breadcrumb (breadcrumb-nav spec)", () => {
  it("renders Goal › Project › Task crumbs when both ancestors exist", () => {
    taskData.current = makeTask();
    renderAt("/do/tasks/send-issue-1");
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toContain("Grow audience");
    expect(labels).toContain("Newsletter");
    expect(labels).toContain("Send issue #1");
  });

  it("navigates to the goal detail route when the goal crumb is clicked", () => {
    taskData.current = makeTask();
    renderAt("/do/tasks/send-issue-1");
    // Scope to the breadcrumb nav so we don't match PropertyChips buttons.
    const nav = screen.getByLabelText("Hierarchy");
    fireEvent.click(nav.querySelector("button")!); // first crumb = goal
    expect(screen.getByTestId("goal-detail")).toBeInTheDocument();
  });

  it("navigates to the project detail route when the project crumb is clicked", () => {
    taskData.current = makeTask();
    renderAt("/do/tasks/send-issue-1");
    const nav = screen.getByLabelText("Hierarchy");
    const buttons = nav.querySelectorAll("button");
    fireEvent.click(buttons[1]!); // second crumb = project
    expect(screen.getByTestId("project-detail")).toBeInTheDocument();
  });

  it("skips the project crumb when the task has a goal but no project", () => {
    taskData.current = makeTask({ project: null });
    renderAt("/do/tasks/send-issue-1");
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toContain("Grow audience");
    expect(labels).toContain("Send issue #1");
    expect(labels).not.toContain("Newsletter");
  });

  it("falls back to ← Back link when the task has no ancestors (standalone)", () => {
    taskData.current = makeTask({ project: null, goal: null });
    renderAt("/do/tasks/send-issue-1");
    // A standalone task has no ancestors → only 1 crumb → fallback to Back.
    expect(screen.getByText(/back/i)).toBeInTheDocument();
    // No breadcrumb nav element.
    expect(screen.queryByLabelText("Hierarchy")).toBeNull();
  });

  it("returns to the route supplied by the task opener", () => {
    taskData.current = makeTask({ project: null, goal: null });
    renderAt({
      pathname: "/do/tasks/send-issue-1",
      state: { returnTo: "/do/upcoming" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByTestId("upcoming")).toBeInTheDocument();
  });
});

describe("TaskDetailPage — captured attachments (TaskAttachment)", () => {
  it("shows thumbs for images carried onto the task by triage", () => {
    taskData.current = makeTask({
      attachments: [
        { id: "att-1", filename: "shot.png", mimeType: "image/png" },
        { id: "att-2", filename: "whiteboard.jpg", mimeType: "image/jpeg" },
      ],
    });
    renderAt("/do/tasks/send-issue-1");
    // AttachmentThumbs renders one <img> per image, alt = filename.
    expect(screen.getByAltText("shot.png")).toBeInTheDocument();
    expect(screen.getByAltText("whiteboard.jpg")).toBeInTheDocument();
  });

  it("renders no attachment row when the task has none", () => {
    taskData.current = makeTask();
    renderAt("/do/tasks/send-issue-1");
    expect(screen.queryByAltText(/\.(png|jpe?g|gif|webp)$/i)).toBeNull();
  });

  it("shows thumbs on the done panel too (read-only evidence)", () => {
    taskData.current = makeTask({
      isDone: true,
      attachments: [{ id: "att-1", filename: "receipt.png", mimeType: "image/png" }],
    });
    renderAt("/do/tasks/send-issue-1");
    expect(screen.getByAltText("receipt.png")).toBeInTheDocument();
  });
});
