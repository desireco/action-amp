// @vitest-environment node
// S6 — goals core tests, ported from webapp/src/goals/operations.test.ts and
// adapted to the pure cores: auth checks live in the API layer's requireUser,
// entitlement guards in ../projects/guards. DB-work assertions are ported
// unchanged. deleteGoal tests cover the CORRECTED deletion (the webapp op's
// Resource.updateMany on the dropped goalId column is omitted — see the port
// header in lifecycleCore.ts).
import { describe, it, expect } from "vitest";

import { createGoalCore, getGoalData, getGoalsData } from "./operationsCore.js";
import {
  deleteGoalCore,
  reorderGoalProjectsCore,
  setGoalDoneCore,
  updateGoalCore,
} from "./lifecycleCore.js";
import { mockContext, type MockContext } from "../test/mockContext.js";

// planRenewsAt is load-bearing: isPlanActive treats PRO with a null/past
// renewal as FREE.
const FUTURE = new Date(Date.now() + 60_000);

function asGoal<F>(entities: MockContext["entities"]): F {
  // SAFETY: EntitySpy vi.fn()s satisfy the delegate slice at runtime.
  return entities as unknown as F;
}

/** An entitled context the guards admit: active PRO user + an included lens. */
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
  m.entities.Goal.count.mockResolvedValue(0);
  m.entities.Project.count.mockResolvedValue(0);
  return m;
}

// SAFETY: fixture widens literal to match Prisma's runtime string representation.
const GOAL_ROW = {
  id: "goal-1",
  permalink: "grow-audience",
  name: "Grow audience",
  description: "Reach 10k followers" as string | null,
  projects: [
    {
      id: "p1",
      permalink: "newsletter",
      name: "Newsletter",
      isDone: true,
      order: 0,
    },
    {
      id: "p2",
      permalink: "twitter",
      name: "Twitter",
      isDone: false,
      order: 1,
    },
  ],
};

// ----------------------------------------------------------------
// getGoalsData — aggregate progress + Focus rollup
// ----------------------------------------------------------------
describe("getGoalsData", () => {
  it("scopes by lens, computes aggregate progress across projects", async () => {
    const m = guarded();
    m.entities.Goal.findMany.mockResolvedValue([GOAL_ROW]);

    const result = await getGoalsData(asGoal(m.entities), {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(m.entities.Goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lensId: "lens-1",
          userId: "user-1",
          isDone: false,
        }),
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
    const m = guarded();
    m.entities.Goal.findMany.mockResolvedValue([{ ...GOAL_ROW, projects: [] }]);

    const result = await getGoalsData(asGoal(m.entities), {
      userId: "user-1",
      lensId: "lens-1",
    });
    expect(result[0].progress).toBe(0);
    expect(result[0].projectCount).toBe(0);
    expect(result[0].nextProject).toBeNull();
  });

  it("rounds progress to nearest integer", async () => {
    const m = guarded();
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

    const result = await getGoalsData(asGoal(m.entities), {
      userId: "user-1",
      lensId: "lens-1",
    });
    expect(result[0].progress).toBe(33);
  });

  it("nextProject is null when every project under the goal is done", async () => {
    const m = guarded();
    m.entities.Goal.findMany.mockResolvedValue([
      {
        ...GOAL_ROW,
        projects: [
          {
            id: "p1",
            permalink: "done-one",
            name: "Done one",
            isDone: true,
            order: 0,
          },
        ],
      },
    ]);
    const result = await getGoalsData(asGoal(m.entities), {
      userId: "user-1",
      lensId: "lens-1",
    });
    expect(result[0].nextProject).toBeNull();
  });
});

// ----------------------------------------------------------------
// getGoalData — id-or-permalink detail lookup
// ----------------------------------------------------------------
describe("getGoalData", () => {
  it("resolves id OR permalink, tenancy-scoped", async () => {
    const m = guarded();
    m.entities.Goal.findFirst.mockResolvedValue(GOAL_ROW);

    await getGoalData(asGoal(m.entities), { userId: "user-1", id: "grow-audience" });

    expect(m.entities.Goal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          OR: [{ id: "grow-audience" }, { permalink: "grow-audience" }],
        },
      }),
    );
  });
});

// ----------------------------------------------------------------
// createGoalCore
// ----------------------------------------------------------------
describe("createGoalCore", () => {
  it("throws on empty name", async () => {
    const m = guarded();
    await expect(
      createGoalCore(asGoal(m.entities), { userId: "user-1", name: "", lensId: "l" }),
    ).rejects.toThrow(/Goal name is required/);
  });

  it("creates with trimmed name, returns id + name", async () => {
    const m = guarded();
    m.entities.Goal.create.mockResolvedValue({
      id: "goal-9",
      permalink: "new-goal",
      name: "New goal",
    });
    m.entities.Goal.findFirst.mockResolvedValue(null); // permalink probe

    const result = await createGoalCore(asGoal(m.entities), {
      userId: "user-1",
      name: "  New goal  ",
      lensId: "lens-1",
      description: "some desc",
    });

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
    const m = guarded();
    m.entities.Goal.create.mockResolvedValue({
      id: "g",
      permalink: "bare",
      name: "Bare",
    });
    m.entities.Goal.findFirst.mockResolvedValue(null);

    await createGoalCore(asGoal(m.entities), {
      userId: "user-1",
      name: "Bare",
      lensId: "l",
    });

    expect(m.entities.Goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        permalink: "bare",
        description: undefined,
      }),
      select: { id: true, permalink: true, name: true },
    });
  });
});

// ----------------------------------------------------------------
// setGoalDoneCore — lifecycle (goal-planning spec §A, §B)
// ----------------------------------------------------------------
describe("setGoalDoneCore", () => {
  it("throws on unknown id (tenancy — wrong user looks like not-found)", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(
      setGoalDoneCore(asGoal(m.entities), { userId: "user-1", id: "g1", isDone: true }),
    ).rejects.toThrow(/Goal not found/);
  });

  it("throws when the goal belongs to a different user", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      isDone: false,
      userId: "other-user",
      lensId: "lens-1",
    });
    await expect(
      setGoalDoneCore(asGoal(m.entities), { userId: "user-1", id: "g1", isDone: true }),
    ).rejects.toThrow(/Goal not found/);
    expect(m.entities.Goal.update).not.toHaveBeenCalled();
  });

  it("stamps isDone + completedAt when marking done", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      isDone: false,
      userId: "user-1",
      lensId: "lens-1",
    });
    m.entities.Goal.update.mockResolvedValue({ id: "g1" });

    const result = await setGoalDoneCore(asGoal(m.entities), {
      userId: "user-1",
      id: "g1",
      isDone: true,
    });

    expect(result).toEqual({ id: "g1" });
    expect(m.entities.Goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isDone: true, completedAt: expect.any(Date) },
      select: { id: true },
    });
  });

  it("clears isDone + completedAt when reopening", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      isDone: true,
      userId: "user-1",
      lensId: "lens-1",
    });
    m.entities.Goal.update.mockResolvedValue({ id: "g1" });

    await setGoalDoneCore(asGoal(m.entities), { userId: "user-1", id: "g1", isDone: false });

    expect(m.entities.Goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { isDone: false, completedAt: null },
      select: { id: true },
    });
  });

  it("is idempotent — no update when already in the requested state", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({
      id: "g1",
      isDone: true,
      userId: "user-1",
      lensId: "lens-1",
    });

    const result = await setGoalDoneCore(asGoal(m.entities), {
      userId: "user-1",
      id: "g1",
      isDone: true,
    });
    expect(result).toEqual({ id: "g1" });
    expect(m.entities.Goal.update).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// updateGoalCore — edit name + description (goal-planning spec §C)
// ----------------------------------------------------------------
describe("updateGoalCore", () => {
  it("throws 404 when the goal doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(
      updateGoalCore(asGoal(m.entities), { userId: "user-1", id: "g1", name: "X" }),
    ).rejects.toMatchObject({ statusCode: 404, message: "Goal not found." });
  });

  it("throws on empty name", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1", name: "Old" });
    await expect(
      updateGoalCore(asGoal(m.entities), { userId: "user-1", id: "g1", name: "   " }),
    ).rejects.toThrow(/cannot be empty/);
  });

  it("renames with a trimmed name", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1", name: "Old" });
    m.entities.Goal.update.mockResolvedValue({ id: "g1", name: "New", description: null });

    const result = await updateGoalCore(asGoal(m.entities), {
      userId: "user-1",
      id: "g1",
      name: "  New  ",
    });

    expect(result).toEqual({ id: "g1", name: "New", description: null });
    expect(m.entities.Goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { name: "New" },
      select: { id: true, name: true, description: true },
    });
  });

  it("sets description (trimmed, empty → null)", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1", name: "X" });
    m.entities.Goal.update.mockResolvedValue({ id: "g1", name: "X", description: null });

    await updateGoalCore(asGoal(m.entities), {
      userId: "user-1",
      id: "g1",
      description: "   ",
    });

    expect(m.entities.Goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { description: null },
      select: { id: true, name: true, description: true },
    });
  });

  it("rewrites a Prisma P2002 (name duplicate) into a 409", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1", name: "Old" });
    const prismaError = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    m.entities.Goal.update.mockRejectedValue(prismaError);

    await expect(
      updateGoalCore(asGoal(m.entities), { userId: "user-1", id: "g1", name: "Duplicate" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/Duplicate/),
    });
  });
});

// ----------------------------------------------------------------
// deleteGoalCore — lossless re-parenting (spec §C), CORRECTED port
// ----------------------------------------------------------------
describe("deleteGoalCore", () => {
  it("throws 404 when the goal doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(
      deleteGoalCore(asGoal(m.entities), { userId: "user-1", id: "g1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("re-parents child projects + tasks to goalId=null, then deletes the goal", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    m.entities.Project.count.mockResolvedValue(2);
    m.entities.Task.count.mockResolvedValue(3);

    const result = await deleteGoalCore(asGoal(m.entities), { userId: "user-1", id: "g1" });

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
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);

    await deleteGoalCore(asGoal(m.entities), { userId: "user-1", id: "g1" });

    expect(m.entities.Task.deleteMany).not.toHaveBeenCalled();
    expect(m.entities.Project.deleteMany).not.toHaveBeenCalled();
  });

  it("CORRECTED PORT: does NOT touch Resource (webapp's Resource.updateMany on the dropped goalId column was a latent bug)", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    m.entities.Project.count.mockResolvedValue(1);
    m.entities.Task.count.mockResolvedValue(0);

    await deleteGoalCore(asGoal(m.entities), { userId: "user-1", id: "g1" });

    // Resources are project-owned since 2026-07-29 — they follow their
    // project; no goalId column exists to re-point.
    expect(m.entities.Resource.updateMany).not.toHaveBeenCalled();
    expect(m.entities.Resource.deleteMany).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// reorderGoalProjectsCore — explicit project sequence (goal-planning spec §E)
// ----------------------------------------------------------------
describe("reorderGoalProjectsCore", () => {
  it("throws 404 when the goal doesn't exist or isn't the user's", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue(null);
    await expect(
      reorderGoalProjectsCore(asGoal(m.entities), {
        userId: "user-1",
        goalId: "g1",
        orderedIds: ["p1"],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects ids that do not belong to this goal (foreign ids)", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    // Only 1 of the 2 passed ids belongs to this goal.
    m.entities.Project.count.mockResolvedValue(1);

    await expect(
      reorderGoalProjectsCore(asGoal(m.entities), {
        userId: "user-1",
        goalId: "g1",
        orderedIds: ["p1", "p2"],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/must belong/),
    });
    expect(m.entities.Project.update).not.toHaveBeenCalled();
  });

  it("writes order = index for each id, tenancy-checked", async () => {
    const m = guarded();
    m.entities.Goal.findUnique.mockResolvedValue({ id: "g1" });
    m.entities.Project.count.mockResolvedValue(3);
    m.entities.Project.update.mockResolvedValue({ id: "p" });

    await reorderGoalProjectsCore(asGoal(m.entities), {
      userId: "user-1",
      goalId: "g1",
      orderedIds: ["p3", "p1", "p2"],
    });

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
