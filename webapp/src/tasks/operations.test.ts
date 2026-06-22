import { describe, it, expect } from "vitest";
import {
  getTask,
  getTasks,
  toggleTaskDone,
  updateTaskStatus,
  getTopTask,
  snoozeTask,
} from "./operations";
import { mockContext } from "../test/mockContext";

/**
 * Task operations — the Phase 4 list views + focus engine.
 *
 * Covers all 6 ops: getTask, getTasks, toggleTaskDone, updateTaskStatus,
 * getTopTask, snoozeTask. Every query/action is scoped by userId AND lensId.
 * Mutations verify tenancy via a compound where-clause check.
 */

// ----------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------

const BASE_TASK = {
  id: "task-1",
  userId: "user-1",
  lensId: "lens-1",
  description: "Email Sarah",
  status: "TODAY" as string,
  priority: "NORMAL" as string,
  size: "M" as string,
  isDone: false,
  completedAt: null as Date | null,
  createdAt: new Date("2026-06-20T10:00:00Z"),
};

// ----------------------------------------------------------------
// getTask
// ----------------------------------------------------------------

describe("getTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getTask({ id: "task-1" }, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it("returns the task with tags and updates included", async () => {
    const m = mockContext();
    const found = { ...BASE_TASK, tags: [], updates: [] };
    m.entities.Task.findUnique.mockResolvedValue(found);

    const result = await getTask({ id: "task-1" }, m.context);

    expect(result).toEqual(found);
    expect(m.entities.Task.findUnique).toHaveBeenCalledWith({
      where: { id: "task-1", userId: "user-1" },
      include: { tags: true, updates: { orderBy: { createdAt: "desc" } } },
    });
  });
});

// ----------------------------------------------------------------
// getTasks
// ----------------------------------------------------------------

describe("getTasks", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getTasks({ lensId: "lens-1" }, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it.each([
    ["lens only", { lensId: "lens-1" }, { userId: "user-1", lensId: "lens-1" }],
    ["lens + status", { lensId: "lens-1", status: "TODAY" }, { userId: "user-1", lensId: "lens-1", status: "TODAY" }],
    ["lens + isDone", { lensId: "lens-1", isDone: false }, { userId: "user-1", lensId: "lens-1", isDone: false }],
    ["lens + status + isDone", { lensId: "lens-1", status: "SOMEDAY", isDone: false }, { userId: "user-1", lensId: "lens-1", status: "SOMEDAY", isDone: false }],
  ])("builds correct where clause: %s", async (_label, args, expectedWhere) => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTasks(args as Parameters<typeof getTasks>[0], m.context);

    expect(m.entities.Task.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: [{ order: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
      include: {
        tags: true,
        project: { select: { id: true, name: true } },
        goal: { select: { id: true, name: true } },
      },
    });
  });
});

// ----------------------------------------------------------------
// toggleTaskDone
// ----------------------------------------------------------------

describe("toggleTaskDone", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(toggleTaskDone({ id: "task-1" }, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it("throws if the task belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ isDone: false, userId: "someone-else" });
    await expect(toggleTaskDone({ id: "task-1" }, m.context)).rejects.toThrow(/not found/i);
  });

  it("throws if the task doesn't exist", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue(null);
    await expect(toggleTaskDone({ id: "task-1" }, m.context)).rejects.toThrow(/not found/i);
  });

  it("marks an open task done and sets completedAt", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ isDone: false, userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: true });

    await toggleTaskDone({ id: "task-1" }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { isDone: true, completedAt: expect.any(Date) },
    });
  });

  it("marks a done task open and clears completedAt", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ isDone: true, userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: false });

    await toggleTaskDone({ id: "task-1" }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { isDone: false, completedAt: null },
    });
  });
});

// ----------------------------------------------------------------
// updateTaskStatus
// ----------------------------------------------------------------

describe("updateTaskStatus", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      updateTaskStatus({ id: "task-1", status: "SOMEDAY" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws if the task belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(
      updateTaskStatus({ id: "task-1", status: "SOMEDAY" }, m.context),
    ).rejects.toThrow(/not found/i);
  });

  it.each([
    ["TODAY", "TODAY"],
    ["UPCOMING", "UPCOMING"],
    ["SOMEDAY", "SOMEDAY"],
  ] as const)("sets status to %s without a dueDate", async (_label, status) => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, status });

    await updateTaskStatus({ id: "task-1", status }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status, dueDate: undefined },
    });
  });

  it("passes through a provided dueDate", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    const due = new Date("2026-06-25T09:00:00Z");
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, dueDate: due });

    await updateTaskStatus({ id: "task-1", status: "UPCOMING", dueDate: due }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "UPCOMING", dueDate: due },
    });
  });
});

// ----------------------------------------------------------------
// getTopTask
// ----------------------------------------------------------------

function candidate(overrides: Partial<typeof BASE_TASK> = {}) {
  return { ...BASE_TASK, project: null, goal: null, ...overrides };
}

describe("getTopTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getTopTask({ lensId: "lens-1" }, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it("returns null when there are no candidates", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toBeNull();
    expect(m.entities.Task.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "lens-1", status: "TODAY", isDone: false },
      include: {
        project: { select: { id: true, name: true } },
        goal: { select: { id: true, name: true } },
      },
    });
  });

  it("ranks by priority first (IMPORTANT beats NORMAL)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "low", priority: "NORMAL" }),
      candidate({ id: "top", priority: "IMPORTANT" }),
    ]);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toMatchObject({ id: "top" });
  });

  it("breaks priority ties by size (S beats M)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "big", priority: "NORMAL", size: "M" }),
      candidate({ id: "quick", priority: "NORMAL", size: "S" }),
    ]);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toMatchObject({ id: "quick" });
  });

  it("breaks size ties by createdAt (oldest first)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "newer", createdAt: new Date("2026-06-21T10:00:00Z") }),
      candidate({ id: "older", createdAt: new Date("2026-06-19T10:00:00Z") }),
    ]);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toMatchObject({ id: "older" });
  });
});

// ----------------------------------------------------------------
// snoozeTask
// ----------------------------------------------------------------

describe("snoozeTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(snoozeTask({ id: "task-1", preset: "1h" }, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it("throws if the task belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(snoozeTask({ id: "task-1", preset: "1h" }, m.context)).rejects.toThrow(/not found/i);
  });

  it.each([
    ["1h", "UPCOMING"],
    ["3h", "UPCOMING"],
    ["tomorrow", "UPCOMING"],
    ["weekend", "UPCOMING"],
  ] as const)("preset %s sets status %s with a future dueDate", async (preset, status) => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", status, dueDate: new Date() });

    await snoozeTask({ id: "task-1", preset }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status, dueDate: expect.any(Date) },
      select: { id: true, status: true, dueDate: true },
    });
  });

  it("preset someday sets status SOMEDAY and clears dueDate", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", status: "SOMEDAY", dueDate: null });

    await snoozeTask({ id: "task-1", preset: "someday" }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "SOMEDAY", dueDate: null },
      select: { id: true, status: true, dueDate: true },
    });
  });
});
