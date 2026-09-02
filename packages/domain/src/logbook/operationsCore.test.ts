// @vitest-environment node
// S8 — logbook core tests, ported from webapp/src/logbook/operations.test.ts
// and adapted to the pure core: the auth check (the Wasp op's "Not
// authenticated") lives in the API layer's requireUser, so that case is
// covered by the api fragment's requireUser seam and is not re-tested here.
// DB-work assertions are ported unchanged — the spies REPLACE the delegates
// entirely, so payloads arrive exactly as the core passes them.
import { describe, it, expect } from "vitest";

import { getLogbookData } from "./operationsCore.js";
import { mockContext, type MockContext } from "../test/mockContext.js";

function asLogbook<F>(entities: MockContext["entities"]): F {
  // SAFETY: EntitySpy vi.fn()s satisfy the delegate slice at runtime.
  return entities as unknown as F;
}

/**
 * Logbook — the record of things no longer active, scoped to the active Lens.
 * Five categories: completed tasks, wont-do tasks, completed projects,
 * completed goals, and archived notes (status ARCHIVED). Asserts scoping +
 * ordering + the mapped return shape. Note: archived notes are universal
 * (no lens filter) — they belong to the user, not a context.
 */

describe("getLogbookData — query + return shape", () => {
  it("fetches done tasks + projects + goals (scoped) and archived notes (universal)", async () => {
    const m = mockContext();
    const taskRow = {
      id: "t1",
      description: "Email Sarah",
      completedAt: new Date("2026-06-24"),
      size: "S",
      outcome: "She said yes — kickoff Friday.",
      project: { id: "p1", name: "Ship v2" },
    };
    const projectRow = {
      id: "p1",
      name: "Ship v2",
      completedAt: new Date("2026-06-23"),
      goal: { id: "g1", name: "Grow audience" },
    };
    const goalRow = {
      id: "g1",
      name: "Grow audience",
      completedAt: new Date("2026-06-22"),
    };
    const archivedRow = {
      id: "ix1",
      text: "Decline this for now",
      archivedAt: new Date("2026-06-25"),
    };
    m.entities.Task.findMany
      // First call (completed tasks) → the done row. Second call (wont-do)
      // → empty in this scenario (no declined tasks). mockResolvedValueOnce
      // pins each; a plain mockResolvedValue would return the same fixture
      // for both calls.
      .mockResolvedValueOnce([taskRow])
      .mockResolvedValueOnce([]);
    m.entities.Project.findMany.mockResolvedValue([projectRow]);
    m.entities.Goal.findMany.mockResolvedValue([goalRow]);
    m.entities.InboxItem.findMany.mockResolvedValue([archivedRow]);

    const result = await getLogbookData(asLogbook(m.entities), {
      userId: "user-1",
      lensId: "lens-1",
    });

    // Tasks + projects + goals scoped to user + lens; archived notes universal.
    expect(m.entities.Task.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        lensId: "lens-1",
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        description: true,
        completedAt: true,
        size: true,
        outcome: true,
        project: { select: { id: true, name: true } },
      },
    });
    // Goals lens-scoped, same shape as projects (goal-planning spec §D).
    expect(m.entities.Goal.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        lensId: "lens-1",
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: { id: true, name: true, completedAt: true },
    });
    expect(m.entities.InboxItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "ARCHIVED" },
      orderBy: { archivedAt: "desc" },
      select: { id: true, text: true, archivedAt: true },
    });

    // Return shape — fields mapped, kind tagged. Goals carry goal: null.
    expect(result).toEqual({
      tasks: [
        {
          id: "t1",
          title: "Email Sarah",
          completedAt: taskRow.completedAt,
          size: "S",
          outcome: taskRow.outcome,
          project: taskRow.project,
          kind: "task",
        },
      ],
      wontDo: [],
      projects: [
        {
          id: "p1",
          title: "Ship v2",
          completedAt: projectRow.completedAt,
          goal: projectRow.goal,
          kind: "project",
        },
      ],
      goals: [
        {
          id: "g1",
          title: "Grow audience",
          completedAt: goalRow.completedAt,
          goal: null,
          kind: "goal",
        },
      ],
      archived: [
        {
          id: "ix1",
          title: "Decline this for now",
          archivedAt: archivedRow.archivedAt,
          kind: "archived",
        },
      ],
    });
  });

  it("returns empty arrays when nothing is done or archived", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);
    m.entities.Project.findMany.mockResolvedValue([]);
    m.entities.Goal.findMany.mockResolvedValue([]);
    m.entities.InboxItem.findMany.mockResolvedValue([]);

    const result = await getLogbookData(asLogbook(m.entities), {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result).toEqual({ tasks: [], wontDo: [], projects: [], goals: [], archived: [] });
  });

  it("returns wont-do tasks (status=WONT_DO) tagged kind=wont-do", async () => {
    // The core fires two Task.findMany calls — first for completed (isDone),
    // second for wont-do (status=WONT_DO). mockResolvedValueOnce pins each.
    const m = mockContext();
    const wontDoRow = {
      id: "t9",
      description: "Investigate Firebase",
      updatedAt: new Date("2026-07-20"),
      size: "M",
      project: { id: "p1", name: "MVP" },
    };
    // First call (completed tasks) → empty; second call (wont-do) → the row.
    m.entities.Task.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([wontDoRow]);
    m.entities.Project.findMany.mockResolvedValue([]);
    m.entities.Goal.findMany.mockResolvedValue([]);
    m.entities.InboxItem.findMany.mockResolvedValue([]);

    const result = await getLogbookData(asLogbook(m.entities), {
      userId: "user-1",
      lensId: "lens-1",
    });

    expect(result.wontDo).toEqual([
      {
        id: "t9",
        title: "Investigate Firebase",
        completedAt: wontDoRow.updatedAt,
        size: "M",
        project: wontDoRow.project,
        kind: "wont-do",
      },
    ]);
    // And the wont-do query is filtered correctly (updatedAt order — NOT the
    // non-existent archivedAt that once 500'd the webapp query).
    expect(m.entities.Task.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "lens-1", status: "WONT_DO" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        description: true,
        updatedAt: true,
        size: true,
        project: { select: { id: true, name: true } },
      },
    });
  });
});
