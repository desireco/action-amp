// @vitest-environment node
// S5 — projects core tests, ported from webapp/src/projects/operations.test.ts
// and adapted to the pure cores: the auth checks (Wasp ops' "Not
// authenticated") live in the API layer's requireUser; the entitlement guards
// are tested against the domain's own guard functions. DB-work assertions are
// ported unchanged — the spies REPLACE the delegates entirely, so payloads
// arrive exactly as the cores pass them (no seam client-side defaults).
import { describe, it, expect, vi } from "vitest";

import {
  createProjectCore,
  createTaskCore,
  getProjectData,
  getProjectsData,
} from "./operationsCore.js";
import {
  archiveProjectCore,
  deleteProjectCore,
  moveProjectCore,
  setProjectDoneCore,
  updateProjectCore,
  updateTaskParentCore,
} from "./lifecycleCore.js";
import { assertLensAllowed, assertUnderCap } from "./guards.js";
import { HttpError } from "./httpError.js";
import { mockContext, type MockContext } from "../test/mockContext.js";

// planRenewsAt is load-bearing: isPlanActive treats PRO with a null/past
// renewal as FREE.
const FUTURE = new Date(Date.now() + 60_000);

function asProjects<F>(entities: MockContext["entities"]): F {
  // SAFETY: EntitySpy vi.fn()s satisfy the delegate slice at runtime.
  return entities as unknown as F;
}

/** An entitled context: active PRO user + a Lens the guards resolve as
 *  included (what assertLensAllowed wants). */
function guarded(): MockContext {
  const m = mockContext({
    id: "user-1",
    plan: "PRO",
    planRenewsAt: FUTURE,
  });
  m.entities.Lens.findFirst.mockResolvedValue({
    id: "lens-1",
    name: "Me",
    isIncluded: true,
  });
  m.entities.Project.count.mockResolvedValue(0);
  m.entities.Goal.count.mockResolvedValue(0);
  return m;
}

// SAFETY: fixtures widen literal types to match Prisma's runtime string
// representation (same as the webapp suite).
const PROJECT_ROW = {
  id: "proj-1",
  permalink: "ship-product-v2",
  name: "Ship product v2",
  description: null as string | null,
  dueDate: null as Date | null,
  isDone: false,
  type: "STANDARD" as string,
  completedAt: null as Date | null,
  archivedAt: null as Date | null,
  createdAt: new Date("2026-08-01T10:00:00Z"),
  userId: "user-1",
  lensId: "lens-1",
  goalId: "goal-1",
  order: 0,
  goal: { id: "goal-1", permalink: "grow-audience", name: "Grow audience" },
  tasks: [
    {
      id: "task-1",
      permalink: "email-sarah",
      description: "Email Sarah",
      priority: "IMPORTANT",
      size: "M",
      status: "TODAY",
      isDone: false,
    },
  ],
  resources: [],
  _count: { tasks: 2, listItems: 0 },
};

const PROJECT_TOTALS = {
  id: "proj-1",
  _count: { tasks: 1, listItems: 0 },
};

// ----------------------------------------------------------------
// getProjectsData (webapp: "queries scoped to lens, merges counts…")
// ----------------------------------------------------------------
describe("getProjectsData", () => {
  it("queries scoped to lens, merges open + done counts, returns nextAction", async () => {
    const m = guarded();
    // First findMany = the list with includes; second = the totals.
    m.entities.Project.findMany
      .mockResolvedValueOnce([PROJECT_ROW])
      .mockResolvedValueOnce([PROJECT_TOTALS]);

    const result = await getProjectsData(
      asProjects(m.entities),
      { userId: "user-1", lensId: "lens-1" },
    );

    expect(result).toMatchObject([
      {
        id: "proj-1",
        permalink: "ship-product-v2",
        name: "Ship product v2",
        dueDate: null,
        type: "STANDARD",
        goal: { id: "goal-1", name: "Grow audience" },
        openCount: 2,
        doneCount: 1,
        openItems: 0,
        checkedItems: 0,
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
              listItems: { where: { isDone: false } },
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

    const result = await getProjectsData(
      asProjects(m.entities),
      { userId: "user-1", lensId: "lens-1" },
    );
    expect(result[0].doneCount).toBe(0);
  });

  it("nextAction is null when a project has no open tasks", async () => {
    const m = guarded();
    m.entities.Project.findMany
      .mockResolvedValueOnce([{ ...PROJECT_ROW, tasks: [] }])
      .mockResolvedValueOnce([]);

    const result = await getProjectsData(
      asProjects(m.entities),
      { userId: "user-1", lensId: "lens-1" },
    );
    expect(result[0].nextAction).toBeNull();
  });
});

// ----------------------------------------------------------------
// getProjectData (webapp: "returns the project with its tasks + lensId")
// ----------------------------------------------------------------
describe("getProjectData", () => {
  it("resolves id OR permalink, tenancy-scoped", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValue(PROJECT_ROW);

    await getProjectData(asProjects(m.entities), {
      userId: "user-1",
      id: "ship-product-v2",
    });

    expect(m.entities.Project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          OR: [{ id: "ship-product-v2" }, { permalink: "ship-product-v2" }],
        },
      }),
    );
  });

  it("returns null when the project isn't found (or isn't the user's)", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValue(null);

    const result = await getProjectData(asProjects(m.entities), {
      userId: "user-1",
      id: "missing",
    });
    expect(result).toBeNull();
  });
});

// ----------------------------------------------------------------
// createProjectCore
// ----------------------------------------------------------------
describe("createProjectCore", () => {
  it("throws on empty name", async () => {
    const m = guarded();
    await expect(
      createProjectCore(asProjects(m.entities), {
        userId: "user-1",
        name: "  ",
        lensId: "lens-1",
      }),
    ).rejects.toThrow(/Project name is required/);
  });

  it("rejects SIMPLE_LIST with a goalId", async () => {
    const m = guarded();
    await expect(
      createProjectCore(asProjects(m.entities), {
        userId: "user-1",
        name: "List",
        lensId: "lens-1",
        goalId: "goal-1",
        type: "SIMPLE_LIST",
      }),
    ).rejects.toThrow(/Simple-list Project cannot sit under a Goal/);
  });

  it("creates with trimmed name + order seeded to the goal's project count", async () => {
    const m = guarded();
    m.entities.Project.create.mockResolvedValue({
      id: "proj-9",
      permalink: "new-thing",
      name: "New thing",
    });
    m.entities.Project.count.mockResolvedValue(2);
    m.entities.Project.findFirst.mockResolvedValue(null); // permalink probe

    const result = await createProjectCore(asProjects(m.entities), {
      userId: "user-1",
      name: "  New thing  ",
      lensId: "lens-1",
      goalId: "goal-1",
      description: "desc",
    });

    expect(result).toEqual({ id: "proj-9", permalink: "new-thing", name: "New thing" });
    expect(m.entities.Project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "New thing",
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
    m.entities.Project.findFirst.mockResolvedValue(null);

    await createProjectCore(asProjects(m.entities), {
      userId: "user-1",
      name: "Bare",
      lensId: "lens-1",
    });

    expect(m.entities.Project.count).not.toHaveBeenCalled();
    expect(m.entities.Project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ order: 0 }),
      select: { id: true, permalink: true, name: true },
    });
  });
});

// ----------------------------------------------------------------
// createTaskCore (webapp: "creates a project task scoped to the persisted
// project's lens")
// ----------------------------------------------------------------
describe("createTaskCore", () => {
  it("throws on empty description", async () => {
    const m = guarded();
    await expect(
      createTaskCore(asProjects(m.entities), {
        userId: "user-1",
        description: "   ",
        lensId: "lens-1",
      }),
    ).rejects.toThrow(/Task description is required/);
  });

  it("throws when the target project is missing or belongs to another user", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(null);
    await expect(
      createTaskCore(asProjects(m.entities), {
        userId: "user-1",
        description: "X",
        lensId: "lens-1",
        projectId: "missing",
      }),
    ).rejects.toThrow(/Project not found/);
  });

  it("creates a project task scoped to the persisted project's lens", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "proj-1",
      lensId: "lens-9",
      permalink: "ship-product-v2",
    });
    m.entities.Task.findFirst.mockResolvedValue(null); // permalink probe
    m.entities.Task.create.mockResolvedValue({ id: "task-9", permalink: "task-9" });

    const assertLens = vi.fn();
    const result = await createTaskCore(asProjects(m.entities), {
      userId: "user-1",
      description: "Record episode 1",
      lensId: "lens-1",
      projectId: "proj-1",
      assertLens,
    });

    expect(result).toEqual({ id: "task-9", permalink: "task-9" });
    // The guard runs against the RESOLVED lens (the project's), and the task
    // permalink source is the project-prefixed description.
    expect(assertLens).toHaveBeenCalledWith("lens-9");
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Record episode 1",
        permalink: "ship-product-v2-record-episode-1",
        lensId: "lens-9",
        projectId: "proj-1",
        goalId: null,
        status: "UPCOMING",
        priority: "NORMAL",
        size: "M",
      }),
      select: { id: true, permalink: true },
    });
  });

  it("throws when both parents are set (one-parent rule)", async () => {
    const m = guarded();
    await expect(
      createTaskCore(asProjects(m.entities), {
        userId: "user-1",
        description: "X",
        lensId: "lens-1",
        projectId: "proj-1",
        goalId: "goal-1",
      }),
    ).rejects.toThrow(/only be attached to one parent/);
  });
});

// ----------------------------------------------------------------
// setProjectDoneCore
// ----------------------------------------------------------------
describe("setProjectDoneCore", () => {
  it("throws on unknown id (tenancy — wrong user looks like not-found)", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(null);
    await expect(
      setProjectDoneCore(asProjects(m.entities), { userId: "user-1", id: "p1", isDone: true }),
    ).rejects.toThrow(/Project not found/);
  });

  it("stamps isDone + completedAt when marking done", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      isDone: false,
      userId: "user-1",
      lensId: "lens-1",
    });
    m.entities.Project.update.mockResolvedValue({ id: "p1" });

    const result = await setProjectDoneCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      isDone: true,
    });

    expect(result).toEqual({ id: "p1" });
    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { isDone: true, completedAt: expect.any(Date) },
      select: { id: true },
    });
  });

  it("clears completedAt when reopening", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      isDone: true,
      userId: "user-1",
      lensId: "lens-1",
    });
    m.entities.Project.update.mockResolvedValue({ id: "p1" });

    await setProjectDoneCore(asProjects(m.entities), { userId: "user-1", id: "p1", isDone: false });

    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { isDone: false, completedAt: null },
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

    const result = await setProjectDoneCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      isDone: true,
    });
    expect(result).toEqual({ id: "p1" });
    expect(m.entities.Project.update).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// archiveProjectCore
// ----------------------------------------------------------------
describe("archiveProjectCore", () => {
  it("sets archivedAt, isDone, and keeps an existing completedAt", async () => {
    const m = guarded();
    const completed = new Date("2026-08-15T09:00:00Z");
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      userId: "user-1",
      lensId: "lens-1",
      completedAt: completed,
      archivedAt: null,
    });
    m.entities.Project.update.mockResolvedValue({ id: "p1" });

    const result = await archiveProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1" });

    expect(result).toEqual({ id: "p1" });
    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { archivedAt: expect.any(Date), isDone: true, completedAt: completed },
      select: { id: true },
    });
  });

  it("is idempotent when already archived", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      userId: "user-1",
      lensId: "lens-1",
      completedAt: null,
      archivedAt: new Date(),
    });

    const result = await archiveProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1" });
    expect(result).toEqual({ id: "p1" });
    expect(m.entities.Project.update).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// moveProjectCore
// ----------------------------------------------------------------
describe("moveProjectCore", () => {
  it("moves the project and all of its actions to an owned lens, severing the goal link", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValueOnce({ id: "p1", lensId: "lens-1" }); // the project
    m.entities.Lens.findFirst.mockResolvedValueOnce({ id: "lens-2" }); // the target lens
    m.entities.Task.updateMany.mockResolvedValue({ count: 3 });
    m.entities.Project.update.mockResolvedValue({ id: "p1" });

    const result = await moveProjectCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      targetLensId: "lens-2",
    });

    expect(result).toEqual({ id: "p1", movedTaskCount: 3 });
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", userId: "user-1" },
      data: { lensId: "lens-2", goalId: null },
    });
    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { lensId: "lens-2", goalId: null },
      select: { id: true },
    });
  });

  it("no-ops when the target lens is the project's own", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValueOnce({ id: "p1", lensId: "lens-1" });

    const result = await moveProjectCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      targetLensId: "lens-1",
    });
    expect(result).toEqual({ id: "p1", movedTaskCount: 0 });
    expect(m.entities.Task.updateMany).not.toHaveBeenCalled();
  });

  it("does not move a project into a lens that is not owned by the user", async () => {
    const m = guarded();
    m.entities.Project.findFirst.mockResolvedValueOnce({ id: "p1", lensId: "lens-1" });
    m.entities.Lens.findFirst.mockResolvedValueOnce(null);

    await expect(
      moveProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1", targetLensId: "lens-x" }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Destination Lens not found." });
  });
});

// ----------------------------------------------------------------
// updateProjectCore
// ----------------------------------------------------------------
describe("updateProjectCore", () => {
  const EXISTING = { id: "p1", name: "Old", lensId: "lens-1", type: "STANDARD" as const };

  it("throws 404 when the project doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(null);
    await expect(
      updateProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1", name: "X" }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Project not found." });
  });

  it("throws on empty name", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(EXISTING);
    await expect(
      updateProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1", name: "   " }),
    ).rejects.toThrow(/cannot be empty/);
  });

  it("throws 404 when the target goal doesn't exist", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(EXISTING);
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(
      updateProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1", goalId: "missing" }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Goal not found." });
  });

  it("rejects cross-Lens re-link (same-Lens invariant)", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(EXISTING);
    m.entities.Goal.findUnique.mockResolvedValue({ id: "goal-2", lensId: "lens-2" });
    await expect(
      updateProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1", goalId: "goal-2" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A project and its goal must be in the same Lens.",
    });
  });

  it("rewrites a unique-constraint violation (name duplicate) into a 409", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(EXISTING);
    const prismaError = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    m.entities.Project.update.mockRejectedValue(prismaError);

    await expect(
      updateProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1", name: "Duplicate" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/Duplicate/),
    });
  });

  it("re-links a project to a goal in the same Lens", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(EXISTING);
    m.entities.Goal.findUnique.mockResolvedValue({ id: "goal-2", lensId: "lens-1" });
    m.entities.Project.update.mockResolvedValue({
      id: "p1",
      name: "Old",
      description: null,
      goalId: "goal-2",
    });

    const result = await updateProjectCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      goalId: "goal-2",
    });

    expect(result).toEqual({ id: "p1", name: "Old", description: null, goalId: "goal-2" });
    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { goalId: "goal-2" },
      select: { id: true, name: true, description: true, goalId: true },
    });
  });

  it("unlinks a project (goalId → null)", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(EXISTING);
    m.entities.Project.update.mockResolvedValue({
      id: "p1",
      name: "Old",
      description: null,
      goalId: null,
    });

    await updateProjectCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      goalId: null,
    });

    expect(m.entities.Goal.findUnique).not.toHaveBeenCalled();
    expect(m.entities.Project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { goalId: null },
      select: { id: true, name: true, description: true, goalId: true },
    });
  });

  it("blocks a type conversion while the project still has tasks", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(EXISTING);
    m.entities.Task.count.mockResolvedValue(2);
    m.entities.ListItem.count.mockResolvedValue(0);

    await expect(
      updateProjectCore(asProjects(m.entities), {
        userId: "user-1",
        id: "p1",
        type: "SIMPLE_LIST",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Move or remove this project's actions before changing its type.",
    });
  });
});

// ----------------------------------------------------------------
// deleteProjectCore
// ----------------------------------------------------------------
describe("deleteProjectCore", () => {
  const PROJECT = { id: "p1", lensId: "lens-1" };
  const TASKS = [
    { id: "t1", description: "Task one", content: "notes" as string | null },
    { id: "t2", description: "Task two", content: null },
  ];

  it("throws 404 when the project doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(null);
    await expect(
      deleteProjectCore(asProjects(m.entities), { userId: "user-1", id: "p1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deletes child actions when requested, then deletes the project + resources", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(PROJECT);
    m.entities.Task.findMany.mockResolvedValue(TASKS);
    m.entities.Task.deleteMany.mockResolvedValue({ count: 2 });
    m.entities.Resource.deleteMany.mockResolvedValue({ count: 1 });
    m.entities.Project.delete.mockResolvedValue({ id: "p1" });

    const result = await deleteProjectCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      taskDisposition: "delete",
    });

    expect(result).toEqual({ id: "p1", affectedTaskCount: 2 });
    expect(m.entities.Task.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] } },
    });
    // Resources are project-owned and leave with the project.
    expect(m.entities.Resource.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "p1", userId: "user-1" },
    });
    expect(m.entities.Project.delete).toHaveBeenCalledWith({
      where: { id: "p1" },
      select: { id: true },
    });
  });

  it("sends child actions back to Triage with their notes", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(PROJECT);
    m.entities.Task.findMany.mockResolvedValue(TASKS);
    m.entities.InboxItem.create.mockResolvedValue({ id: "inbox-1" });
    m.entities.Task.deleteMany.mockResolvedValue({ count: 2 });
    m.entities.Project.delete.mockResolvedValue({ id: "p1" });

    const result = await deleteProjectCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      taskDisposition: "triage",
    });

    expect(result).toEqual({ id: "p1", affectedTaskCount: 2 });
    expect(m.entities.InboxItem.create).toHaveBeenCalledTimes(2);
    expect(m.entities.InboxItem.create).toHaveBeenCalledWith({
      data: {
        text: "Task one",
        content: "notes",
        userId: "user-1",
        parsedTags: [],
      },
    });
    expect(m.entities.Task.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] } },
    });
  });

  it("reassigns tasks to a same-lens sibling project (goalId severed)", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(PROJECT);
    m.entities.Task.findMany.mockResolvedValue(TASKS);
    // The reassign-target lookup is the second Project.findFirst call.
    m.entities.Project.findFirst.mockResolvedValueOnce({ id: "target-1" });
    m.entities.Task.updateMany.mockResolvedValue({ count: 2 });
    m.entities.Project.delete.mockResolvedValue({ id: "p1" });

    const result = await deleteProjectCore(asProjects(m.entities), {
      userId: "user-1",
      id: "p1",
      taskDisposition: "reassign",
      targetProjectId: "target-1",
    });

    expect(result).toEqual({ id: "p1", affectedTaskCount: 2 });
    expect(m.entities.Project.findFirst).toHaveBeenCalledWith({
      where: {
        id: "target-1",
        userId: "user-1",
        lensId: "lens-1",
        isDone: false,
        archivedAt: null,
      },
      select: { id: true },
    });
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] } },
      data: { projectId: "target-1", goalId: null },
    });
  });

  it("requires a target project for the reassign disposition", async () => {
    const m = guarded();
    m.entities.Project.findUnique.mockResolvedValue(PROJECT);
    m.entities.Task.findMany.mockResolvedValue(TASKS);

    await expect(
      deleteProjectCore(asProjects(m.entities), {
        userId: "user-1",
        id: "p1",
        taskDisposition: "reassign",
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: "Choose a project for these actions." });
  });
});

// ----------------------------------------------------------------
// updateTaskParentCore
// ----------------------------------------------------------------
describe("updateTaskParentCore", () => {
  const TASK = { id: "t1", lensId: "lens-1", projectId: null, goalId: "goal-1" };

  it("throws 404 when the task doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue(null);
    await expect(
      updateTaskParentCore(asProjects(m.entities), { userId: "user-1", id: "t1", projectId: "p1" }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Task not found." });
  });

  it("throws when both projectId and goalId are set (one-parent rule)", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue(TASK);
    await expect(
      updateTaskParentCore(asProjects(m.entities), {
        userId: "user-1",
        id: "t1",
        projectId: "p1",
        goalId: "g1",
      }),
    ).rejects.toThrow(/only be attached to one parent/);
  });

  it("rejects cross-Lens re-link to a project in a different Lens", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue(TASK);
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      lensId: "lens-2",
      type: "STANDARD",
    });
    await expect(
      updateTaskParentCore(asProjects(m.entities), { userId: "user-1", id: "t1", projectId: "p1" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A task and its project must be in the same Lens.",
    });
  });

  it("moves a task into a project in the same Lens, clearing goalId", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue(TASK);
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      lensId: "lens-1",
      type: "STANDARD",
    });
    m.entities.Task.update.mockResolvedValue({ id: "t1", projectId: "p1", goalId: null });

    const result = await updateTaskParentCore(asProjects(m.entities), {
      userId: "user-1",
      id: "t1",
      projectId: "p1",
    });

    expect(result).toEqual({ id: "t1", projectId: "p1", goalId: null });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { projectId: "p1", goalId: null },
      select: { id: true, projectId: true, goalId: true },
    });
  });

  it("rejects a SIMPLE_LIST target project", async () => {
    const m = guarded();
    m.entities.Task.findUnique.mockResolvedValue(TASK);
    m.entities.Project.findUnique.mockResolvedValue({
      id: "p1",
      lensId: "lens-1",
      type: "SIMPLE_LIST",
    });
    await expect(
      updateTaskParentCore(asProjects(m.entities), { userId: "user-1", id: "t1", projectId: "p1" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "A task cannot live in a Simple-list Project.",
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
    m.entities.Task.update.mockResolvedValue({ id: "t1", projectId: null, goalId: null });

    await updateTaskParentCore(asProjects(m.entities), {
      userId: "user-1",
      id: "t1",
      projectId: null,
    });

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { projectId: null },
      select: { id: true, projectId: true, goalId: true },
    });
  });
});

// ----------------------------------------------------------------
// Guards — the entitlement decisions turned 402s (ported from the webapp
// ops' guard behavior; the pure decisions are billing/entitlements tests)
// ----------------------------------------------------------------
describe("entitlement guards", () => {
  it("assertLensAllowed throws 402 with the feature/reason payload for a FREE user on a locked lens", async () => {
    const m = mockContext({ id: "user-1", plan: "FREE" });
    m.entities.Lens.findFirst.mockResolvedValue({ name: "Work", isIncluded: false });

    await expect(
      assertLensAllowed(asProjects(m.entities), m.context.user, "lens-work"),
    ).rejects.toMatchObject({
      statusCode: 402,
      data: { feature: "another Lens", reason: "organize more areas of your life with Pro" },
    });
  });

  it("assertLensAllowed allows an included lens for a FREE user", async () => {
    const m = mockContext({ id: "user-1", plan: "FREE" });
    m.entities.Lens.findFirst.mockResolvedValue({ name: "Me", isIncluded: true });

    await expect(
      assertLensAllowed(asProjects(m.entities), m.context.user, "lens-1"),
    ).resolves.toBeUndefined();
  });

  it("assertUnderCap throws 402 with byte-exact projects-cap copy", () => {
    const m = mockContext({ id: "user-1", plan: "FREE" });
    expect(() =>
      assertUnderCap(m.context.user, 3, 3, {
        feature: "a 4th project",
        reason: "organize more than 3 projects with Pro",
      }),
    ).toThrow(HttpError);
    expect(() =>
      assertUnderCap(m.context.user, 3, 3, {
        feature: "a 4th project",
        reason: "organize more than 3 projects with Pro",
      }),
    ).toThrow(/a 4th project is a Pro feature\./);
  });
});
