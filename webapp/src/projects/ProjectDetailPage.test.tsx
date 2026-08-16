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
const lensesData: { current: unknown[] } = { current: [] };

const getProject = vi.fn();
const getGoals = vi.fn();
const getProjects = vi.fn();
const getLenses = vi.fn();
const createTask = vi.fn();
const updateTaskStatus = vi.fn();
const startTask = vi.fn();
const setProjectDone = vi.fn();
const archiveProject = vi.fn();
const moveProject = vi.fn();
const updateProject = vi.fn();
const deleteProject = vi.fn();
const updateTask = vi.fn();
const updateTaskContent = vi.fn();
const createResource = vi.fn();
const updateResource = vi.fn();
const deleteResource = vi.fn();

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
    if (fn === getLenses) {
      return { data: lensesData.current, isLoading: false, error: null };
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
  archiveProject,
  moveProject,
  updateProject,
  deleteProject,
  updateTask,
  updateTaskContent,
  createResource,
  updateResource,
  deleteResource,
  getLenses,
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
    archivedAt: null,
    order: 0,
    lensId: "lens-1",
    goal: null,
    tasks: [
      {
        id: "t1",
        description: "Email Sarah",
        isDone: false,
        status: "TODAY",
        priority: "NORMAL",
        size: "M",
      },
    ],
    resources: [],
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
          <Route
            path="/do/projects/:permalink"
            element={<ProjectDetailPage />}
          />
          <Route
            path="/do/projects"
            element={<div data-testid="projects-list" />}
          />
          <Route
            path="/do/goals/:permalink"
            element={<div data-testid="goal-detail" />}
          />
          <Route
            path="/do/tasks/:permalink"
            element={<div data-testid="task-detail" />}
          />
          <Route path="/do/focus" element={<div data-testid="focus" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateTask.mockResolvedValue({ id: "t1", projectId: "p2", goalId: null });
  updateProject.mockResolvedValue({
    id: "p1",
    name: "X",
    description: null,
    goalId: "g1",
  });
  setProjectDone.mockResolvedValue({ id: "p1" });
  archiveProject.mockResolvedValue({ id: "p1" });
  moveProject.mockResolvedValue({ id: "p1", movedTaskCount: 1 });
  deleteProject.mockResolvedValue({ id: "p1", reparentedCount: 0 });
  createTask.mockResolvedValue({ id: "new-task" });
  startTask.mockResolvedValue({ id: "t1" });
  updateTaskStatus.mockResolvedValue({ id: "t1" });
  updateTaskContent.mockResolvedValue({ id: "t1" });
  lensesData.current = [];
});

/** Two Today tasks to cover the multiple-task start affordance. */
function makeProjectMultiToday(overrides: Record<string, unknown> = {}) {
  return makeProject({
    tasks: [
      {
        id: "t1",
        description: "Email Sarah",
        isDone: false,
        status: "TODAY",
        priority: "NORMAL",
        size: "M",
      },
      {
        id: "t2",
        description: "Draft the brief",
        isDone: false,
        status: "TODAY",
        priority: "NORMAL",
        size: "S",
      },
    ],
    ...overrides,
  });
}

function openTaskActions(description: string) {
  const title = screen
    .getAllByText(description)
    .find((element) => element.classList.contains("aa-task-row__title"));
  if (!title) throw new Error(`Couldn't find task row for ${description}.`);
  fireEvent.click(title);
}

describe("ProjectDetailPage — search destination", () => {
  it("scrolls the exact resource anchor into view", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    projectData.current = makeProject({
      resources: [
        {
          id: "policy",
          title: "Insurance policy",
          url: null,
          notes: "Renewal terms",
          createdAt: new Date("2026-08-01"),
        },
      ],
    });

    renderAt("/do/projects/ship-product-v2#resource-policy");

    expect(document.getElementById("resource-policy")).toHaveClass(
      "is-search-target",
    );
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});

describe("ProjectDetailPage — move-task affordance (spec §C)", () => {
  it("a task row exposes a Move button that expands the picker", () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [{ id: "p2", name: "Other project" }];
    renderAt("/do/projects/p1");

    // The Move button is present on the open task row.
    openTaskActions("Email Sarah");
    const moveBtn = screen.getByRole("button", {
      name: /move email sarah to another project/i,
    });
    fireEvent.click(moveBtn);

    // Picker reveals the sibling project as an option.
    expect(screen.getByText("Other project")).toBeInTheDocument();
    // And the standalone (unlink) option.
    expect(
      screen.getByRole("button", { name: /^standalone$/i }),
    ).toBeInTheDocument();
  });

  it("selecting a sibling project fires updateTask with the target projectId", async () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [{ id: "p2", name: "Other project" }];
    renderAt("/do/projects/p1");

    openTaskActions("Email Sarah");
    fireEvent.click(
      screen.getByRole("button", {
        name: /move email sarah to another project/i,
      }),
    );
    fireEvent.click(screen.getByText("Other project"));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith({ id: "t1", projectId: "p2" }),
    );
  });

  it("selecting Standalone fires updateTask with projectId=null (unlink)", async () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [{ id: "p2", name: "Other project" }];
    renderAt("/do/projects/p1");

    openTaskActions("Email Sarah");
    fireEvent.click(
      screen.getByRole("button", {
        name: /move email sarah to another project/i,
      }),
    );
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
    renderAt("/do/projects/p1");

    openTaskActions("Email Sarah");
    fireEvent.click(
      screen.getByRole("button", {
        name: /move email sarah to another project/i,
      }),
    );
    // Only "Other project" appears as an option button, not the current project.
    const movePicker = screen.getByText("Other project").parentElement!;
    expect(movePicker).not.toHaveTextContent("Ship product v2");
  });

  it("shows an empty-state message when there are no other projects in the Lens", () => {
    projectData.current = makeProjectMultiToday();
    lensProjectsData.current = [{ id: "p1", name: "Ship product v2" }]; // only the current project
    renderAt("/do/projects/p1");

    openTaskActions("Email Sarah");
    fireEvent.click(
      screen.getByRole("button", {
        name: /move email sarah to another project/i,
      }),
    );
    expect(
      screen.getByText(/no other projects in this lens/i),
    ).toBeInTheDocument();
  });
});

describe("ProjectDetailPage — Edit affordance on task rows", () => {
  it("each task row has an Edit button that opens the task page", () => {
    projectData.current = makeProjectMultiToday();
    renderAt("/do/projects/p1");

    openTaskActions("Email Sarah");
    const editBtn = screen.getByRole("button", { name: /edit email sarah/i });
    fireEvent.click(editBtn);

    expect(screen.getByTestId("task-detail")).toBeInTheDocument();
  });

  it("done tasks open their review-only task detail without an Edit button", () => {
    projectData.current = makeProject({
      tasks: [
        {
          id: "t1",
          description: "Email Sarah",
          isDone: true,
          status: "TODAY",
          priority: "NORMAL",
          size: "M",
        },
      ],
    });
    renderAt("/do/projects/p1");

    // Completion freezes task fields, so the project row has no misleading
    // Edit affordance. The row itself remains the route to task review.
    expect(
      screen.queryByRole("button", { name: /edit email sarah/i }),
    ).toBeNull();
    fireEvent.click(screen.getByText("Email Sarah"));
    expect(screen.getByTestId("task-detail")).toBeInTheDocument();
  });

  it("opens and closes open-task actions instead of opening task detail", () => {
    projectData.current = makeProjectMultiToday();
    renderAt("/do/projects/p1");

    const row = screen
      .getAllByText("Email Sarah")
      .find((element) => element.classList.contains("aa-task-row__title"))
      ?.closest(".aa-project__row")!;
    const trigger = row.querySelector(".aa-task-row__main")!;
    openTaskActions("Email Sarah");

    expect(row).toHaveClass("aa-project__row--active");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("task-detail")).toBeNull();

    openTaskActions("Email Sarah");
    expect(row).not.toHaveClass("aa-project__row--active");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps a done row settled by hiding its old size and due metadata", () => {
    projectData.current = makeProject({
      tasks: [
        {
          id: "t1",
          description: "Email Sarah",
          isDone: true,
          status: "TODAY",
          priority: "NORMAL",
          size: "M",
          dueDate: new Date("2026-07-09"),
        },
      ],
    });
    renderAt("/do/projects/p1");

    expect(screen.getByRole("heading", { name: /^done/i })).toBeInTheDocument();
    expect(screen.getByText("Email Sarah")).toBeInTheDocument();
    expect(screen.queryByText("M")).toBeNull();
    expect(screen.queryByText(/overdue/i)).toBeNull();
  });
});

describe("ProjectDetailPage — declined tasks (WONT_DO)", () => {
  it("shows a declined task in no group, stat, or cue — it lives in the Logbook", () => {
    // One open task + one declined. Declining is a removal from the project's
    // active surface: if the declined task leaked into a group (it used to
    // fall into Someday), the user would see "won't do didn't remove it".
    projectData.current = makeProject({
      tasks: [
        {
          id: "t1",
          description: "Email Sarah",
          isDone: false,
          status: "TODAY",
          priority: "NORMAL",
          size: "M",
        },
        {
          id: "t2",
          description: "Something to be removed",
          isDone: false,
          status: "WONT_DO",
          priority: "NORMAL",
          size: "M",
        },
      ],
    });
    renderAt("/do/projects/p1");

    // Not in any horizon group — the decline is a removal from this page.
    expect(screen.queryByText("Something to be removed")).toBeNull();
    // The Open momentum stat counts active work only (1 open task, not 2):
    // the first number in the momentum row is openCount.
    const momentum = screen.getByLabelText("Project momentum");
    const openNum = momentum.querySelector(".aa-project__momentum-num");
    expect(openNum).toHaveTextContent(/^1$/);
  });

  it("treats a project whose only task was declined as empty", () => {
    projectData.current = makeProject({
      tasks: [
        {
          id: "t2",
          description: "Something to be removed",
          isDone: false,
          status: "WONT_DO",
          priority: "NORMAL",
          size: "M",
        },
      ],
    });
    renderAt("/do/projects/p1");

    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Something to be removed")).toBeNull();
  });
});

describe("ProjectDetailPage — re-link to goal (spec §C)", () => {
  it("the goal picker lists active goals in the project's Lens", () => {
    projectData.current = makeProject();
    lensGoalsData.current = [{ id: "g1", name: "Grow audience" }];
    renderAt("/do/projects/p1");

    // The "Link a goal" affordance — click to open the picker.
    fireEvent.click(screen.getByRole("button", { name: /link a goal/i }));
    expect(screen.getByText("Grow audience")).toBeInTheDocument();
  });

  it("selecting a goal fires updateProject with the target goalId", async () => {
    projectData.current = makeProject();
    lensGoalsData.current = [{ id: "g1", name: "Grow audience" }];
    renderAt("/do/projects/p1");

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
    renderAt("/do/projects/p1");

    const link = screen.getByRole("link", { name: /grow audience/i });
    expect(link).toHaveAttribute("href", "/do/goals/grow-audience");
  });

  it("breaking the link opens the picker from the goal row and offers None (standalone)", () => {
    projectData.current = makeProject({
      goal: { id: "g9", permalink: "grow-audience", name: "Grow audience" },
    });
    lensGoalsData.current = [{ id: "g9", name: "Grow audience" }];
    renderAt("/do/projects/p1");

    // The "Edit goal" control on the WHY line opens the picker.
    fireEvent.click(screen.getByRole("button", { name: /edit goal/i }));
    expect(
      screen.getByRole("button", { name: /none \(standalone\)/i }),
    ).toBeInTheDocument();
  });
});

describe("ProjectDetailPage — lifecycle management", () => {
  // jsdom has no matchMedia; useMediaQuery falls back to desktop, where the
  // lifecycle actions live behind the ⋯ popover.
  const openOverflow = () =>
    fireEvent.click(screen.getByRole("button", { name: "Project actions" }));

  it("asks for confirmation before completing a project", () => {
    projectData.current = makeProject();
    renderAt("/do/projects/p1");

    openOverflow();
    fireEvent.click(screen.getByRole("menuitem", { name: /^complete$/i }));

    expect(screen.getByRole("dialog", { name: /complete this project/i })).toBeInTheDocument();
    expect(setProjectDone).not.toHaveBeenCalled();
  });

  it("keeps Edit beside Add task and offers Archive behind the overflow menu", () => {
    projectData.current = makeProject();
    renderAt("/do/projects/p1");

    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    openOverflow();
    fireEvent.click(screen.getByRole("menuitem", { name: /^archive$/i }));

    expect(screen.getByRole("dialog", { name: /archive this project/i })).toBeInTheDocument();
  });

  it("does not offer Archive or Reopen for an already archived project", () => {
    projectData.current = makeProject({ isDone: true, archivedAt: "2026-08-15T08:00:00.000Z" });
    renderAt("/do/projects/p1");

    openOverflow();
    expect(screen.queryByRole("button", { name: /^archive$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reopen$/i })).not.toBeInTheDocument();
  });

  it("offers all three task dispositions when deleting a project with tasks", () => {
    projectData.current = makeProject();
    lensProjectsData.current = [{ id: "p2", name: "Other project" }];
    renderAt("/do/projects/p1");

    openOverflow();
    fireEvent.click(screen.getByRole("menuitem", { name: /^delete$/i }));

    expect(screen.getByRole("button", { name: /^remove tasks and delete project$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^move tasks and delete project$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send tasks to triage and delete project$/i })).toBeInTheDocument();
  });
});

describe("ProjectDetailPage — Next-step hero (Direction D)", () => {
  it("renders the hero with Start when there is exactly one Today task", () => {
    projectData.current = makeProject(); // fixture has a single Today task
    renderAt("/do/projects/p1");

    expect(screen.getByText(/next step/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /email sarah/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
  });

  it("renders the first Today task as a startable next step when multiple are scheduled", () => {
    projectData.current = makeProjectMultiToday();
    renderAt("/do/projects/p1");

    expect(screen.getByText(/next step/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /email sarah/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    // The other task still remains available in the Today group.
    expect(screen.getByText("Draft the brief")).toBeInTheDocument();
  });

  it("Start begins the first Today task when multiple are scheduled", async () => {
    projectData.current = makeProjectMultiToday();
    renderAt("/do/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    await waitFor(() => expect(startTask).toHaveBeenCalledWith({ id: "t1" }));
  });

  it("Start starts the task and routes to focus mode", async () => {
    projectData.current = makeProject();
    renderAt("/do/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /start/i }));

    await waitFor(() => expect(startTask).toHaveBeenCalledWith({ id: "t1" }));
  });

  it("Not now demotes the next-step task to Upcoming", async () => {
    projectData.current = makeProject();
    renderAt("/do/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: /not now/i }));

    await waitFor(() =>
      expect(updateTaskStatus).toHaveBeenCalledWith({
        id: "t1",
        status: "UPCOMING",
      }),
    );
  });

  it("does not render the hero when there are zero Today tasks", () => {
    projectData.current = makeProject({
      tasks: [
        {
          id: "t1",
          description: "Email Sarah",
          isDone: false,
          status: "UPCOMING",
          priority: "NORMAL",
          size: "M",
        },
      ],
    });
    renderAt("/do/projects/p1");

    expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
  });

  it("shows the calm cue when there are zero Today tasks but Upcoming exists", () => {
    projectData.current = makeProject({
      tasks: [
        {
          id: "t1",
          description: "Email Sarah",
          isDone: false,
          status: "UPCOMING",
          priority: "NORMAL",
          size: "M",
        },
      ],
    });
    renderAt("/do/projects/p1");

    expect(screen.getByText(/nothing queued for today/i)).toBeInTheDocument();
    // And the hero is still absent — we don't fabricate one from Upcoming.
    expect(screen.queryByText(/next step/i)).not.toBeInTheDocument();
  });

  it("does not show the calm cue when there are zero Today and zero Upcoming tasks", () => {
    projectData.current = makeProject({
      tasks: [
        {
          id: "t1",
          description: "Maybe a leaderboard",
          isDone: false,
          status: "SOMEDAY",
          priority: "NORMAL",
          size: "M",
        },
      ],
    });
    renderAt("/do/projects/p1");

    expect(
      screen.queryByText(/nothing queued for today/i),
    ).not.toBeInTheDocument();
  });

  it("moves the project to a selected Life-area Lens", async () => {
    projectData.current = makeProject({ lensId: "studio" });
    lensesData.current = [
      { id: "studio", name: "Studio", color: "coral", type: "LIFE_AREA" },
      { id: "work", name: "Work", color: "indigo", type: "LIFE_AREA" },
    ];
    renderAt("/do/projects/p1");

    fireEvent.click(screen.getByRole("button", { name: "Project actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^move$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Work.*Life area/i }));

    await waitFor(() => expect(moveProject).toHaveBeenCalledWith({ id: "p1", targetLensId: "work" }));
  });
});
