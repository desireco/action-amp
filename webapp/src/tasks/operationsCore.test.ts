// @vitest-environment node
// Core functions are pure DB ops (no DOM); node is the right environment. The
// module under test imports nothing from `wasp/server`, so no mock is needed
// for it — unlike operations.test.ts, which stubs entitlementHttp because the
// ops there pull in `wasp/server` via that module.
import { describe, it, expect } from "vitest";
import {
  snoozeTarget,
  getTopTaskData,
  getTaskAlternativesData,
  TASK_ALTERNATIVES_LIMIT,
  hydrateTopTaskData,
  toggleTaskDoneCore,
  pauseTaskCore,
  completeFocusSessionCore,
} from "./operationsCore";
import { activePoolWhere } from "./activePool";
import { mockContext } from "../test/mockContext";

/**
 * Pure cores — the shared DB layer for Wasp ops + future /api/cli/* routes.
 *
 * These tests pin the core behavior directly (the ops layer delegates to them,
 * so operations.test.ts covers the auth + entitlement guards end-to-end).
 * Focus: the pure helpers + the sort/comparator + the write payloads — the
 * shapes the CLI will rely on.
 */

// ----------------------------------------------------------------
// Fixtures — match the Task shape the comparator reads.
// ----------------------------------------------------------------
const NOW = new Date("2026-06-20T10:00:00Z");

// SAFETY: fixture uses widened string types to match Prisma's runtime enum representation.
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

function candidate(overrides: Partial<typeof BASE_TASK> = {}) {
  return { ...BASE_TASK, project: null, goal: null, ...overrides };
}

// ----------------------------------------------------------------
// snoozeTarget — pure, deterministic (no Date.now(), no DB)
// ----------------------------------------------------------------
describe("snoozeTarget", () => {
  it("1h → UPCOMING with dueDate = now + 1h", () => {
    const { status, dueDate } = snoozeTarget("1h", NOW);
    expect(status).toBe("UPCOMING");
    expect(dueDate).toBeInstanceOf(Date);
    expect(dueDate!.getTime()).toBe(NOW.getTime() + 3600_000);
  });

  it("3h → UPCOMING with dueDate = now + 3h", () => {
    const { status, dueDate } = snoozeTarget("3h", NOW);
    expect(status).toBe("UPCOMING");
    expect(dueDate!.getTime()).toBe(NOW.getTime() + 3 * 3600_000);
  });

  it("tomorrow → UPCOMING, dueDate is the next day at 09:00 local", () => {
    const { status, dueDate } = snoozeTarget("tomorrow", NOW);
    expect(status).toBe("UPCOMING");
    expect(dueDate).toBeInstanceOf(Date);
    expect(dueDate!.getDate()).toBe(NOW.getDate() + 1);
    expect(dueDate!.getHours()).toBe(9);
  });

  it("weekend → UPCOMING, dueDate lands on a Saturday at 09:00 local", () => {
    const { status, dueDate } = snoozeTarget("weekend", NOW);
    expect(status).toBe("UPCOMING");
    expect(dueDate).toBeInstanceOf(Date);
    // getDay() === 6 is Saturday.
    expect(dueDate!.getDay()).toBe(6);
    expect(dueDate!.getHours()).toBe(9);
    // Always strictly in the future — "today is Saturday" still defers a week.
    expect(dueDate!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("someday → SOMEDAY with dueDate cleared to null", () => {
    const { status, dueDate } = snoozeTarget("someday", NOW);
    expect(status).toBe("SOMEDAY");
    expect(dueDate).toBeNull();
  });

  it("is deterministic — same inputs always yield the same dueDate", () => {
    expect(snoozeTarget("1h", NOW)).toEqual(snoozeTarget("1h", NOW));
  });
});

// ----------------------------------------------------------------
// getTopTaskData — candidate fetch + sort (started → Today → priority → size → oldest)
// ----------------------------------------------------------------
describe("getTopTaskData", () => {
  it("returns null when there are no candidates", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    const result = await getTopTaskData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result).toBeNull();
  });

  it("draws its candidate pool from activePoolWhere", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTopTaskData(m.entities, { userId: "user-1", lensId: "lens-1" });

    const call = m.entities.Task.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      userId: "user-1",
      lensId: "lens-1",
      status: { in: ["TODAY", "UPCOMING"] },
      isDone: false,
    });
    expect(call.include).toEqual({
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
    });
  });

  it("surfaces an in-progress task above higher-priority candidates", async () => {
    const m = mockContext();
    // A LOW-priority in-progress task + an IMPORTANT not-started one.
    // Normal priority ranking would put IMPORTANT first; the in-progress
    // override must win.
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "started", priority: "LOW", startedAt: new Date() }),
      candidate({ id: "important", priority: "IMPORTANT", startedAt: null }),
    ]);

    const result = await getTopTaskData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result).toMatchObject({ id: "started" });
  });

  it("ranks a TODAY task above an equal UPCOMING task (court beats bench)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "bench", status: "UPCOMING" }),
      candidate({ id: "court", status: "TODAY" }),
    ]);

    const result = await getTopTaskData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result).toMatchObject({ id: "court" });
  });

  it("breaks Today-tie by priority (IMPORTANT beats NORMAL)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "normal", priority: "NORMAL" }),
      candidate({ id: "top", priority: "IMPORTANT" }),
    ]);

    const result = await getTopTaskData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result).toMatchObject({ id: "top" });
  });

  it("breaks priority-tie by size (S beats M)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "big", priority: "NORMAL", size: "M" }),
      candidate({ id: "quick", priority: "NORMAL", size: "S" }),
    ]);

    const result = await getTopTaskData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result).toMatchObject({ id: "quick" });
  });

  it("breaks size-tie by createdAt (oldest first)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "newer", createdAt: new Date("2026-06-21T10:00:00Z") }),
      candidate({ id: "older", createdAt: new Date("2026-06-19T10:00:00Z") }),
    ]);

    const result = await getTopTaskData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result).toMatchObject({ id: "older" });
  });
});

// ----------------------------------------------------------------
// getTaskAlternativesData — the Next rail: same pool, same comparator,
// minus the on-stage task, capped at TASK_ALTERNATIVES_LIMIT
// ----------------------------------------------------------------
describe("getTaskAlternativesData", () => {
  it("returns [] when there are no candidates", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    const result = await getTaskAlternativesData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result).toEqual([]);
  });

  it("ranks with the same comparator as the top task (started → today → priority → size → oldest)", async () => {
    const m = mockContext();
    // Deliberately unordered input: bench LOW old, court IMPORTANT new, plain
    // NORMAL middling. Expect the getTopTaskData order verbatim.
    m.entities.Task.findMany.mockResolvedValue([
      candidate({
        id: "bench-low",
        status: "UPCOMING",
        priority: "LOW",
        createdAt: new Date("2026-06-01T10:00:00Z"),
      }),
      candidate({
        id: "court-important",
        status: "TODAY",
        priority: "IMPORTANT",
        createdAt: new Date("2026-06-19T10:00:00Z"),
      }),
      candidate({
        id: "court-normal",
        status: "TODAY",
        priority: "NORMAL",
        createdAt: new Date("2026-06-18T10:00:00Z"),
      }),
    ]);

    const result = await getTaskAlternativesData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
      // Explicit limit so this test pins ordering, not the default cap
      // (covered separately below).
      limit: 3,
    });

    expect(result.map((t: { id: string }) => t.id)).toEqual([
      "court-important",
      "court-normal",
      "bench-low",
    ]);
  });

  it("excludes the on-stage task (by id) so a pick can trade places with the recommendation", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "recommendation", priority: "IMPORTANT" }),
      candidate({ id: "picked", createdAt: new Date("2026-06-18T10:00:00Z") }),
      candidate({ id: "third", createdAt: new Date("2026-06-17T10:00:00Z") }),
    ]);

    const result = await getTaskAlternativesData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
      excludeIds: ["picked"],
    });

    // The recommendation re-enters the list while a picked task is on stage.
    expect(result.map((t: { id: string }) => t.id)).toEqual(["recommendation", "third"]);
  });

  it("caps the rail at TASK_ALTERNATIVES_LIMIT", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([
      candidate({ id: "on-stage", priority: "IMPORTANT" }),
      candidate({ id: "a", createdAt: new Date("2026-06-16T10:00:00Z") }),
      candidate({ id: "b", createdAt: new Date("2026-06-17T10:00:00Z") }),
      candidate({ id: "c", createdAt: new Date("2026-06-18T10:00:00Z") }),
      candidate({ id: "d", createdAt: new Date("2026-06-19T10:00:00Z") }),
    ]);

    const result = await getTaskAlternativesData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
      excludeIds: ["on-stage"],
    });

    expect(result.map((t: { id: string }) => t.id)).toEqual(["a", "b"]);
    expect(result.length).toBe(TASK_ALTERNATIVES_LIMIT);
  });

  it("draws its candidate pool from activePoolWhere (single source, like getTopTaskData)", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);

    await getTaskAlternativesData(m.entities, {
      userId: "user-1",
      lensId: "lens-1",
    });

    const call = m.entities.Task.findMany.mock.calls[0][0];
    const expected = activePoolWhere({ userId: "user-1", lensId: "lens-1" });
    expect(call.where).toMatchObject(expected);
    expect(call.include).toEqual({
      project: { select: { id: true, name: true } },
      goal: { select: { id: true, name: true } },
    });
  });
});

// ----------------------------------------------------------------
// hydrateTopTaskData — owned winner hydration (focus-goal-context spec)
// ----------------------------------------------------------------
// After getTopTaskData ranks candidates and returns the winner id, the Wasp
// getTopTask op + CLI /api/cli/now route hydrate THAT row with Project→Goal +
// session + NOTE context. Scoped by userId AND id; returns null when the row
// vanishes between ranking and hydration. History attaches only to the winner.
describe("hydrateTopTaskData", () => {
  it("queries by both userId and id (no caller hydrates another user's task)", async () => {
    const m = mockContext();
    m.entities.Task.findFirst.mockResolvedValue(null);

    await hydrateTopTaskData(m.entities, {
      userId: "user-1",
      id: "task-1",
    });

    expect(m.entities.Task.findFirst).toHaveBeenCalledWith({
      where: { id: "task-1", userId: "user-1" },
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

  it("returns null when the ranked winner vanished before hydration", async () => {
    const m = mockContext();
    m.entities.Task.findFirst.mockResolvedValue(null);

    const result = await hydrateTopTaskData(m.entities, {
      userId: "user-1",
      id: "gone",
    });

    expect(result).toBeNull();
  });

  it("returns the hydrated row with Project→Goal, direct Goal, sessions, and NOTE updates", async () => {
    const m = mockContext();
    const hydrated = {
      ...BASE_TASK,
      project: {
        id: "p1",
        permalink: "launch",
        name: "Launch v2",
        goal: { id: "g1", name: "Reach 100 paid", description: "Prove demand." },
      },
      goal: {
        id: "g-direct",
        permalink: "legacy",
        name: "Legacy goal",
        description: null,
      },
      sessions: [{ startedAt: new Date(), endedAt: new Date() }],
      updates: [{ body: "shipped", createdAt: new Date() }],
    };
    m.entities.Task.findFirst.mockResolvedValue(hydrated);

    const result = await hydrateTopTaskData(m.entities, {
      userId: "user-1",
      id: "task-1",
    });

    expect(result).toEqual(hydrated);
  });

  it("filters TaskUpdate to NOTE only (COMPLETED rows stay out of the continuity math)", async () => {
    const m = mockContext();
    m.entities.Task.findFirst.mockResolvedValue(null);

    await hydrateTopTaskData(m.entities, { userId: "user-1", id: "task-1" });

    const call = m.entities.Task.findFirst.mock.calls[0][0];
    expect(call.include.updates.where).toEqual({ kind: "NOTE" });
    expect(call.include.updates.orderBy).toEqual({ createdAt: "desc" });
  });
});

// ----------------------------------------------------------------
// toggleTaskDoneCore — tenancy + the done/completedAt/startedAt payload
// ----------------------------------------------------------------
describe("toggleTaskDoneCore", () => {
  it("throws if the task belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      userId: "someone-else",
    });
    await expect(
      toggleTaskDoneCore(m.entities, { userId: "user-1", id: "task-1" }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws if the task doesn't exist", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue(null);
    await expect(
      toggleTaskDoneCore(m.entities, { userId: "user-1", id: "task-1" }),
    ).rejects.toThrow(/not found/i);
  });

  it("marks an open task done and sets completedAt + clears startedAt", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: true });

    await toggleTaskDoneCore(m.entities, { userId: "user-1", id: "task-1" });

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        isDone: true,
        completedAt: expect.any(Date),
        startedAt: null,
      },
    });
  });

  it("marks a done task open and clears completedAt without touching outcome", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: true,
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: false });

    await toggleTaskDoneCore(m.entities, {
      userId: "user-1",
      id: "task-1",
      // outcome passed on un-complete must be IGNORED (only writes on done).
      outcome: "should be ignored",
    });

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      // No outcome key at all on un-completion.
      data: { isDone: false, completedAt: null, startedAt: null },
    });
  });

  it("writes a trimmed outcome when marking done", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({
      isDone: false,
      userId: "user-1",
    });
    m.entities.Task.update.mockResolvedValue({ ...BASE_TASK, isDone: true });

    await toggleTaskDoneCore(m.entities, {
      userId: "user-1",
      id: "task-1",
      outcome: "  shipped  ",
    });

    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        isDone: true,
        completedAt: expect.any(Date),
        startedAt: null,
        outcome: "shipped",
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

    await toggleTaskDoneCore(m.entities, {
      userId: "user-1",
      id: "task-1",
      outcome: "   ",
    });

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
});

// ----------------------------------------------------------------
// pauseTaskCore — close session + clear startedAt
// ----------------------------------------------------------------
describe("pauseTaskCore", () => {
  it("throws if the task belongs to another user", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "someone-else" });
    await expect(
      pauseTaskCore(m.entities, { userId: "user-1", id: "task-1" }),
    ).rejects.toThrow(/not found/i);
  });

  it("throws if the task doesn't exist", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue(null);
    await expect(
      pauseTaskCore(m.entities, { userId: "user-1", id: "task-1" }),
    ).rejects.toThrow(/not found/i);
  });

  it("closes the task's open TaskSession then clears startedAt", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", startedAt: null });

    const result = await pauseTaskCore(m.entities, {
      userId: "user-1",
      id: "task-1",
    });

    expect(result).toEqual({ id: "task-1", startedAt: null });
    // updateMany is the close — scoped to THIS task's open session, idempotent.
    expect(m.entities.TaskSession.updateMany).toHaveBeenCalledWith({
      where: { taskId: "task-1", endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { startedAt: null },
      select: { id: true, startedAt: true },
    });
  });

  it("resolves the tenancy lookup scoped to the passed userId", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.Task.update.mockResolvedValue({ id: "task-1", startedAt: null });

    await pauseTaskCore(m.entities, { userId: "user-1", id: "task-1" });

    expect(m.entities.Task.findUnique).toHaveBeenCalledWith({
      where: { id: "task-1" },
      select: { userId: true },
    });
  });
});

describe("completeFocusSessionCore", () => {
  it("rejects completion before the planned duration", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.TaskSession.findFirst.mockResolvedValue({
      id: "session-1",
      startedAt: new Date(),
      plannedMinutes: 25,
    });

    await expect(
      completeFocusSessionCore(m.entities, {
        userId: "user-1",
        id: "task-1",
      }),
    ).rejects.toThrow(/still running/i);
  });

  it("is idempotent when no session is open", async () => {
    const m = mockContext();
    m.entities.Task.findUnique.mockResolvedValue({ userId: "user-1" });
    m.entities.TaskSession.findFirst.mockResolvedValue(null);

    await expect(
      completeFocusSessionCore(m.entities, {
        userId: "user-1",
        id: "task-1",
      }),
    ).resolves.toEqual({ completed: false });
  });
});
