import { describe, it, expect } from "vitest";
import { getGoals, createGoal } from "./operations";
import { mockContext } from "../test/mockContext";

/**
 * Goals operations — getGoals (aggregation with progress calc) + createGoal.
 *
 * getGoals is interesting because it computes an aggregate progress percentage
 * across projects + tasks. We test the math: 1 done project + 1 done task out
 * of 3 total items → 67%.
 */

const GOAL_ROW = {
  id: "goal-1",
  name: "Grow audience",
  description: "Reach 10k followers" as string | null,
  projects: [
    { id: "p1", name: "Newsletter", isDone: true },
    { id: "p2", name: "Twitter", isDone: false },
  ],
  tasks: [
    { id: "t1", isDone: true },
    { id: "t2", isDone: false },
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
  it("scopes by lens, computes aggregate progress across projects + tasks", async () => {
    const m = mockContext();
    m.entities.Goal.findMany.mockResolvedValue([GOAL_ROW]);

    const result = await getGoals({ lensId: "lens-1" }, m.context);

    expect(m.entities.Goal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lensId: "lens-1", userId: "user-1", isDone: false }),
        orderBy: [{ name: "asc" }],
      }),
    );

    // 1 done project + 1 done task = 2 done; 2 projects + 2 tasks = 4 total → 50%
    expect(result).toEqual([
      {
        id: "goal-1",
        name: "Grow audience",
        description: "Reach 10k followers",
        projectCount: 2,
        taskCount: 2,
        progress: 50,
      },
    ]);
  });

  it("returns progress 0 for a goal with no projects or tasks", async () => {
    const m = mockContext();
    m.entities.Goal.findMany.mockResolvedValue([
      { ...GOAL_ROW, projects: [], tasks: [] },
    ]);

    const result = await getGoals({ lensId: "lens-1" }, m.context);
    expect(result[0].progress).toBe(0);
    expect(result[0].projectCount).toBe(0);
    expect(result[0].taskCount).toBe(0);
  });

  it("rounds progress to nearest integer", async () => {
    const m = mockContext();
    // 1 done out of 3 total → 33.33% → rounds to 33
    m.entities.Goal.findMany.mockResolvedValue([
      {
        ...GOAL_ROW,
        projects: [
          { id: "p1", name: "A", isDone: true },
          { id: "p2", name: "B", isDone: false },
          { id: "p3", name: "C", isDone: false },
        ],
        tasks: [],
      },
    ]);

    const result = await getGoals({ lensId: "lens-1" }, m.context);
    expect(result[0].progress).toBe(33);
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
    m.entities.Goal.create.mockResolvedValue({ id: "goal-9", name: "New goal" });

    const result = await createGoal(
      { name: "  New goal  ", lensId: "lens-1", description: "some desc" },
      m.context,
    );

    expect(result).toEqual({ id: "goal-9", name: "New goal" });
    expect(m.entities.Goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "New goal",
        userId: "user-1",
        lensId: "lens-1",
        description: "some desc",
      }),
      select: { id: true, name: true },
    });
  });

  it("works without optional description", async () => {
    const m = mockContext();
    m.entities.Goal.create.mockResolvedValue({ id: "g", name: "Bare" });

    await createGoal({ name: "Bare", lensId: "l" }, m.context);

    expect(m.entities.Goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ description: undefined }),
      select: { id: true, name: true },
    });
  });
});
