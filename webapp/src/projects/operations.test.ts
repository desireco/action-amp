// @vitest-environment node
// Server project (see vitest.config.ts): the REAL entitlement guards run —
// genuine HttpError 402/404/400/409s, no module mocking. Guard-gated ops need
// an entitled user AND a lens the guards can resolve, so every non-anonymous
// fixture goes through guarded().
import { beforeEach, describe, it, expect, vi } from "vitest";

import {
  getProjects,
  createProject,
  getProject,
  createTask,
  setProjectDone,
  moveProject,
  updateProject,
  deleteProject,
  updateTask,
} from "./operations";
import { mockContext, type MockContext } from "../test/mockContext";

// planRenewsAt is load-bearing: isPlanActive treats PRO with a null/past
// renewal as FREE (the old mocked guards hid this).
const FUTURE = new Date(Date.now() + 60_000);

/** An entitled context the REAL guards admit: active PRO user + a Lens the
 *  guards resolve as included and LIFE_AREA. */
function guarded(): MockContext {
  const m = mockContext({
    id: "user-1",
    plan: "PRO",
    planRenewsAt: FUTURE,
  });
  m.entities.Lens.findFirst.mockResolvedValue({
    id: "project-lens",
    name: "Me",
    isIncluded: true,
    type: "LIFE_AREA",
  });
  m.entities.Project.count.mockResolvedValue(0);
  return m;
}

/**
 * Projects operations — getProjects (two-query aggregation) + createProject.
 *
 * getProjects is the interesting one: it fires two Project.findMany calls
 * (first for the list with includes, second for done-task totals) then merges
 * them into a progress-fraction return shape. We mock both and assert the merge.
 */
// SAFETY: fixture widens null to match Prisma's Date | null runtime type.
const PROJECT_ROW = {
  id: "proj-1",
  permalink: "ship-product-v2",
  name: "Ship product v2",
  dueDate: null as Date | null,
  goal: { id: "goal-1", permalink: "grow-audience", name: "Grow audience" },
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
  _count: { tasks: 2 },
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
    const m = guarded();
    // First findMany = the list with includes; second = the totals.
    m.entities.Project.findMany
      .mockResolvedValueOnce([PROJECT_ROW])
      .mockResolvedValueOnce([PROJECT_TOTALS]);

    const result = await getProjects({ lensId: "lens-1" }, m.context);

    expect(result).toEqual([
      {
        id: "proj-1",
        permalink: "ship-product-v2",
        name: "Ship product v2",
        dueDate: null,
        goal: {
          id: "goal-1",
          permalink: "grow-audience",
          name: "Grow audience",
        },
        openCount: 2,
        doneCount: 1,
        nextAction: expect.objectContaining({
          id: "task-1",
          description: "Email Sarah",
        }),
      },
    ]);

    // Both calls scoped by lens + user.
    expect(m.entities.Project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lensId: "lens-1",
          userId: "user-1",
          isDone: false,
        }),
      }),
    );
    expect(m.entities.Project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          // Open count excludes declined tasks — they live in the Logbook.
          _count: {
            select: {
              tasks: { where: { isDone: false, status: { not: "WONT_DO" } } },
            },
          },
        }),
      }),
    );
  });

  it("defaults doneCount to 0 when totals lookup misses", async () => {
    const m = guarded();
    m.entities.Project.findMany
      .mockResolvedValueOnce([PROJECT_ROW])
      .mockResolvedValueOnce([]); // no totals for this project

    const result = await getProjects({ lensId: "lens-1" }, m.context);
    expect(result[0].doneCount).toBe(0);
  });

  it("nextAction is null when a project has no open tasks", async () => {
    const m = guarded();
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
    const m = guarded();
    await expect(
      createProject({ name: "  ", lensId: "l" }, m.context),
    ).rejects.toThrow(/Project name is required/);
  });
});

describe("createProject — happy path", () => {
  it("creates with trimmed name, returns id + name", async () => {
    const m = guarded();
    m.entities.Project.create.mockResolvedValue({
      id: "proj-9",
      permalink: "new-thing",
      name: "New thing",
    });
    m.entities.Project.count.mockResolvedValue(2);

    const result = await createProject(
      {
        name: "  New thing  ",
        lensId: "lens-1",
        goalId: "goal-1",
        description: "desc",
      },
      m.context,
    );

    expect(result).toEqual({
      id: "proj-9",
      permalink: "new-thing",
      name: "New thing",
    });
    expect(m.entities.Project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "New thing",
        permalink: "new-thing",
        userId: "user-1",
        lensId: "lens-1",
        goalId: "goal-1",
        description: "desc",
        order: 2, // seeded to count of existing projects under this goal
      }),
      select: { id: true, permalink: true, name: true },
    });
  });

  it("seeds order=0 for a standalone project (no goal)", async () => {
    const m = guarded();
    m.entities.Project.create.mockResolvedValue({
      id: "p",
      permalink: "bare",
      name: "Bare",
    });

    await createProject({ name: "Bare", lensId: "l" }, m.context);

    expect(m.entities.Project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        permalink: "bare",
        goalId: undefined,
        description: undefined,
        order: 0,
      }),
      select: { id: true, permalink: true, name: true },
    });
    // No goal → no goal-scoped count for order seeding. The cap-check count
    // call still happens (it scopes by lens + isDone, not goalId).
    expect(m.entities.Project.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ goalId: expect.anything() }),
      }),
    );
  });
});
// SAFETY: fixture widens null to match Prisma's Date | null runtime type.
const PROJECT_DETAIL_ROW = {
  id: "proj-1",
  permalink: "ship-product-v2",
  name: "Ship product v2",
  description: "The next milestone",
  dueDate: null as Date | null,
  isDone: false,
  order: 0,
  lensId: "lens-1",
  goal: { id: "goal-1", permalink: "grow-audience", name: "Grow audience" },
  tasks: [
    {
      id: "t-1",
      description: "Email Sarah",
      isDone: false,
      priority: "IMPORTANT",
      size: "S",
      status: "TODAY",
      dueDate: null,
    },
    {
      id: "t-2",
      description: "Draft spec",
      isDone: true,
      priority: "NORMAL",
      size: "M",
      status: "SOMEDAY",
      dueDate: null,
    },
  ],
};

describe("getProject — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getProject({ id: "proj-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("getProject — happy path", () => {
  it("returns the project with its tasks + lensId for scoping", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValue(PROJECT_DETAIL_ROW);

    const result = await getProject({ id: "proj-1" }, m.context);

    expect(result).toMatchObject({
      id: "proj-1",
      permalink: "ship-product-v2",
      name: "Ship product v2",
      lensId: "lens-1",
      goal: { id: "goal-1", permalink: "grow-audience", name: "Grow audience" },
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: "t-1", description: "Email Sarah" }),
        expect.objectContaining({
          id: "t-2",
          description: "Draft spec",
          isDone: true,
        }),
      ]),
    });

    // Tenancy-safe: scoped by id AND userId.
    expect(m.entities.Project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          OR: [{ id: "proj-1" }, { permalink: "proj-1" }],
        },
        include: expect.objectContaining({
          tasks: expect.objectContaining({
            select: expect.objectContaining({ content: true }),
          }),
        }),
      }),
    );
  });

  it("returns null when the project isn't found (or isn't the user's)", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValue(null);

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
    const m = guarded();
    await expect(
      createTask(
        { description: "   ", lensId: "l", projectId: "p" },
        m.context,
      ),
    ).rejects.toThrow(/description is required/);
  });

  it("throws when the target project is missing or belongs to another user", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(null);

    await expect(
      createTask(
        { description: "x", lensId: "spoofed-lens", projectId: "proj-1" },
        m.context,
      ),
    ).rejects.toThrow(/Project not found/);
    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });
});

describe("createTask — happy path", () => {
  it("creates a project task scoped to the persisted project's lens", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "proj-1",
      lensId: "project-lens",
      userId: "user-1",
      permalink: "mvp",
    });
    m.entities.Task.create.mockResolvedValue({
      id: "task-9",
      permalink: "mvp-set-up-ci",
    });

    const result = await createTask(
      {
        description: "  Set up CI  ",
        lensId: "spoofed-lens",
        projectId: "proj-1",
      },
      m.context,
    );

    expect(result).toEqual({ id: "task-9", permalink: "mvp-set-up-ci" });
    // The REAL guard resolved the persisted project's lens (not the client's
    // spoofed-lens): its tenancy-safe lookup queried project-lens.
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "project-lens", userId: "user-1" },
      }),
    );
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Set up CI", // trimmed
        userId: "user-1",
        lensId: "project-lens", // from the persisted project, not client input
        projectId: "proj-1",
        permalink: "mvp-set-up-ci",
        status: "UPCOMING", // the triage default — actionable, surfaces on Next
        priority: "NORMAL",
        size: "M",
      }),
      select: { id: true, permalink: true },
    });
  });
});

// ================================================================
// goal-planning spec — new project ops (§A, §B, §C)
// ================================================================

// ----------------------------------------------------------------
// setProjectDone — lifecycle
// ----------------------------------------------------------------
describe("setProjectDone — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      setProjectDone({ id: "p1", isDone: true }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws on unknown id (tenancy — wrong user looks like not-found)", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(null);
    await expect(
      setProjectDone({ id: "p1", isDone: true }, m.context),
    ).rejects.toThrow(/Project not found/);
  });

  it("throws when the project belongs to a different user", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      isDone: false,
      userId: "other-user",
      lensId: "lens-1",
    });
    await expect(
      setProjectDone({ id: "p1", isDone: true }, m.context),
    ).rejects.toThrow(/Project not found/);
    expect(m.entities.Project.update).not.toHaveBeenCalled();
  });
});

describe("setProjectDone — happy path", () => {
  it("stamps isDone + completedAt when marking done", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      isDone: false,
      userId: "user-1",
      lensId: "lens-1",
    });
    m.entities.Project.update.mockResolvedValue({ id: "p1" });

    await setProjectDone({ id: "p1", isDone: true }, m.context);

    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { isDone: true, completedAt: expect.any(Date) },
      select: { id: true },
    });
  });

  it("is idempotent — no update when already in the requested state", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      isDone: true,
      userId: "user-1",
      lensId: "lens-1",
    });

    await setProjectDone({ id: "p1", isDone: true }, m.context);
    expect(m.entities.Project.update).not.toHaveBeenCalled();
  });
});

describe("moveProject", () => {
  it("moves the project and all of its actions to an owned Life-area Lens", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValue({
      id: "p1",
      lensId: "source",
    });
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "target",
      type: "LIFE_AREA",
    });
    m.entities.Task.updateMany.mockResolvedValue({ count: 2 });
    m.entities.Project.update.mockResolvedValue({ id: "p1" });

    await expect(
      moveProject({ id: "p1", targetLensId: "target" }, m.context),
    ).resolves.toEqual({
      id: "p1",
      movedTaskCount: 2,
    });
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", userId: "user-1" },
      data: { lensId: "target", goalId: null },
    });
    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { lensId: "target", goalId: null },
      select: { id: true },
    });
  });

  it("does not move a project into a Lens that is not owned by the user", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValue({
      id: "p1",
      lensId: "source",
    });
    m.entities.Lens.findFirst.mockResolvedValue(null);
    await expect(
      moveProject({ id: "p1", targetLensId: "other-user-lens" }, m.context),
    ).rejects.toThrow(/Destination Lens not found/);
    expect(m.entities.Project.update).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// updateProject — edit + re-link to goal
// ----------------------------------------------------------------
describe("updateProject — guards", () => {
  it("throws 404 when the project doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(null);
    await expect(
      updateProject({ id: "p1", name: "X" }, m.context),
    ).rejects.toMatchObject({ statusCode: 404, message: "Project not found." });
  });

  it("throws on empty name", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      name: "Old",
      lensId: "lens-1",
    });
    await expect(
      updateProject({ id: "p1", name: "" }, m.context),
    ).rejects.toThrow(/cannot be empty/);
  });

  it("throws 404 when the target goal doesn't exist", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      name: "X",
      lensId: "lens-1",
    });
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(
      updateProject({ id: "p1", goalId: "missing-goal" }, m.context),
    ).rejects.toMatchObject({ statusCode: 404, message: "Goal not found." });
  });

  it("rejects cross-Lens re-link (same-Lens invariant)", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      name: "X",
      lensId: "lens-1",
    });
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      lensId: "lens-2",
    }); // different lens

    await expect(
      updateProject({ id: "p1", goalId: "g1" }, m.context),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/same Lens/),
    });
    expect(m.entities.Project.update).not.toHaveBeenCalled();
  });

  it("rewrites a Prisma P2002 (name duplicate) into a 409", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      name: "Old",
      lensId: "lens-1",
    });
    const prismaError = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    m.entities.Project.update.mockRejectedValue(prismaError);

    await expect(
      updateProject({ id: "p1", name: "Dup" }, m.context),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/Dup/),
    });
  });
});

describe("updateProject — happy path", () => {
  it("re-links a project to a goal in the same Lens", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      name: "X",
      lensId: "lens-1",
    });
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      lensId: "lens-1",
    }); // same lens
    m.entities.Project.update.mockResolvedValue({
      id: "p1",
      name: "X",
      description: null,
      goalId: "g1",
    });

    const result = await updateProject({ id: "p1", goalId: "g1" }, m.context);

    expect(result.goalId).toBe("g1");
    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { goalId: "g1" },
      select: { id: true, name: true, description: true, goalId: true },
    });
  });

  it("unlinks a project (goalId → null)", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      name: "X",
      lensId: "lens-1",
    });
    m.entities.Project.update.mockResolvedValue({
      id: "p1",
      name: "X",
      description: null,
      goalId: null,
    });

    await updateProject({ id: "p1", goalId: null }, m.context);

    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { goalId: null },
      select: { id: true, name: true, description: true, goalId: true },
    });
  });
});

// ----------------------------------------------------------------
// deleteProject — explicit action disposition
// ----------------------------------------------------------------
describe("deleteProject — guards", () => {
  it("throws 404 when the project doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(null);
    await expect(deleteProject({ id: "p1" }, m.context)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("deleteProject — action disposition", () => {
  it("deletes child actions when requested, then deletes the project", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      lensId: "lens-1",
    });
    m.entities.Task.findMany.mockResolvedValue([
      { id: "t1", description: "Email Sarah", content: null },
      { id: "t2", description: "Draft spec", content: "Context" },
    ]);

    const result = await deleteProject(
      { id: "p1", taskDisposition: "delete" },
      m.context,
    );

    expect(result).toEqual({ id: "p1", affectedTaskCount: 2 });
    expect(m.entities.Task.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] } },
    });
    expect(m.entities.Project.delete).toHaveBeenCalledWith({
      where: { id: "p1" },
      select: { id: true },
    });
  });

  it("sends child actions back to Triage with their notes", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      lensId: "lens-1",
    });
    m.entities.Task.findMany.mockResolvedValue([
      { id: "t1", description: "Email Sarah", content: "Send the outline" },
    ]);

    await deleteProject({ id: "p1", taskDisposition: "triage" }, m.context);

    expect(m.entities.InboxItem.create).toHaveBeenCalledWith({
      data: {
        text: "Email Sarah",
        content: "Send the outline",
        userId: "user-1",
        parsedTags: [],
      },
    });
    expect(m.entities.Task.deleteMany).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// updateTask — re-link a standalone task (§C, narrowed per spec)
// ----------------------------------------------------------------
describe("updateTask — guards", () => {
  it("throws 404 when the task doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue(null);
    await expect(
      updateTask({ id: "t1", projectId: "p1" }, m.context),
    ).rejects.toMatchObject({ statusCode: 404, message: "Task not found." });
  });

  it("throws when both projectId and goalId are set (one-parent rule)", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue({
      id: "t1",
      lensId: "lens-1",
      projectId: null,
      goalId: null,
    });
    await expect(
      updateTask({ id: "t1", projectId: "p1", goalId: "g1" }, m.context),
    ).rejects.toThrow(/one parent/);
  });

  it("rejects cross-Lens re-link to a project in a different Lens", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue({
      id: "t1",
      lensId: "lens-1",
      projectId: null,
      goalId: null,
    });
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      lensId: "lens-2",
    });

    await expect(
      updateTask({ id: "t1", projectId: "p1" }, m.context),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/same Lens/),
    });
  });
});

describe("updateTask — happy path", () => {
  it("moves a task into a project in the same Lens, clearing goalId", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue({
      id: "t1",
      lensId: "lens-1",
      projectId: null,
      goalId: "g1",
    });
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      lensId: "lens-1",
    });
    m.entities.Task.update.mockResolvedValue({
      id: "t1",
      projectId: "p1",
      goalId: null,
    });

    const result = await updateTask({ id: "t1", projectId: "p1" }, m.context);

    expect(result).toEqual({ id: "t1", projectId: "p1", goalId: null });
    // One-parent rule enforced on commit too: goalId cleared.
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { projectId: "p1", goalId: null },
      select: { id: true, projectId: true, goalId: true },
    });
  });

  it("unlinks a task (projectId → null)", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue({
      id: "t1",
      lensId: "lens-1",
      projectId: "p1",
      goalId: null,
    });
    m.entities.Task.update.mockResolvedValue({
      id: "t1",
      projectId: null,
      goalId: null,
    });

    await updateTask({ id: "t1", projectId: null }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { projectId: null },
      select: { id: true, projectId: true, goalId: true },
    });
  });
});
