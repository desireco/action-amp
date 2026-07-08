import { describe, it, expect } from "vitest";
import { mockContext } from "../test/mockContext";
import { getLogbook } from "./operations";

/**
 * Logbook — the record of things no longer active, scoped to the active Lens.
 * Three categories: completed tasks, completed projects, and archived notes
 * (status ARCHIVED). Asserts scoping + ordering + the mapped return shape.
 * Note: archived notes are universal (no lens filter) — they belong to the
 * user, not a context.
 */

describe("getLogbook — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getLogbook({ lensId: "lens-1" }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("getLogbook — query + return shape", () => {
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
    m.entities.Task.findMany.mockResolvedValue([taskRow]);
    m.entities.Project.findMany.mockResolvedValue([projectRow]);
    m.entities.Goal.findMany.mockResolvedValue([goalRow]);
    m.entities.InboxItem.findMany.mockResolvedValue([archivedRow]);

    const result = await getLogbook({ lensId: "lens-1" }, m.context);

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

    const result = await getLogbook({ lensId: "lens-1" }, m.context);

    expect(result).toEqual({ tasks: [], projects: [], goals: [], archived: [] });
  });
});
