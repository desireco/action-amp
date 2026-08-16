// @vitest-environment node
// Lens CRUD op tests. Server project (see vitest.config.ts): the REAL
// entitlement guards run (genuine HttpError 402s), and the module-owned
// Prisma transaction goes through the injectable lensDb seam exported from
// ./operations — no module mocking. Here we assert the ops wire the guards
// correctly and enforce tenancy + kind + unique.
import { describe, it, expect, vi, afterEach } from "vitest";

const { createLens, updateLens, deleteLens, getLenses, lensDb } =
  await import("./operations");
import {
  mockContext,
  type MockUser,
  type MockContext,
} from "../test/mockContext";
import { PRO_LIMITS } from "../billing/config";

// Swapped in the reassign tests; restored after each test so later suites
// see the real transaction runner.
const realTransaction = lensDb.transaction;

/** The tx slice the fake transaction hands the op (structural — vi.fn spies
 *  standing in for the Prisma tx delegates). */
type TxSpy = { updateMany: ReturnType<typeof vi.fn> };
interface LensTxForTest {
  listItem: TxSpy;
  goal: TxSpy;
  task: TxSpy;
  project: TxSpy;
  lens: { delete: ReturnType<typeof vi.fn> };
}

/** Swap the lensDb transaction seam to run against a fake tx. The listItem
 *  delegate is only touched for SIMPLE_LIST lenses — LIFE_AREA fakes omit it. */
function swapTransaction(
  tx: Partial<LensTxForTest> & Omit<LensTxForTest, "listItem">,
) {
  // SAFETY: the fake satisfies the LensTxClient slice at runtime — vi.fn()
  // spies just aren't assignable to the Prisma-typed delegates.
  lensDb.transaction = (async <T>(
    fn: (tx: Partial<LensTxForTest>) => Promise<T>,
  ) => fn(tx)) as typeof lensDb.transaction;
}
afterEach(() => {
  lensDb.transaction = realTransaction;
});

const FUTURE = new Date(Date.now() + 86_400_000);
const PRO_USER: MockUser = { id: "user-1", plan: "PRO", planRenewsAt: FUTURE };

function resetSpies() {
  lensDb.transaction = realTransaction;
}

/** A Prisma P2002 (unique constraint violation) shaped error, so the op's
 * catch block rewrites it into a 409. Mirrors what Prisma actually throws. */
function p2002() {
  return { code: "P2002", message: "Unique constraint failed" };
}

function addListItemEntity(m: ReturnType<typeof mockContext>, count = 0) {
  m.entities.ListItem = {
    ...m.entities.Task,
    count: vi.fn().mockResolvedValue(count),
  };
}

describe("createLens", () => {
  it("creates an ordinary non-default Lens", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.count.mockResolvedValue(2);
    m.entities.Lens.create.mockResolvedValue({
      id: "l",
      name: "Studio",
      isDefault: false,
      isIncluded: false,
      color: "coral",
      purpose: "side projects",
    });

    const out = await createLens(
      { name: "Studio", color: "coral", purpose: "side projects" },
      m.context,
    );

    // The REAL config guard admitted this PRO user (a FREE user would have
    // thrown 402 before any count), and the REAL cap guard read the count the
    // op fetched — assert the cap input (count=2, PRO_LIMITS.lenses) through
    // the op's own Lens.count query.
    expect(m.entities.Lens.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(m.entities.Lens.create).toHaveBeenCalledWith({
      data: {
        name: "Studio",
        isDefault: false,
        isIncluded: false,
        type: "LIFE_AREA",
        color: "coral",
        purpose: "side projects",
        userId: "user-1",
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        type: true,
        color: true,
        purpose: true,
      },
    });
    expect(out).toEqual({
      id: "l",
      name: "Studio",
      isDefault: false,
      isIncluded: false,
      color: "coral",
      purpose: "side projects",
    });
  });

  it("rejects an unknown color key (400)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    await expect(
      createLens({ name: "X", color: "hotpink" }, m.context),
    ).rejects.toThrow(/Unknown lens color/);
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
  });

  it("creates a Simple-list Lens when selected", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.count.mockResolvedValue(2);
    m.entities.Lens.create.mockResolvedValue({
      id: "shopping",
      type: "SIMPLE_LIST",
    });
    await createLens({ name: "Shopping", type: "SIMPLE_LIST" }, m.context);
    expect(m.entities.Lens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDefault: false,
          isIncluded: false,
          type: "SIMPLE_LIST",
        }),
      }),
    );
  });

  it("rewrites a P2002 unique violation into a 409", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.count.mockResolvedValue(0);
    m.entities.Lens.create.mockRejectedValue(p2002());

    await expect(createLens({ name: "Work" }, m.context)).rejects.toThrow(
      /already have a lens named "Work"/,
    );
  });

  it("trims the name and nulls an empty purpose", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.count.mockResolvedValue(0);
    m.entities.Lens.create.mockResolvedValue({
      id: "l",
      name: "Studio",
      isDefault: false,
      isIncluded: false,
      color: null,
      purpose: null,
    });

    await createLens({ name: "  Studio  ", purpose: "   " }, m.context);
    expect(m.entities.Lens.create).toHaveBeenCalledWith({
      data: {
        name: "Studio",
        isDefault: false,
        isIncluded: false,
        type: "LIFE_AREA",
        color: null,
        purpose: null,
        userId: "user-1",
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        type: true,
        color: true,
        purpose: true,
      },
    });
  });
});

describe("updateLens", () => {
  it("changes type for an empty custom Lens", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Errands",
      isDefault: false,
      type: "LIFE_AREA",
    });
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.ListItem.count.mockResolvedValue(0);
    m.entities.Lens.update.mockResolvedValue({
      id: "l",
      name: "Errands",
      kind: "CUSTOM",
      type: "SIMPLE_LIST",
    });

    await updateLens({ id: "l", type: "SIMPLE_LIST" }, m.context);

    expect(m.entities.Lens.update).toHaveBeenCalledWith({
      where: { id: "l" },
      data: { type: "SIMPLE_LIST" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        type: true,
        color: true,
        purpose: true,
      },
    });
  });

  it("blocks type conversion while a custom Lens has content", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      kind: "CUSTOM",
      type: "LIFE_AREA",
    });
    m.entities.Goal.count.mockResolvedValue(1);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.ListItem.count.mockResolvedValue(0);

    await expect(
      updateLens({ id: "l", type: "SIMPLE_LIST" }, m.context),
    ).rejects.toThrow(/still has content/i);
    expect(m.entities.Lens.update).not.toHaveBeenCalled();
  });

  it("keeps seeded Lens types fixed", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "work",
      name: "Work",
      isDefault: true,
      type: "LIFE_AREA",
    });

    await expect(
      updateLens({ id: "work", type: "SIMPLE_LIST" }, m.context),
    ).rejects.toThrow(/always remain Life areas/i);
    expect(m.entities.Goal.count).not.toHaveBeenCalled();
    expect(m.entities.Lens.update).not.toHaveBeenCalled();
  });

  it("updates name/purpose/color on a tenancy-scoped lens", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      kind: "CUSTOM",
    });
    m.entities.Lens.update.mockResolvedValue({
      id: "l",
      name: "Atelier",
      kind: "CUSTOM",
      color: "coral",
      purpose: "x",
    });

    await updateLens(
      { id: "l", name: "Atelier", purpose: "x", color: "coral" },
      m.context,
    );
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith({
      where: { id: "l", userId: "user-1" },
      select: { id: true, name: true, isDefault: true, type: true },
    });
    expect(m.entities.Lens.update).toHaveBeenCalledWith({
      where: { id: "l" },
      data: { name: "Atelier", purpose: "x", color: "coral" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        type: true,
        color: true,
        purpose: true,
      },
    });
  });

  it("allows editing a SEEDED lens (kind WORK) — rename yes, delete no", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l-work",
      name: "Work",
      isDefault: true,
    });
    m.entities.Lens.update.mockResolvedValue({
      id: "l-work",
      name: "Studio",
      kind: "WORK",
      color: "indigo",
      purpose: null,
    });

    await updateLens({ id: "l-work", name: "Studio" }, m.context);
    expect(m.entities.Lens.update).toHaveBeenCalledWith({
      where: { id: "l-work" },
      data: { name: "Studio" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        type: true,
        color: true,
        purpose: true,
      },
    });
  });

  it("404s when the lens is not found (or not the user's)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue(null);
    await expect(
      updateLens({ id: "nope", name: "x" }, m.context),
    ).rejects.toThrow(/not found/i);
    expect(m.entities.Lens.update).not.toHaveBeenCalled();
  });

  it("rewrites a rename-collision P2002 into a 409", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Old",
      kind: "CUSTOM",
    });
    m.entities.Lens.update.mockRejectedValue(p2002());

    await expect(
      updateLens({ id: "l", name: "Work" }, m.context),
    ).rejects.toThrow(/already have a lens named "Work"/);
  });
});

describe("deleteLens", () => {
  it("refuses to delete a seeded lens (kind !== CUSTOM) → 409", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l-work",
      name: "Work",
      isDefault: true,
    });

    await expect(
      deleteLens({ id: "l-work", mode: "delete" }, m.context),
    ).rejects.toThrow(/can't be deleted/);
    expect(m.entities.Lens.delete).not.toHaveBeenCalled();
  });

  it("hard-deletes an EMPTY CUSTOM lens (mode: delete)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      kind: "CUSTOM",
    });
    // Empty lens: all counts return 0.
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    addListItemEntity(m);
    m.entities.Lens.delete.mockResolvedValue({ id: "l" });

    const out = await deleteLens({ id: "l", mode: "delete" }, m.context);
    expect(out).toEqual({ id: "l" });
    expect(m.entities.Task.updateMany).not.toHaveBeenCalled(); // no reassign
    expect(m.entities.Lens.delete).toHaveBeenCalledWith({
      where: { id: "l" },
      select: { id: true },
    });
  });

  it("refuses hard-delete when the lens has content → 409 (no silent cascade)", async () => {
    // Spec: "No silent cascade delete." A lens with content must be reassigned,
    // not hard-deleted. The server enforces it even if the client bypasses the
    // dialog's "move first" default.
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      kind: "CUSTOM",
    });
    m.entities.Goal.count.mockResolvedValue(1);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(3);
    addListItemEntity(m);

    await expect(
      deleteLens({ id: "l", mode: "delete" }, m.context),
    ).rejects.toThrow(/still has content/);
    expect(m.entities.Lens.delete).not.toHaveBeenCalled();
  });

  it("reassigns content to the target lens then deletes (mode: reassign)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    const tx = {
      goal: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      task: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      project: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      lens: { delete: vi.fn().mockResolvedValue({ id: "l" }) },
    };
    swapTransaction(tx);
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", kind: "CUSTOM" }) // the lens
      .mockResolvedValueOnce({ id: "l-me", name: "Me", kind: "PERSONAL" }); // tenancy-check target

    const out = await deleteLens(
      { id: "l", mode: "reassign", targetLensId: "l-me" },
      m.context,
    );

    expect(out).toEqual({ id: "l" });
    expect(lensDb.transaction).toBeDefined();
    // All three entity types move to the target and the lens delete happens in
    // the same transaction, so a later failure rolls back earlier moves.
    expect(tx.goal.updateMany).toHaveBeenCalledWith({
      where: { lensId: "l" },
      data: { lensId: "l-me" },
    });
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { lensId: "l" },
      data: { lensId: "l-me" },
    });
    expect(tx.project.updateMany).toHaveBeenCalledWith({
      where: { lensId: "l" },
      data: { lensId: "l-me" },
    });
    expect(tx.lens.delete).toHaveBeenCalledWith({
      where: { id: "l" },
      select: { id: true },
    });
  });

  it("reassign Goal collision (same name in target) → 409, nothing moved", async () => {
    // Goal has @@unique([userId, name]) — a same-named goal in the target lens
    // makes updateMany throw P2002. The op catches it and 409s with guidance.
    resetSpies();
    const m = mockContext(PRO_USER);
    const tx = {
      goal: { updateMany: vi.fn().mockRejectedValue(p2002()) },
      task: { updateMany: vi.fn() },
      project: { updateMany: vi.fn() },
      lens: { delete: vi.fn() },
    };
    swapTransaction(tx);
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", kind: "CUSTOM" })
      .mockResolvedValueOnce({ id: "l-me", name: "Me", kind: "PERSONAL" });

    await expect(
      deleteLens(
        { id: "l", mode: "reassign", targetLensId: "l-me" },
        m.context,
      ),
    ).rejects.toThrow(/shares a name with one in the target lens/);
    expect(lensDb.transaction).toBeDefined();
    expect(tx.goal.updateMany).toHaveBeenCalled();
    expect(tx.task.updateMany).not.toHaveBeenCalled();
    expect(tx.project.updateMany).not.toHaveBeenCalled();
    expect(tx.lens.delete).not.toHaveBeenCalled();
  });

  it("reassign refuses the same lens as target (400)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      kind: "CUSTOM",
    });

    await expect(
      deleteLens({ id: "l", mode: "reassign", targetLensId: "l" }, m.context),
    ).rejects.toThrow(/different lens/);
  });

  it("reassign 404s when the target lens is not found / not the user's", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", kind: "CUSTOM" })
      .mockResolvedValueOnce(null); // target missing

    await expect(
      deleteLens(
        { id: "l", mode: "reassign", targetLensId: "nope" },
        m.context,
      ),
    ).rejects.toThrow(/Target lens not found/);
    expect(m.entities.Task.updateMany).not.toHaveBeenCalled();
  });

  it("rejects cross-type reassignment", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({
        id: "l",
        name: "Studio",
        kind: "CUSTOM",
        type: "LIFE_AREA",
      })
      .mockResolvedValueOnce({ id: "shopping", type: "SIMPLE_LIST" });
    await expect(
      deleteLens(
        { id: "l", mode: "reassign", targetLensId: "shopping" },
        m.context,
      ),
    ).rejects.toThrow(/same type/i);
    // No transaction ran: the seam still holds the real runner, which the
    // mocked context can't satisfy — proof the op rejected before reaching it.
    expect(lensDb.transaction).toBe(realTransaction);
  });

  it("reassigns Simple-list items without moving structured entities", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    const tx = {
      listItem: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      goal: { updateMany: vi.fn() },
      task: { updateMany: vi.fn() },
      project: { updateMany: vi.fn() },
      lens: { delete: vi.fn().mockResolvedValue({ id: "shopping" }) },
    };
    swapTransaction(tx);
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({
        id: "shopping",
        name: "Shopping",
        kind: "CUSTOM",
        type: "SIMPLE_LIST",
      })
      .mockResolvedValueOnce({ id: "packing", type: "SIMPLE_LIST" });

    await deleteLens(
      { id: "shopping", mode: "reassign", targetLensId: "packing" },
      m.context,
    );
    expect(tx.listItem.updateMany).toHaveBeenCalledWith({
      where: { lensId: "shopping" },
      data: { lensId: "packing" },
    });
    expect(tx.goal.updateMany).not.toHaveBeenCalled();
    expect(tx.task.updateMany).not.toHaveBeenCalled();
    expect(tx.project.updateMany).not.toHaveBeenCalled();
  });
});

describe("getLenses", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getLenses({}, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it("returns lenses with included and default Lenses first", async () => {
    const m = mockContext(PRO_USER);
    // findMany returns rows in arbitrary order (Prisma orderBy is createdAt
    // only); the op re-sorts in JS to seeded-first. Feed an out-of-order list
    // (CUSTOM first) and assert the output is PERSONAL → CUSTOM.
    m.entities.Lens.findMany.mockResolvedValue([
      {
        id: "l-studio",
        name: "Studio",
        isDefault: false,
        isIncluded: false,
        type: "LIFE_AREA",
        color: "coral",
        purpose: "side",
        _count: { goals: 0, projects: 1, tasks: 4 },
        goals: [],
        projects: [{ id: "p", name: "Studio build" }],
        tasks: [{ id: "t" }],
        listItems: [],
      },
      {
        id: "l-me",
        name: "Me",
        isDefault: true,
        isIncluded: true,
        type: "LIFE_AREA",
        color: "emerald",
        purpose: null,
        _count: { goals: 1, projects: 2, tasks: 3 },
        goals: [{ id: "g" }],
        projects: [{ id: "p", name: "Personal project" }],
        tasks: [{ id: "t" }],
        listItems: [],
      },
    ]);
    const out = await getLenses({}, m.context);
    expect(out.map((l) => l.id)).toEqual(["l-me", "l-studio"]);
    expect(out[0]).toMatchObject({
      id: "l-me",
      isDefault: true,
      isIncluded: true,
    });
    expect(out[1]).toMatchObject({
      id: "l-studio",
      isDefault: false,
      isIncluded: false,
    });
    // Prisma query is scoped by user + ordered by createdAt (the JS sort handles kind).
    expect(m.entities.Lens.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "asc" },
      }),
    );
  });
});
