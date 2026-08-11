// @vitest-environment node
/**
 * Pure-core tests for the lens read functions (getLensesCore, getLensCore).
 *
 * These back the `/api/cli/lens/list` + `/api/cli/lens/show` PAT routes. They
 * are pure (no `wasp/server`), so we test them directly with the mockContext
 * entity spies — same pattern as `billing/entitlements.test.ts`. The lens
 * CRUD actions (create/update/delete) stay in the Wasp op layer and are
 * tested in `operations.test.ts`; this file covers only the read cores.
 */
import { describe, it, expect } from "vitest";
import { getLensesCore, getLensCore } from "./operationsCore";
import { mockContext } from "../test/mockContext";

const ME = {
  id: "l1",
  name: "Me",
  kind: "PERSONAL",
  type: "LIFE_AREA",
  color: null,
  purpose: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  _count: { goals: 0, projects: 0, tasks: 2 },
  listItems: [],
};
const WORK = {
  id: "l2",
  name: "Work",
  kind: "WORK",
  type: "LIFE_AREA",
  color: "indigo",
  purpose: "Day job",
  createdAt: "2026-07-02T00:00:00.000Z",
  _count: { goals: 1, projects: 3, tasks: 12 },
  listItems: [],
};
const STUDIO = {
  id: "l3",
  name: "Studio",
  kind: "CUSTOM",
  type: "LIFE_AREA",
  color: "coral",
  purpose: "Side projects",
  createdAt: "2026-07-03T00:00:00.000Z",
  _count: { goals: 0, projects: 1, tasks: 4 },
  listItems: [],
};
const SHOPPING = {
  id: "l4",
  name: "Shopping",
  kind: "CUSTOM",
  type: "SIMPLE_LIST",
  color: "cyan",
  purpose: "Groceries",
  createdAt: "2026-07-04T00:00:00.000Z",
  _count: { goals: 0, projects: 0, tasks: 0 },
  listItems: [{ isDone: false }, { isDone: false }, { isDone: true }],
};

describe("getLensesCore", () => {
  it("queries by userId only (no entitlement filter — list is always allowed)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findMany.mockResolvedValue([ME]);
    await getLensesCore(m.entities, { userId: "user-1" });
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
        listItems: { select: { isDone: true } },
      },
    });
  });

  it("maps rows to the { id, name, kind, color, purpose, counts } shape", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findMany.mockResolvedValue([WORK]);
    const out = await getLensesCore(m.entities, { userId: "user-1" });
    expect(out).toEqual([
      {
        id: "l2",
        name: "Work",
        kind: "WORK",
        type: "LIFE_AREA",
        color: "indigo",
        purpose: "Day job",
        counts: { goals: 1, projects: 3, tasks: 12, openItems: 0, checkedItems: 0 },
      },
    ]);
  });

  it("returns open and checked counts for a Simple-list Lens", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findMany.mockResolvedValue([SHOPPING]);
    const out = await getLensesCore(m.entities, { userId: "user-1" });
    expect(out[0]).toMatchObject({
      type: "SIMPLE_LIST",
      counts: { openItems: 2, checkedItems: 1 },
    });
  });

  it("sorts seeded-first (PERSONAL, WORK) then CUSTOM by createdAt", async () => {
    const m = mockContext("user-1");
    // Returned by Prisma in createdAt asc order — CUSTOM before WORK before
    // PERSONAL alphabetically is wrong; the core re-sorts to seeded-first.
    m.entities.Lens.findMany.mockResolvedValue([STUDIO, WORK, ME]);
    const out = await getLensesCore(m.entities, { userId: "user-1" });
    expect(out.map((l) => l.kind)).toEqual(["PERSONAL", "WORK", "CUSTOM"]);
    expect(out.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("empty → []", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findMany.mockResolvedValue([]);
    const out = await getLensesCore(m.entities, { userId: "user-1" });
    expect(out).toEqual([]);
  });
});

describe("getLensCore", () => {
  it("queries by userId + (id OR name) — tenancy-safe findFirst", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(WORK);
    await getLensCore(m.entities, { userId: "user-1", idOrName: "Work" });
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
        listItems: { select: { isDone: true } },
      },
    });
  });

  it("returns type-specific counts for Simple-list detail", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(SHOPPING);
    const out = await getLensCore(m.entities, { userId: "user-1", idOrName: "Shopping" });
    expect(out).toMatchObject({ type: "SIMPLE_LIST", counts: { openItems: 2, checkedItems: 1 } });
  });

  it("resolves by name (not just id)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(WORK);
    const out = await getLensCore(m.entities, { userId: "user-1", idOrName: "Work" });
    expect(out?.id).toBe("l2");
    expect(out?.name).toBe("Work");
  });

  it("resolves by id", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(WORK);
    const out = await getLensCore(m.entities, { userId: "user-1", idOrName: "l2" });
    expect(out?.id).toBe("l2");
  });

  it("includes createdAt on the detail shape (list summary omits it)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(WORK);
    const out = await getLensCore(m.entities, { userId: "user-1", idOrName: "l2" });
    expect(out?.createdAt).toBe("2026-07-02T00:00:00.000Z");
  });

  it("returns null for an unknown id", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(null);
    const out = await getLensCore(m.entities, { userId: "user-1", idOrName: "ghost" });
    expect(out).toBeNull();
  });

  it("returns null for a lens owned by another user (tenancy)", async () => {
    // findFirst is called with { where: { userId, OR: [...] } } — so another
    // user's lens name simply doesn't match the where clause and Prisma
    // returns null. The userId is enforced AT THE DB LEVEL, not in JS.
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(null);
    const out = await getLensCore(m.entities, { userId: "user-2", idOrName: "Work" });
    expect(out).toBeNull();
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-2" }) }),
    );
  });
});
