// @vitest-environment node
// Server-op tests run in node: ops import entitlement guards that pull
// `wasp/server` (HttpError), blocked by detectServerImports in jsdom. No DOM
// APIs here — node is correct.
import { describe, it, expect, vi } from "vitest";

// Stub the server-only HttpError layer so this test never loads `wasp/server`.
vi.mock("../billing/entitlementHttp", () => ({
  assertLensAllowed: vi.fn().mockResolvedValue(undefined),
  assertUnderCap: vi.fn().mockResolvedValue(undefined),
}));
import {
  getTask,
  getTasks,
  toggleTaskDone,
  updateTaskStatus,
  getTopTask,
  snoozeTask,
  startTask,
  pauseTask,
  addTaskUpdate,
  completeTaskFromFocus,
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
  startedAt: null as Date | null,
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
      include: { tags: true, updates: { orderBy: { createdAt: "asc" } } },
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
      data: { isDone: true, completedAt: expect.any(Date), startedAt: null },
    });
  });

  it("marks a done task open and clears completedAt", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ isDone: true, userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: false });

    await toggleTaskDone({ id: "task-1" }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { isDone: false, completedAt: null, startedAt: null },
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
      where: {
        userId: "user-1",
        lensId: "lens-1",
        status: { in: ["TODAY", "UPCOMING"] },
        isDone: false,
        OR: [{ dueDate: null }, { dueDate: { lte: expect.any(Date) } }],
      },
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

  it("ranks a TODAY task above an equal UPCOMING task (court beats bench)", async () => {
    const m = mockContext();
    // Two NORMAL/M tasks; only the status differs. The committed-Today one
    // wins — a bench task mustn't steal the slot of something on the court.
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "bench", status: "UPCOMING" }),
      candidate({ id: "court", status: "TODAY" }),
    ]);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toMatchObject({ id: "court" });
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
      data: { status, dueDate: expect.any(Date), startedAt: null },
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
      data: { status: "SOMEDAY", dueDate: null, startedAt: null },
      select: { id: true, status: true, dueDate: true },
    });
  });
});

// ----------------------------------------------------------------
// startTask / pauseTask — the "Now" state pointer
// ----------------------------------------------------------------
describe("startTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(startTask({ id: "task-1" }, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it("rejects a task that belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(startTask({ id: "task-1" }, m.context)).rejects.toThrow(/not found/i);
  });

  it("sets startedAt to now", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", startedAt: new Date() });

    const result = await startTask({ id: "task-1" }, m.context);

    expect(result).toEqual({ id: "task-1", startedAt: expect.any(Date) });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { startedAt: expect.any(Date) },
      select: { id: true, startedAt: true },
    });
  });
});

describe("pauseTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(pauseTask({ id: "task-1" }, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it("clears startedAt (back to Next)", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", startedAt: null });

    const result = await pauseTask({ id: "task-1" }, m.context);

    expect(result).toEqual({ id: "task-1", startedAt: null });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { startedAt: null },
      select: { id: true, startedAt: true },
    });
  });
});

// ----------------------------------------------------------------
// getTopTask — an in-progress task (startedAt != null) is always #1
// ----------------------------------------------------------------
describe("getTopTask — Now state ordering", () => {
  it("surfaces an in-progress task above higher-priority candidates", async () => {
    const m = mockContext();
    // A LOW-priority in-progress task + an IMPORTANT not-started one.
    // Normal priority ranking would put IMPORTANT first; the in-progress
    // override must win.
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "started", priority: "LOW", startedAt: new Date() }),
      candidate({ id: "important", priority: "IMPORTANT", startedAt: null }),
    ]);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result?.id).toBe("started");
  });

  it("falls back to priority ranking when nothing is in progress", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "normal", priority: "NORMAL", startedAt: null }),
      candidate({ id: "important", priority: "IMPORTANT", startedAt: null }),
    ]);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result?.id).toBe("important");
  });
});

/** Helper dropped — the existing `candidate()` above covers this. */

// ----------------------------------------------------------------
// addTaskUpdate — append a user-authored NOTE to the thread
// (task-notes-completion-log.md)
// ----------------------------------------------------------------
describe("addTaskUpdate", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      addTaskUpdate({ taskId: "task-1", body: "hello" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects a task that belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(
      addTaskUpdate({ taskId: "task-1", body: "hello" }, m.context),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects a whitespace-only body", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    await expect(
      addTaskUpdate({ taskId: "task-1", body: "   \n  " }, m.context),
    ).rejects.toThrow(/empty/i);
    expect(m.entities.TaskUpdate.create).not.toHaveBeenCalled();
  });

  it("creates a NOTE row, trimming the body, without mutating task fields", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.TaskUpdate.create.mockResolvedValue({ id: "tu-1" });

    const result = await addTaskUpdate({ taskId: "task-1", body: "  Ship it  " }, m.context);

    expect(result).toEqual({ id: "tu-1" });
    expect(m.entities.TaskUpdate.create).toHaveBeenCalledWith({
      data: {
        body: "Ship it",
        kind: "NOTE",
        taskId: "task-1",
        userId: "user-1",
      },
    });
    // Never touches task status, startedAt, completedAt, or filing fields.
    expect(m.entities.Task.update).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// completeTaskFromFocus — complete from focus + COMPLETED log event
// (task-notes-completion-log.md)
// ----------------------------------------------------------------
describe("completeTaskFromFocus", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      completeTaskFromFocus({ taskId: "task-1" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects a task that belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(
      completeTaskFromFocus({ taskId: "task-1" }, m.context),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects an unstarted task (must Start before Complete)", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      completedAt: null,
      startedAt: null,
      userId: "user-1",
    });
    await expect(
      completeTaskFromFocus({ taskId: "task-1" }, m.context),
    ).rejects.toThrow(/start the task/i);
    expect(m.entities.Task.update).not.toHaveBeenCalled();
    expect(m.entities.TaskUpdate.create).not.toHaveBeenCalled();
  });

  it("writes completion fields + exactly one COMPLETED row", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      completedAt: null,
      startedAt: new Date("2026-07-04T09:00:00Z"),
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({
      id: "task-1",
      completedAt: new Date("2026-07-04T09:41:00Z"),
    });

    const result = await completeTaskFromFocus({ taskId: "task-1" }, m.context);

    expect(result).toEqual({
      id: "task-1",
      completedAt: expect.any(Date),
    });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { isDone: true, completedAt: expect.any(Date), startedAt: null },
      select: { id: true, completedAt: true },
    });
    expect(m.entities.TaskUpdate.create).toHaveBeenCalledTimes(1);
    expect(m.entities.TaskUpdate.create).toHaveBeenCalledWith({
      data: {
        body: "Completed",
        kind: "COMPLETED",
        taskId: "task-1",
        userId: "user-1",
      },
    });
  });

  it("is idempotent: an already-done task returns its completion without a second event", async () => {
    const m = mockContext();
    const doneAt = new Date("2026-07-04T09:41:00Z");
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: true,
      completedAt: doneAt,
      startedAt: null,
      userId: "user-1",
    });

    const result = await completeTaskFromFocus({ taskId: "task-1" }, m.context);

    expect(result).toEqual({ id: "task-1", completedAt: doneAt });
    expect(m.entities.Task.update).not.toHaveBeenCalled();
    expect(m.entities.TaskUpdate.create).not.toHaveBeenCalled();
  });
});
