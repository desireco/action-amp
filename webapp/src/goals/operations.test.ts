// @vitest-environment node
// Server-op tests run in node (not jsdom): the ops import entitlement guards
// that pull `wasp/server` (HttpError), which Wasp's detectServerImports plugin
// blocks in the client/jsdom env. These tests call ops as plain functions with
// a mock context — no DOM APIs — so node is the correct environment.
import { describe, it, expect, vi } from "vitest";

// Stub the server-only HttpError layer so the op test never loads
// `wasp/server` (blocked by detectServerImports under src/). These tests cover
// the getGoals aggregation + create guard-rails; the entitlement *throw* path
// (402 status + ProGate body) is verified end-to-end, not here.
vi.mock("../billing/entitlementHttp", () => ({
  assertLensAllowed: vi.fn().mockResolvedValue(undefined),
  assertUnderCap: vi.fn().mockResolvedValue(undefined),
  throwHttpStatus: vi.fn((status: number, message: string) => {
    throw new Error(`[${status}] ${message}`);
  }),
}));
import { getGoals, createGoal, setGoalDone, updateGoal, deleteGoal, reorderGoalProjects } from "./operations";
import { mockContext } from "../test/mockContext";

/**
 * Goals operations — getGoals (aggregation with progress calc) + createGoal.
 *
 * getGoals is interesting because it computes an aggregate progress percentage
 * across projects. Tasks do not align directly to goals.
 */

const GOAL_ROW = {
  id: "goal-1",
  permalink: "grow-audience",
  name: "Grow audience",
  description: "Reach 10k followers" as string | null,
  projects: [
    { id: "p1", permalink: "newsletter", name: "Newsletter", isDone: true, order: 0 },
    { id: "p2", permalink: "twitter", name: "Twitter", isDone: false, order: 1 },
  ],
};

describe("getGoals — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getGoals({ lensId: "lens-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("getGoals — happy path", () => {
  it("scopes by lens, computes aggregate progress across projects", async () => {
    const m = mockContext();
    m.entities.Goal.findMany.mockResolvedValue([GOAL_ROW]);

    const result = await getGoals({ lensId: "lens-1" }, m.context);

    expect(m.entities.Goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lensId: "lens-1", userId: "user-1", isDone: false }),
        orderBy: [{ name: "asc" }],
      }),
    );

    // 1 done project; 2 projects total → 50%.
    // "next" = first non-done project in order → Twitter.
    expect(result).toEqual([
      {
        id: "goal-1",
        permalink: "grow-audience",
        name: "Grow audience",
        description: "Reach 10k followers",
        projectCount: 2,
        progress: 50,
        nextProject: { id: "p2", permalink: "twitter", name: "Twitter" },
      },
    ]);
  });

  it("returns progress 0 + nextProject null for a goal with no projects", async () => {
    const m = mockContext();
    m.entities.Goal.findMany.mockResolvedValue([
      { ...GOAL_ROW, projects: [] },
    ]);

    const result = await getGoals({ lensId: "lens-1" }, m.context);
    expect(result[0].progress).toBe(0);
    expect(result[0].projectCount).toBe(0);
    expect(result[0].nextProject).toBeNull();
  });

  it("rounds progress to nearest integer", async () => {
    const m = mockContext();
    // 1 done out of 3 total → 33.33% → rounds to 33
    m.entities.Goal.findMany.mockResolvedValue([
      {
        ...GOAL_ROW,
        projects: [
          { id: "p1", permalink: "a", name: "A", isDone: true, order: 0 },
          { id: "p2", permalink: "b", name: "B", isDone: false, order: 1 },
          { id: "p3", permalink: "c", name: "C", isDone: false, order: 2 },
        ],
      },
    ]);

    const result = await getGoals({ lensId: "lens-1" }, m.context);
    expect(result[0].progress).toBe(33);
  });

  it("nextProject is null when every project under the goal is done", async () => {
    const m = mockContext();
    m.entities.Goal.findMany.mockResolvedValue([
      {
        ...GOAL_ROW,
        projects: [{ id: "p1", permalink: "done-one", name: "Done one", isDone: true, order: 0 }],
      },
    ]);
    const result = await getGoals({ lensId: "lens-1" }, m.context);
    expect(result[0].nextProject).toBeNull();
  });
});

describe("createGoal — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(createGoal({ name: "X", lensId: "l" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("throws on empty name", async () => {
    const m = mockContext();
    await expect(
      createGoal({ name: "", lensId: "l" }, m.context),
    ).rejects.toThrow(/Goal name is required/);
  });
});

describe("createGoal — happy path", () => {
  it("creates with trimmed name, returns id + name", async () => {
    const m = mockContext();
    m.entities.Goal.create.mockResolvedValue({ id: "goal-9", permalink: "new-goal", name: "New goal" });

    const result = await createGoal(
      { name: "  New goal  ", lensId: "lens-1", description: "some desc" },
      m.context,
    );

    expect(result).toEqual({ id: "goal-9", permalink: "new-goal", name: "New goal" });
    expect(m.entities.Goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "New goal",
        permalink: "new-goal",
        userId: "user-1",
        lensId: "lens-1",
        description: "some desc",
      }),
      select: { id: true, permalink: true, name: true },
    });
  });

  it("works without optional description", async () => {
    const m = mockContext();
    m.entities.Goal.create.mockResolvedValue({ id: "g", permalink: "bare", name: "Bare" });

    await createGoal({ name: "Bare", lensId: "l" }, m.context);

    expect(m.entities.Goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ permalink: "bare", description: undefined }),
      select: { id: true, permalink: true, name: true },
    });
  });
});

// ----------------------------------------------------------------
// setGoalDone — lifecycle (goal-planning spec §A, §B)
// ----------------------------------------------------------------
describe("setGoalDone — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(setGoalDone({ id: "g1", isDone: true }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("throws on unknown id (tenancy — wrong user looks like not-found)", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(setGoalDone({ id: "g1", isDone: true }, m.context)).rejects.toThrow(
      /Goal not found/,
    );
  });

  it("throws when the goal belongs to a different user", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      isDone: false,
      userId: "other-user",
      lensId: "lens-1",
    });
    await expect(setGoalDone({ id: "g1", isDone: true }, m.context)).rejects.toThrow(
      /Goal not found/,
    );
    expect(m.entities.Goal.update).not.toHaveBeenCalled();
  });
});

describe("setGoalDone — happy path", () => {
  it("stamps isDone + completedAt when marking done", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      isDone: false,
      userId: "user-1",
      lensId: "lens-1",
    });
    m.entities.Goal.update.mockResolvedValue({ id: "g1" });

    const result = await setGoalDone({ id: "g1", isDone: true }, m.context);

    expect(result).toEqual({ id: "g1" });
    expect(m.entities.Goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isDone: true, completedAt: expect.any(Date) },
      select: { id: true },
    });
  });

  it("clears isDone + completedAt when reopening", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      isDone: true,
      userId: "user-1",
      lensId: "lens-1",
    });
    m.entities.Goal.update.mockResolvedValue({ id: "g1" });

    await setGoalDone({ id: "g1", isDone: false }, m.context);

    expect(m.entities.Goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isDone: false, completedAt: null },
      select: { id: true },
    });
  });

  it("is idempotent — no update when already in the requested state", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      isDone: true,
      userId: "user-1",
      lensId: "lens-1",
    });

    const result = await setGoalDone({ id: "g1", isDone: true }, m.context);
    expect(result).toEqual({ id: "g1" });
    expect(m.entities.Goal.update).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// updateGoal — edit name + description (goal-planning spec §C)
// ----------------------------------------------------------------
describe("updateGoal — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(updateGoal({ id: "g1", name: "X" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("throws 404 when the goal doesn't exist or isn't the user's", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(updateGoal({ id: "g1", name: "X" }, m.context)).rejects.toThrow(
      /\[404\] Goal not found/,
    );
  });

  it("throws on empty name", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1", name: "Old" });
    await expect(updateGoal({ id: "g1", name: "   " }, m.context)).rejects.toThrow(
      /cannot be empty/,
    );
  });
});

describe("updateGoal — happy path", () => {
  it("renames with a trimmed name", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1", name: "Old" });
    m.entities.Goal.update.mockResolvedValue({ id: "g1", name: "New", description: null });

    const result = await updateGoal({ id: "g1", name: "  New  " }, m.context);

    expect(result).toEqual({ id: "g1", name: "New", description: null });
    expect(m.entities.Goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { name: "New" },
      select: { id: true, name: true, description: true },
    });
  });

  it("sets description (trimmed, empty → null)", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1", name: "X" });
    m.entities.Goal.update.mockResolvedValue({ id: "g1", name: "X", description: null });

    await updateGoal({ id: "g1", description: "   " }, m.context);

    expect(m.entities.Goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { description: null },
      select: { id: true, name: true, description: true },
    });
  });

  it("rewrites a Prisma P2002 (name duplicate) into a 409", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1", name: "Old" });
    const prismaError = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    m.entities.Goal.update.mockRejectedValue(prismaError);

    await expect(updateGoal({ id: "g1", name: "Duplicate" }, m.context)).rejects.toThrow(
      /\[409\].*Duplicate/,
    );
  });
});

// ----------------------------------------------------------------
// deleteGoal — lossless default (goal-planning spec §C)
// ----------------------------------------------------------------
describe("deleteGoal — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(deleteGoal({ id: "g1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("throws 404 when the goal doesn't exist or isn't the user's", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(deleteGoal({ id: "g1" }, m.context)).rejects.toThrow(/\[404\]/);
  });
});

describe("deleteGoal — lossless re-parenting", () => {
  it("re-parents child projects + tasks to goalId=null, then deletes the goal", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    m.entities.Project.count.mockResolvedValue(2);
    m.entities.Task.count.mockResolvedValue(3);

    const result = await deleteGoal({ id: "g1" }, m.context);

    expect(result).toEqual({ id: "g1", reparentedCount: 5 });
    expect(m.entities.Project.updateMany).toHaveBeenCalledWith({
      where: { goalId: "g1", userId: "user-1" },
      data: { goalId: null },
    });
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: { goalId: "g1", userId: "user-1" },
      data: { goalId: null },
    });
    expect(m.entities.Goal.delete).toHaveBeenCalledWith({
      where: { id: "g1" },
      select: { id: true },
    });
  });

  it("does not destroy child tasks — only the goal is deleted", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);

    await deleteGoal({ id: "g1" }, m.context);

    expect(m.entities.Task.deleteMany).not.toHaveBeenCalled();
    expect(m.entities.Project.deleteMany).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// reorderGoalProjects — explicit project sequence (goal-planning spec §E)
// ----------------------------------------------------------------
describe("reorderGoalProjects — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      reorderGoalProjects({ goalId: "g1", orderedIds: ["p1"] }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws 404 when the goal doesn't exist or isn't the user's", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(
      reorderGoalProjects({ goalId: "g1", orderedIds: ["p1"] }, m.context),
    ).rejects.toThrow(/\[404\]/);
  });

  it("rejects ids that do not belong to this goal (foreign ids)", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    // Only 1 of the 2 passed ids belongs to this goal.
    m.entities.Project.count.mockResolvedValue(1);

    await expect(
      reorderGoalProjects({ goalId: "g1", orderedIds: ["p1", "p2"] }, m.context),
    ).rejects.toThrow(/\[400\].*must belong/);
    expect(m.entities.Project.update).not.toHaveBeenCalled();
  });
});

describe("reorderGoalProjects — happy path", () => {
  it("writes order = index for each id, tenancy-checked", async () => {
    const m = mockContext();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    m.entities.Project.count.mockResolvedValue(3);

    await reorderGoalProjects({
      goalId: "g1",
      orderedIds: ["p3", "p1", "p2"],
    }, m.context);

    // One update per id, with the index as `order`.
    expect(m.entities.Project.update).toHaveBeenCalledTimes(3);
    expect(m.entities.Project.update).toHaveBeenNthCalledWith(1, {
      where: { id: "p3" },
      data: { order: 0 },
      select: { id: true },
    });
    expect(m.entities.Project.update).toHaveBeenNthCalledWith(2, {
      where: { id: "p1" },
      data: { order: 1 },
      select: { id: true },
    });
    expect(m.entities.Project.update).toHaveBeenNthCalledWith(3, {
      where: { id: "p2" },
      data: { order: 2 },
      select: { id: true },
    });
  });
});
