// @vitest-environment node
/**
 * Pure-core tests for the lens read functions (getLensesCore, getLensCore) —
 * ported verbatim from webapp/src/lenses/operationsCore.test.ts (S7).
 *
 * These back the Settings Lenses tab and (later) the `/api/cli/lens/list` +
 * `/api/cli/lens/show` PAT routes. They are pure, so we test them directly
 * with the mockContext entity spies. The lens CRUD cores are covered in
 * `./lifecycleCore.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { getLensesCore, getLensCore } from "./operationsCore.js";
import { mockContext } from "../test/mockContext.js";

function asLenses<F>(entities: ReturnType<typeof mockContext>["entities"]): F {
  // SAFETY: EntitySpy vi.fn()s satisfy the delegate slice at runtime.
  return entities as unknown as F;
}

const ME = {
  id: "l1",
  name: "Me",
  isDefault: true,
  isIncluded: true,
  color: null,
  purpose: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  _count: { goals: 0, projects: 0, tasks: 2 },
  goals: [],
  projects: [],
  tasks: [{ id: "t1" }],
};
const WORK = {
  id: "l2",
  name: "Work",
  isDefault: true,
  isIncluded: false,
  color: "indigo",
  purpose: "Day job",
  createdAt: "2026-07-02T00:00:00.000Z",
  _count: { goals: 1, projects: 3, tasks: 12 },
  goals: [{ id: "g1" }],
  projects: [{ id: "p1", name: "Launch" }],
  tasks: [{ id: "t1" }],
};
const STUDIO = {
  id: "l3",
  name: "Studio",
  isDefault: false,
  isIncluded: false,
  color: "coral",
  purpose: "Side projects",
  createdAt: "2026-07-03T00:00:00.000Z",
  _count: { goals: 0, projects: 1, tasks: 4 },
  goals: [],
  projects: [{ id: "p1", name: "Studio build" }],
  tasks: [{ id: "t1" }],
};
describe("getLensesCore", () => {
  it("queries by userId only (no entitlement filter — list is always allowed)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findMany.mockResolvedValue([ME]);
    await getLensesCore(asLenses(m.entities), {
      userId: "user-1",
    });
    expect(m.entities.Lens.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: {
            goals: { where: { isDone: false } },
            projects: { where: { isDone: false } },
            tasks: { where: { isDone: false } },
          },
        },
        goals: { select: { id: true }, take: 1 },
        projects: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
        tasks: { select: { id: true }, take: 1 },
      },
    });
  });

  it("maps rows to the neutral Lens summary shape", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findMany.mockResolvedValue([WORK]);
    const out = await getLensesCore(asLenses(m.entities), {
      userId: "user-1",
    });
    expect(out).toEqual([
      {
        id: "l2",
        name: "Work",
        isDefault: true,
        isIncluded: false,
        color: "indigo",
        purpose: "Day job",
        hasAnyContent: true,
        blockingProjects: [{ id: "p1", name: "Launch" }],
        counts: { goals: 1, projects: 3, tasks: 12 },
      },
    ]);
  });

  it("sorts included then default Lenses before later Lenses", async () => {
    const m = mockContext("user-1");
    // Returned by Prisma in createdAt asc order — CUSTOM before WORK before
    // PERSONAL alphabetically is wrong; the core re-sorts to seeded-first.
    m.entities.Lens.findMany.mockResolvedValue([STUDIO, WORK, ME]);
    const out = await getLensesCore(asLenses(m.entities), {
      userId: "user-1",
    });
    expect(out.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    expect(out.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("empty → []", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findMany.mockResolvedValue([]);
    const out = await getLensesCore(asLenses(m.entities), {
      userId: "user-1",
    });
    expect(out).toEqual([]);
  });
});

describe("getLensCore", () => {
  it("queries by userId + (id OR name) — tenancy-safe findFirst", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(WORK);
    await getLensCore(asLenses(m.entities), {
      userId: "user-1",
      idOrName: "Work",
    });
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", OR: [{ id: "Work" }, { name: "Work" }] },
      include: {
        _count: {
          select: {
            goals: { where: { isDone: false } },
            projects: { where: { isDone: false } },
            tasks: { where: { isDone: false } },
          },
        },
        goals: { select: { id: true }, take: 1 },
        projects: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
        tasks: { select: { id: true }, take: 1 },
      },
    });
  });

  it("detects completed structured content even when active counts are zero", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({
      ...ME,
      _count: { goals: 0, projects: 0, tasks: 0 },
      tasks: [{ id: "completed-task" }],
    });
    const out = await getLensCore(asLenses(m.entities), {
      userId: "user-1",
      idOrName: "Me",
    });
    expect(out).toMatchObject({ hasAnyContent: true, counts: { tasks: 0 } });
  });

  it("resolves by name (not just id)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(WORK);
    const out = await getLensCore(asLenses(m.entities), {
      userId: "user-1",
      idOrName: "Work",
    });
    expect(out?.id).toBe("l2");
    expect(out?.name).toBe("Work");
  });

  it("resolves by id", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(WORK);
    const out = await getLensCore(asLenses(m.entities), {
      userId: "user-1",
      idOrName: "l2",
    });
    expect(out?.id).toBe("l2");
  });

  it("includes createdAt on the detail shape (list summary omits it)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(WORK);
    const out = await getLensCore(asLenses(m.entities), {
      userId: "user-1",
      idOrName: "l2",
    });
    expect(out?.createdAt).toBe("2026-07-02T00:00:00.000Z");
  });

  it("returns null for an unknown id", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(null);
    const out = await getLensCore(asLenses(m.entities), {
      userId: "user-1",
      idOrName: "ghost",
    });
    expect(out).toBeNull();
  });

  it("returns null for a lens owned by another user (tenancy)", async () => {
    // findFirst is called with { where: { userId, OR: [...] } } — so another
    // user's lens name simply doesn't match the where clause and Prisma
    // returns null. The userId is enforced AT THE DB LEVEL, not in JS.
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(null);
    const out = await getLensCore(asLenses(m.entities), {
      userId: "user-2",
      idOrName: "Work",
    });
    expect(out).toBeNull();
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-2" }) }),
    );
  });
});
