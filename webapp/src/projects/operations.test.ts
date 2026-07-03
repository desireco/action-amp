// @vitest-environment node
// Server-op tests run in node: ops import entitlement guards that pull
// `wasp/server` (HttpError), blocked by detectServerImports in jsdom. No DOM
// APIs here — node is correct.
import { describe, it, expect, vi } from "vitest";

// Stub the server-only HttpError layer so this test never loads `wasp/server`.
// The guards become no-op resolves; the entitlement *throw* path (402 + ProGate
// body) is verified end-to-end. See goals/operations.test.ts for rationale.
vi.mock("../billing/entitlementHttp", () => ({
  assertLensAllowed: vi.fn().mockResolvedValue(undefined),
  assertUnderCap: vi.fn().mockResolvedValue(undefined),
}));
import { getProjects, createProject, getProject, createTask } from "./operations";
import { mockContext } from "../test/mockContext";

/**
 * Projects operations — getProjects (two-query aggregation) + createProject.
 *
 * getProjects is the interesting one: it fires two Project.findMany calls
 * (first for the list with includes, second for done-task totals) then merges
 * them into a progress-fraction return shape. We mock both and assert the merge.
 */

const PROJECT_ROW = {
  id: "proj-1",
  name: "Ship product v2",
  dueDate: null as Date | null,
  goal: { id: "goal-1", name: "Grow audience" },
  tasks: [
    {
      id: "task-1",
      description: "Email Sarah",
      priority: "IMPORTANT",
      size: "S",
      status: "TODAY",
      isDone: false,
    },
  ],
  _count: { tasks: 3 },
};

const PROJECT_TOTALS = {
  id: "proj-1",
  _count: { tasks: 1 },
};

describe("getProjects — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getProjects({ lensId: "lens-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("getProjects — happy path", () => {
  it("queries scoped to lens, merges open + done counts, returns nextAction", async () => {
    const m = mockContext();
    // First findMany = the list with includes; second = the totals.
    m.entities.Project.findMany
      .mockResolvedValueOnce([PROJECT_ROW])
      .mockResolvedValueOnce([PROJECT_TOTALS]);

    const result = await getProjects({ lensId: "lens-1" }, m.context);

    expect(result).toEqual([
      {
        id: "proj-1",
        name: "Ship product v2",
        dueDate: null,
        goal: { id: "goal-1", name: "Grow audience" },
        openCount: 3,
        doneCount: 1,
        nextAction: expect.objectContaining({ id: "task-1", description: "Email Sarah" }),
      },
    ]);

    // Both calls scoped by lens + user.
    expect(m.entities.Project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lensId: "lens-1", userId: "user-1", isDone: false }),
      }),
    );
  });

  it("defaults doneCount to 0 when totals lookup misses", async () => {
    const m = mockContext();
    m.entities.Project.findMany
      .mockResolvedValueOnce([PROJECT_ROW])
      .mockResolvedValueOnce([]); // no totals for this project

    const result = await getProjects({ lensId: "lens-1" }, m.context);
    expect(result[0].doneCount).toBe(0);
  });

  it("nextAction is null when a project has no open tasks", async () => {
    const m = mockContext();
    m.entities.Project.findMany
      .mockResolvedValueOnce([{ ...PROJECT_ROW, tasks: [] }])
      .mockResolvedValueOnce([]);

    const result = await getProjects({ lensId: "lens-1" }, m.context);
    expect(result[0].nextAction).toBeNull();
  });
});

describe("createProject — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      createProject({ name: "X", lensId: "l" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws on empty name", async () => {
    const m = mockContext();
    await expect(
      createProject({ name: "  ", lensId: "l" }, m.context),
    ).rejects.toThrow(/Project name is required/);
  });
});

describe("createProject — happy path", () => {
  it("creates with trimmed name, returns id + name", async () => {
    const m = mockContext();
    m.entities.Project.create.mockResolvedValue({ id: "proj-9", name: "New thing" });

    const result = await createProject(
      { name: "  New thing  ", lensId: "lens-1", goalId: "goal-1", description: "desc" },
      m.context,
    );

    expect(result).toEqual({ id: "proj-9", name: "New thing" });
    expect(m.entities.Project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "New thing",
        userId: "user-1",
        lensId: "lens-1",
        goalId: "goal-1",
        description: "desc",
      }),
      select: { id: true, name: true },
    });
  });

  it("works with optional fields omitted", async () => {
    const m = mockContext();
    m.entities.Project.create.mockResolvedValue({ id: "p", name: "Bare" });

    await createProject({ name: "Bare", lensId: "l" }, m.context);

    expect(m.entities.Project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ goalId: undefined, description: undefined }),
      select: { id: true, name: true },
    });
  });
});

const PROJECT_DETAIL_ROW = {
  id: "proj-1",
  name: "Ship product v2",
  description: "The next milestone",
  dueDate: null as Date | null,
  isDone: false,
  lensId: "lens-1",
  goal: { id: "goal-1", name: "Grow audience" },
  tasks: [
    { id: "t-1", description: "Email Sarah", isDone: false, priority: "IMPORTANT", size: "S", status: "TODAY", dueDate: null },
    { id: "t-2", description: "Draft spec", isDone: true, priority: "NORMAL", size: "M", status: "SOMEDAY", dueDate: null },
  ],
};

describe("getProject — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getProject({ id: "proj-1" }, m.context)).rejects.toThrow(/Not authenticated/);
  });
});

describe("getProject — happy path", () => {
  it("returns the project with its tasks + lensId for scoping", async () => {
    const m = mockContext();
    m.entities.Project.findUnique.mockResolvedValue(PROJECT_DETAIL_ROW);

    const result = await getProject({ id: "proj-1" }, m.context);

    expect(result).toMatchObject({
      id: "proj-1",
      name: "Ship product v2",
      lensId: "lens-1",
      goal: { id: "goal-1", name: "Grow audience" },
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: "t-1", description: "Email Sarah" }),
        expect.objectContaining({ id: "t-2", description: "Draft spec", isDone: true }),
      ]),
    });

    // Tenancy-safe: scoped by id AND userId.
    expect(m.entities.Project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "proj-1", userId: "user-1" } }),
    );
  });

  it("returns null when the project isn't found (or isn't the user's)", async () => {
    const m = mockContext();
    m.entities.Project.findUnique.mockResolvedValue(null);

    const result = await getProject({ id: "nope" }, m.context);
    expect(result).toBeNull();
  });
});

describe("createTask — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      createTask({ description: "x", lensId: "l", projectId: "p" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws on empty description", async () => {
    const m = mockContext();
    await expect(
      createTask({ description: "   ", lensId: "l", projectId: "p" }, m.context),
    ).rejects.toThrow(/description is required/);
  });
});

describe("createTask — happy path", () => {
  it("creates a task scoped to the project's lens, defaulting Upcoming / Normal / M", async () => {
    const m = mockContext();
    m.entities.Task.create.mockResolvedValue({ id: "task-9" });

    const result = await createTask(
      { description: "  Set up CI  ", lensId: "lens-1", projectId: "proj-1" },
      m.context,
    );

    expect(result).toEqual({ id: "task-9" });
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Set up CI", // trimmed
        userId: "user-1",
        lensId: "lens-1", // from the project, not the active lens
        projectId: "proj-1",
        status: "UPCOMING", // the triage default — actionable, surfaces on Next
        priority: "NORMAL",
        size: "M",
      }),
      select: { id: true },
    });
  });
});
