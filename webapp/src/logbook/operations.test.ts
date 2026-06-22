import { describe, it, expect } from "vitest";
import { mockContext } from "../test/mockContext";
import { getLogbook } from "./operations";

/**
 * Logbook — completed tasks + projects scoped to the active Lens, newest first.
 * Read-only query; asserts scoping (userId + lensId + isDone), ordering, and
 * the shape of the mapped return.
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
  it("fetches done tasks + projects scoped to user and lens, ordered desc", async () => {
    const m = mockContext();
    const taskRow = {
      id: "t1",
      description: "Email Sarah",
      completedAt: new Date("2026-06-24"),
      size: "S",
      project: { id: "p1", name: "Ship v2" },
    };
    const projectRow = {
      id: "p1",
      name: "Ship v2",
      completedAt: new Date("2026-06-23"),
      goal: { id: "g1", name: "Grow audience" },
    };
    m.entities.Task.findMany.mockResolvedValue([taskRow]);
    m.entities.Project.findMany.mockResolvedValue([projectRow]);

    const result = await getLogbook({ lensId: "lens-1" }, m.context);

    // Scoping
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
        project: { select: { id: true, name: true } },
      },
    });
    expect(m.entities.Project.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        lensId: "lens-1",
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        name: true,
        completedAt: true,
        goal: { select: { id: true, name: true } },
      },
    });

    // Return shape — fields mapped, kind tagged
    expect(result).toEqual({
      tasks: [
        {
          id: "t1",
          title: "Email Sarah",
          completedAt: taskRow.completedAt,
          size: "S",
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
    });
  });

  it("returns empty arrays when nothing is done", async () => {
    const m = mockContext();
    m.entities.Task.findMany.mockResolvedValue([]);
    m.entities.Project.findMany.mockResolvedValue([]);

    const result = await getLogbook({ lensId: "lens-1" }, m.context);

    expect(result).toEqual({ tasks: [], projects: [] });
  });
});
