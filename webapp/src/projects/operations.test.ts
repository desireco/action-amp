import { describe, it, expect } from "vitest";
import { getProjects, createProject } from "./operations";
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
