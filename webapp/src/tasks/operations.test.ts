// @vitest-environment node
// Server-op tests run in node: ops import entitlement guards that pull
// `wasp/server` (HttpError), blocked by detectServerImports in jsdom. No DOM
// APIs here — node is correct.
import { describe, it, expect, vi } from "vitest";

// Stub the server-only HttpError layer so this test never loads `wasp/server`.
vi.mock("../billing/entitlementHttp", () => ({
  assertLensAllowed: vi.fn().mockResolvedValue(undefined),
  assertLifeAreaLens: vi.fn().mockResolvedValue(undefined),
  assertUnderCap: vi.fn().mockResolvedValue(undefined),
}));
import { assertLifeAreaLens } from "../billing/entitlementHttp";
import {
  getTask,
  getTasks,
  getTodayTasks,
  getDoneToday,
  toggleTaskDone,
  updateTaskStatus,
  unscheduleOverdueTasks,
  getTopTask,
  getFocusedTask,
  snoozeTask,
  startTask,
  pauseTask,
  completeFocusSession,
  addTaskUpdate,
  updateTaskContent,
  updateTaskDetails,
  setTaskOutcome,
  completeTaskFromFocus,
} from "./operations";
import { activePoolWhere } from "./activePool";
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
  permalink: "email-sarah",
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
    await expect(getTask({ id: "task-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("returns the task with tags and updates included", async () => {
    const m = mockContext();
    const found = {
      ...BASE_TASK,
      tags: [],
      updates: [],
      project: null,
      goal: null,
    };
    m.entities.Task.findFirst.mockResolvedValue(found);

    const result = await getTask({ id: "task-1" }, m.context);

    expect(result).toEqual(found);
    expect(m.entities.Task.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        OR: [{ id: "task-1" }, { permalink: "task-1" }],
      },
      include: {
        tags: true,
        updates: { orderBy: { createdAt: "asc" } },
        project: { select: { id: true, permalink: true, name: true } },
        goal: { select: { id: true, permalink: true, name: true } },
      },
    });
  });
});

// ----------------------------------------------------------------
// getFocusedTask
// ----------------------------------------------------------------

describe("getFocusedTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getFocusedTask(undefined, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("returns the user's one started task with its thread", async () => {
    const m = mockContext();
    const found = {
      ...BASE_TASK,
      startedAt: new Date("2026-07-04T10:00:00Z"),
      tags: [],
      updates: [],
      sessions: [],
      user: { focusSessionMinutes: 25 },
      project: null,
      goal: null,
    };
    m.entities.Task.findFirst.mockResolvedValue(found);

    const result = await getFocusedTask(undefined, m.context);

    expect(result).toEqual(found);
    expect(m.entities.Task.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        isDone: false,
        startedAt: { not: null },
      },
      orderBy: { startedAt: "desc" },
      include: {
        tags: true,
        updates: { orderBy: { createdAt: "asc" } },
        sessions: { orderBy: { startedAt: "asc" } },
        user: { select: { focusSessionMinutes: true } },
        // focus-goal-context: Project carries nested Goal (id/name/description)
        // and direct Goal gains description, so the pure resolver can apply
        // Project-Goal precedence and render Goal rationale on Focus.
        project: {
          select: {
            id: true,
            permalink: true,
            name: true,
            goal: { select: { id: true, name: true, description: true } },
          },
        },
        goal: {
          select: { id: true, permalink: true, name: true, description: true },
        },
      },
    });
  });
});

// ----------------------------------------------------------------
// getTasks
// ----------------------------------------------------------------

describe("getTasks", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getTasks({ lensId: "lens-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it.each([
    ["lens only", { lensId: "lens-1" }, { userId: "user-1", lensId: "lens-1" }],
    [
      "lens + status",
      { lensId: "lens-1", status: "TODAY" },
      { userId: "user-1", lensId: "lens-1", status: "TODAY" },
    ],
    [
      "lens + isDone",
      { lensId: "lens-1", isDone: false },
      { userId: "user-1", lensId: "lens-1", isDone: false },
    ],
    [
      "lens + status + isDone",
      { lensId: "lens-1", status: "SOMEDAY", isDone: false },
      { userId: "user-1", lensId: "lens-1", status: "SOMEDAY", isDone: false },
    ],
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
// getDoneToday
// ----------------------------------------------------------------

describe("getDoneToday", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getDoneToday({ lensId: "lens-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("scopes to TODAY status — excludes Upcoming tasks completed via focus", async () => {
    // Completion (completeTaskFromFocus) leaves status untouched, so an
    // Upcoming task finished from focus stays status=UPCOMING. The Done-today
    // section is "what I finished from today's committed list" — Upcoming
    // completions don't belong here.
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    await getDoneToday({ lensId: "lens-1" }, m.context);

    expect(assertLifeAreaLens).toHaveBeenCalledWith(m.context, "lens-1");

    const call = m.entities.Task.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      userId: "user-1",
      lensId: { in: ["lens-1"] },
      status: "TODAY",
      isDone: true,
    });
    expect(call.where.completedAt).toHaveProperty("gte");
    expect(call.where.completedAt.gte).toBeInstanceOf(Date);
    expect(call.orderBy).toEqual({ completedAt: "desc" });
    // Done-today now also carries the lens relation for the global pill.
    expect(call.include).toMatchObject({
      lens: { select: { id: true, name: true, color: true } },
    });
  });
});

// ----------------------------------------------------------------
// getTodayTasks — the global Today list (across all accessible lenses)
// WORKFLOW.md §5.11: Today is universal, not lens-scoped.
// ----------------------------------------------------------------
describe("getTodayTasks", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getTodayTasks({} as never, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("returns tasks across accessible lenses, including the lens relation for the pill", async () => {
    const m = mockContext();
    // resolveAccessibleLenses reads Lens.findMany. A FREE user (no plan on
    // the default mockContext) → only PERSONAL lenses; one is enough here.
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-personal", name: "Me", color: "emerald", kind: "PERSONAL" },
    ]);
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTodayTasks({} as never, m.context);

    const call = m.entities.Task.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      userId: "user-1",
      lensId: { in: ["lens-personal"] },
      status: "TODAY",
      isDone: false,
    });
    expect(call.include).toMatchObject({
      lens: { select: { id: true, name: true, color: true } },
    });
  });

  it("a FREE user only sees PERSONAL lenses (entitlement filter)", async () => {
    const m = mockContext();
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-personal", name: "Me", color: "emerald", kind: "PERSONAL" },
    ]);
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTodayTasks({} as never, m.context);

    // resolveAccessibleLenses branches on isEntitled; FREE → PERSONAL only.
    const lensCall = m.entities.Lens.findMany.mock.calls[0][0];
    expect(lensCall.where).toMatchObject({
      userId: "user-1",
      kind: "PERSONAL",
    });
  });

  it("an entitled user sees all their lenses", async () => {
    const m = mockContext({ id: "user-1", plan: "PRO", planRenewsAt: new Date(Date.now() + 86_400_000) });
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-work", name: "Work", color: "indigo", kind: "WORK" },
      { id: "lens-me", name: "Me", color: "emerald", kind: "PERSONAL" },
    ]);
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTodayTasks({} as never, m.context);

    const lensCall = m.entities.Lens.findMany.mock.calls[0][0];
    expect(lensCall.where).toEqual({ userId: "user-1" }); // no kind filter
    const taskCall = m.entities.Task.findMany.mock.calls[0][0];
    expect(taskCall.where.lensId).toEqual({ in: ["lens-work", "lens-me"] });
  });

  it("returns [] when the user has no accessible lenses yet", async () => {
    const m = mockContext();
    m.entities.Lens.findMany.mockResolvedValue([]);

    const result = await getTodayTasks({} as never, m.context);

    expect(result).toEqual([]);
    expect(m.entities.Task.findMany).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// toggleTaskDone
// ----------------------------------------------------------------

describe("toggleTaskDone", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(toggleTaskDone({ id: "task-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("throws if the task belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      userId: "someone-else",
    });
    await expect(toggleTaskDone({ id: "task-1" }, m.context)).rejects.toThrow(
      /not found/i,
    );
  });

  it("throws if the task doesn't exist", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue(null);
    await expect(toggleTaskDone({ id: "task-1" }, m.context)).rejects.toThrow(
      /not found/i,
    );
  });

  it("marks an open task done and sets completedAt", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: true });

    await toggleTaskDone({ id: "task-1" }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { isDone: true, completedAt: expect.any(Date), startedAt: null },
    });
  });

  it("marks a done task open and clears completedAt", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: true,
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: false });

    await toggleTaskDone({ id: "task-1" }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { isDone: false, completedAt: null, startedAt: null },
    });
  });

  // Outcome (task-fields §C): written only when marking done, normalised to
  // null when empty, and never touched on un-completion.
  it("writes the outcome when marking done", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: true });

    await toggleTaskDone({ id: "task-1", outcome: "Done — shipped." }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        isDone: true,
        completedAt: expect.any(Date),
        startedAt: null,
        outcome: "Done — shipped.",
      },
    });
  });

  it("normalises a whitespace outcome to null when marking done", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: true });

    await toggleTaskDone({ id: "task-1", outcome: "   " }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        isDone: true,
        completedAt: expect.any(Date),
        startedAt: null,
        outcome: null,
      },
    });
  });

  it("does not touch outcome when un-completing a task", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: true,
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: false });

    await toggleTaskDone(
      { id: "task-1", outcome: "should be ignored" },
      m.context,
    );

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

    await updateTaskStatus(
      { id: "task-1", status: "UPCOMING", dueDate: due },
      m.context,
    );

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

// getTopTask now ranks via getTopTaskData (Task.findMany) THEN hydrates the
// winner via hydrateTopTaskData (Task.findFirst). This helper stubs the
// hydration lookup to echo back the ranked id, so ranking tests can still
// assert on the winner's id through the full rank → hydrate → return chain.
function mockHydrationEcho(m: ReturnType<typeof mockContext>) {
  m.entities.Task.findFirst.mockImplementation(async (args: { where: { id: string } }) => ({
    ...BASE_TASK,
    id: args.where.id,
    project: null,
    goal: null,
    sessions: [],
    updates: [],
  }));
}

describe("getTopTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getTopTask({ lensId: "lens-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("returns null when there are no candidates", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toBeNull();
    expect(assertLifeAreaLens).toHaveBeenCalledWith(m.context, "lens-1");
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

  it("draws its candidate pool from the shared activePoolWhere predicate", async () => {
    // Single-source lock: getTopTask's where-clause must equal activePoolWhere
    // (the same predicate getAppData's Today badge + lens pills count). If this
    // drifts, Next and the counts disagree — the exact bug this change fixed.
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTopTask({ lensId: "lens-1" }, m.context);

    const expected = activePoolWhere({ userId: "user-1", lensId: "lens-1" });
    const call = m.entities.Task.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject(expected);
  });

  it("hydrates the ranked winner through the owned hydration core", async () => {
    // After ranking, getTopTask calls hydrateTopTaskData with the winner id +
    // authenticated userId. The hydration query must scope by BOTH so no caller
    // can hydrate another user's task. History relations attach only here, not
    // to every candidate.
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([candidate({ id: "top" })]);
    mockHydrationEcho(m);

    await getTopTask({ lensId: "lens-1" }, m.context);

    expect(m.entities.Task.findFirst).toHaveBeenCalledWith({
      where: { id: "top", userId: "user-1" },
      include: {
        project: {
          select: {
            id: true,
            permalink: true,
            name: true,
            goal: { select: { id: true, name: true, description: true } },
          },
        },
        goal: {
          select: { id: true, permalink: true, name: true, description: true },
        },
        sessions: {
          orderBy: { startedAt: "asc" },
          select: { startedAt: true, endedAt: true },
        },
        updates: {
          where: { kind: "NOTE" },
          orderBy: { createdAt: "desc" },
          select: { body: true, createdAt: true },
        },
      },
    });
  });

  it("returns null when the ranked winner vanishes before hydration", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([candidate({ id: "top" })]);
    // Hydration finds nothing — the row was deleted/done between ranking and
    // hydration. The op must return null, not stale ranked data.
    m.entities.Task.findFirst.mockResolvedValue(null);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toBeNull();
  });

  it("ranks by priority first (IMPORTANT beats NORMAL)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "low", priority: "NORMAL" }),
      candidate({ id: "top", priority: "IMPORTANT" }),
    ]);
    mockHydrationEcho(m);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toMatchObject({ id: "top" });
  });

  it("breaks priority ties by size (S beats M)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "big", priority: "NORMAL", size: "M" }),
      candidate({ id: "quick", priority: "NORMAL", size: "S" }),
    ]);
    mockHydrationEcho(m);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toMatchObject({ id: "quick" });
  });

  it("breaks size ties by createdAt (oldest first)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "newer", createdAt: new Date("2026-06-21T10:00:00Z") }),
      candidate({ id: "older", createdAt: new Date("2026-06-19T10:00:00Z") }),
    ]);
    mockHydrationEcho(m);

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
    mockHydrationEcho(m);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result).toMatchObject({ id: "court" });
  });
});

// ----------------------------------------------------------------
// unscheduleOverdueTasks
// ----------------------------------------------------------------

describe("unscheduleOverdueTasks", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      unscheduleOverdueTasks({ lensId: "lens-1" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("clears only past dates from incomplete Upcoming tasks in this lens", async () => {
    const m = mockContext();
    m.entities.Task.updateMany.mockResolvedValue({ count: 3 });

    const result = await unscheduleOverdueTasks({ lensId: "lens-1" }, m.context);

    expect(result).toEqual({ count: 3 });
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        lensId: "lens-1",
        status: "UPCOMING",
        isDone: false,
        dueDate: { lt: expect.any(Date) },
      },
      data: { dueDate: null },
    });
    const call = m.entities.Task.updateMany.mock.calls[0][0];
    expect(call.where.dueDate.lt).toEqual(
      new Date(new Date().setHours(0, 0, 0, 0)),
    );
  });
});

// ----------------------------------------------------------------
// snoozeTask
// ----------------------------------------------------------------

describe("snoozeTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      snoozeTask({ id: "task-1", preset: "1h" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws if the task belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(
      snoozeTask({ id: "task-1", preset: "1h" }, m.context),
    ).rejects.toThrow(/not found/i);
  });

  it.each([
    ["1h", "UPCOMING"],
    ["3h", "UPCOMING"],
    ["tomorrow", "UPCOMING"],
    ["weekend", "UPCOMING"],
  ] as const)(
    "preset %s sets status %s with a future dueDate",
    async (preset, status) => {
      const m = mockContext();
      m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
      m.entities.Task.update.mockResolvedValue({
        id: "task-1",
        status,
        dueDate: new Date(),
      });

      await snoozeTask({ id: "task-1", preset }, m.context);

      expect(m.entities.Task.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { status, dueDate: expect.any(Date), startedAt: null },
        select: { id: true, status: true, dueDate: true },
      });
    },
  );

  it("preset someday sets status SOMEDAY and clears dueDate", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({
      id: "task-1",
      status: "SOMEDAY",
      dueDate: null,
    });

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
    await expect(startTask({ id: "task-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it("rejects a task that belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(startTask({ id: "task-1" }, m.context)).rejects.toThrow(
      /not found/i,
    );
  });

  it("clears any prior focus and sets startedAt to now", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.updateMany.mockResolvedValue({ count: 1 });
    m.entities.Task.update.mockResolvedValue({
      id: "task-1",
      startedAt: new Date(),
    });

    const result = await startTask({ id: "task-1" }, m.context);

    expect(result).toEqual({ id: "task-1", startedAt: expect.any(Date) });
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", startedAt: { not: null } },
      data: { startedAt: null },
    });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { startedAt: expect.any(Date) },
      select: { id: true, startedAt: true },
    });
  });

  it("opens a TaskSession for the task and closes any prior open sessions", async () => {
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({ focusSessionMinutes: 45 });
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.updateMany.mockResolvedValue({ count: 0 });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", startedAt: new Date() });

    await startTask({ id: "task-1" }, m.context);

    // Defensive close on whatever session was open for this user before
    // switching focus — keeps totals honest across task switches.
    expect(m.entities.TaskSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
    // New open session on the started task.
    expect(m.entities.TaskSession.create).toHaveBeenCalledWith({
      data: {
        taskId: "task-1",
        userId: "user-1",
        startedAt: expect.any(Date),
        plannedMinutes: 45,
        completed: false,
      },
    });
  });
});

describe("completeFocusSession", () => {
  it("records the finished countdown without clearing task focus", async () => {
    const m = mockContext();
    const startedAt = new Date(Date.now() - 25 * 60_000);
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.TaskSession.findFirst.mockResolvedValue({
      id: "session-1",
      startedAt,
      plannedMinutes: 25,
    });

    const result = await completeFocusSession({ id: "task-1" }, m.context);

    expect(result).toEqual({
      completed: true,
      endedAt: new Date(startedAt.getTime() + 25 * 60_000),
    });
    expect(m.entities.TaskSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        endedAt: new Date(startedAt.getTime() + 25 * 60_000),
        completed: true,
      },
    });
    expect(m.entities.Task.update).not.toHaveBeenCalled();
  });
});

describe("pauseTask", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(pauseTask({ id: "task-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
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

  it("closes the task's open TaskSession (idempotent if none)", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", startedAt: null });

    await pauseTask({ id: "task-1" }, m.context);

    // updateMany is the close — it's a no-op if no session was open, which is
    // the right behavior for pausing an already-paused task.
    expect(m.entities.TaskSession.updateMany).toHaveBeenCalledWith({
      where: { taskId: "task-1", endedAt: null },
      data: { endedAt: expect.any(Date) },
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
    mockHydrationEcho(m);

    const result = await getTopTask({ lensId: "lens-1" }, m.context);

    expect(result?.id).toBe("started");
  });

  it("falls back to priority ranking when nothing is in progress", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "normal", priority: "NORMAL", startedAt: null }),
      candidate({ id: "important", priority: "IMPORTANT", startedAt: null }),
    ]);
    mockHydrationEcho(m);

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

    const result = await addTaskUpdate(
      { taskId: "task-1", body: "  Ship it  " },
      m.context,
    );

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
// updateTaskContent — edit the durable task notes/body
// ----------------------------------------------------------------
describe("updateTaskContent", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      updateTaskContent({ taskId: "task-1", content: "hello" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects a task that belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(
      updateTaskContent({ taskId: "task-1", content: "hello" }, m.context),
    ).rejects.toThrow(/not found/i);
  });

  it("trims and saves durable task content", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({
      id: "task-1",
      content: "Prep notes",
    });

    const result = await updateTaskContent(
      { taskId: "task-1", content: "  Prep notes  " },
      m.context,
    );

    expect(result).toEqual({ id: "task-1", content: "Prep notes" });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { content: "Prep notes" },
      select: { id: true, content: true },
    });
  });

  it("clears durable task content when saved as whitespace", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", content: null });

    await updateTaskContent(
      { taskId: "task-1", content: "   \n  " },
      m.context,
    );

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { content: null },
      select: { id: true, content: true },
    });
  });
});

// ----------------------------------------------------------------
// setTaskOutcome — edit a task's Outcome (task-fields §C/§F)
// ----------------------------------------------------------------
describe("setTaskOutcome", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      setTaskOutcome({ taskId: "task-1", outcome: "Shipped." }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects a task that belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(
      setTaskOutcome({ taskId: "task-1", outcome: "Shipped." }, m.context),
    ).rejects.toThrow(/not found/i);
  });

  it("trims and saves the outcome", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({
      id: "task-1",
      outcome: "Shipped the draft.",
    });

    const result = await setTaskOutcome(
      { taskId: "task-1", outcome: "  Shipped the draft.  " },
      m.context,
    );

    expect(result).toEqual({ id: "task-1", outcome: "Shipped the draft." });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { outcome: "Shipped the draft." },
      select: { id: true, outcome: true },
    });
  });

  it("clears the outcome when saved as whitespace", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", outcome: null });

    await setTaskOutcome({ taskId: "task-1", outcome: "   \n  " }, m.context);

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { outcome: null },
      select: { id: true, outcome: true },
    });
  });
});

// ----------------------------------------------------------------
// updateTaskDetails — edit task title + notes from the detail page
// ----------------------------------------------------------------
describe("updateTaskDetails", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      updateTaskDetails(
        { taskId: "task-1", description: "hello", content: "" },
        m.context,
      ),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects a task that belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(
      updateTaskDetails(
        { taskId: "task-1", description: "hello", content: "" },
        m.context,
      ),
    ).rejects.toThrow(/not found/i);
  });

  it("requires a non-empty task title", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    await expect(
      updateTaskDetails(
        { taskId: "task-1", description: "   ", content: "" },
        m.context,
      ),
    ).rejects.toThrow(/title is required/i);
  });

  it("trims and saves title plus durable task content", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({
      id: "task-1",
      description: "Email Sarah",
      content: "Prep notes",
    });

    const result = await updateTaskDetails(
      {
        taskId: "task-1",
        description: "  Email Sarah  ",
        content: "  Prep notes  ",
      },
      m.context,
    );

    expect(result).toEqual({
      id: "task-1",
      description: "Email Sarah",
      content: "Prep notes",
    });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { description: "Email Sarah", content: "Prep notes" },
      select: {
        id: true,
        description: true,
        content: true,
        priority: true,
        size: true,
        status: true,
        dueDate: true,
        projectId: true,
        goalId: true,
      },
    });
  });

  // ---- Structural-field live edits (from the chip popovers) ----

  it("writes priority alone when only priority is passed", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", priority: "IMPORTANT" });
    await updateTaskDetails(
      { taskId: "task-1", priority: "IMPORTANT" },
      m.context,
    );
    expect(m.entities.Task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priority: "IMPORTANT" } }),
    );
  });

  it("writes size alone when only size is passed", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    await updateTaskDetails({ taskId: "task-1", size: "XL" }, m.context);
    expect(m.entities.Task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { size: "XL" } }),
    );
  });

  it("writes status alone when only status is passed", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    await updateTaskDetails(
      { taskId: "task-1", status: "TODAY" },
      m.context,
    );
    expect(m.entities.Task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "TODAY" } }),
    );
  });

  it("writes dueDate alone (null clears it)", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    await updateTaskDetails(
      { taskId: "task-1", dueDate: null },
      m.context,
    );
    expect(m.entities.Task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dueDate: null } }),
    );
  });

  it("rejects a project in a different Lens", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "lens-a",
      projectId: null,
      goalId: null,
    });
    m.entities.Project.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "lens-b",
    });
    await expect(
      updateTaskDetails(
        { taskId: "task-1", projectId: "p-other-lens" },
        m.context,
      ),
    ).rejects.toThrow(/same Lens/i);
  });

  it("assigning a project clears the direct goal link (one-parent rule)", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "lens-a",
      projectId: null,
      goalId: "g-old",
    });
    m.entities.Project.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "lens-a",
    });
    await updateTaskDetails(
      { taskId: "task-1", projectId: "p1" },
      m.context,
    );
    expect(m.entities.Task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: "p1", goalId: null }),
      }),
    );
  });

  it("rejects a goal on a task that already has a project", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "lens-a",
      projectId: "p1",
      goalId: null,
    });
    m.entities.Goal.findUnique.mockResolvedValue({
      userId: "user-1",
      lensId: "lens-a",
    });
    await expect(
      updateTaskDetails({ taskId: "task-1", goalId: "g1" }, m.context),
    ).rejects.toThrow(/both a project and a goal/i);
  });

  it("does NOT enforce title-required when description is omitted", async () => {
    // A structural-only edit (no description) must not throw on title.
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    await updateTaskDetails(
      { taskId: "task-1", priority: "LOW" },
      m.context,
    );
    expect(m.entities.Task.update).toHaveBeenCalled();
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
      isOnboardingSample: false,
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
    // Completion also closes the open TaskSession so the focused segment
    // counts toward the task's total.
    expect(m.entities.TaskSession.updateMany).toHaveBeenCalledWith({
      where: { taskId: "task-1", endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
  });

  it("advances a completed sample task to real capture", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      completedAt: null,
      startedAt: new Date("2026-07-04T09:00:00Z"),
      userId: "user-1",
      isOnboardingSample: true,
    });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", completedAt: new Date() });

    await completeTaskFromFocus({ taskId: "task-1" }, m.context);

    expect(m.entities.User.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", onboardingStage: "SAMPLE_TASK" },
      data: { onboardingStage: "CAPTURE" },
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

  // Outcome (task-fields §C/§F): an optional outcome can ride on the same
  // completion transaction — the capture-at-completion moment.
  it("writes an optional outcome alongside the completion", async () => {
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

    await completeTaskFromFocus(
      { taskId: "task-1", outcome: "Shipped the draft." },
      m.context,
    );

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        isDone: true,
        completedAt: expect.any(Date),
        startedAt: null,
        outcome: "Shipped the draft.",
      },
      select: { id: true, completedAt: true },
    });
  });

  it("normalises a whitespace outcome to null on completion", async () => {
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

    await completeTaskFromFocus(
      { taskId: "task-1", outcome: "   " },
      m.context,
    );

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        isDone: true,
        completedAt: expect.any(Date),
        startedAt: null,
        outcome: null,
      },
      select: { id: true, completedAt: true },
    });
  });
});
