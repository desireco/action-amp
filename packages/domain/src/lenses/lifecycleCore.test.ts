// @vitest-environment node
/**
 * Lens CRUD core tests — ported from webapp/src/lenses/operations.test.ts
 * (S11). In the webapp these tested the Wasp op layer (real entitlement
 * guards + the module-owned lensDb transaction seam); in the port the DB
 * bodies live in the lifecycle cores and the guards moved to the API
 * wrapper, so this file asserts the cores' validation, tenancy, 409
 * rewrites, and delete modes against mock delegates with an injected fake
 * transaction runner. Guard placement (402 before count/create) is asserted
 * by the API layer's own wiring — the domains' guard functions
 * (`assertLensConfigAllowed`, `assertUnderCap`) are pure and already covered
 * by the billing/projects suites.
 */
import { describe, it, expect, vi } from "vitest";
import { createLensCore, deleteLensCore, updateLensCore } from "./lifecycleCore.js";
import { mockContext } from "../test/mockContext.js";

function asLenses<F>(entities: ReturnType<typeof mockContext>["entities"]): F {
  // SAFETY: EntitySpy vi.fn()s satisfy the delegate slice at runtime.
  return entities as unknown as F;
}

/** A Prisma P2002 (unique constraint violation) shaped error, so the core's
 *  catch block rewrites it into a 409. Mirrors what Prisma actually throws
 *  (postgres surfaces 23505 — isUniqueViolation accepts both). */
function p2002() {
  return { code: "P2002", message: "Unique constraint failed" };
}

/** The tx slice the fake transaction hands the core (vi.fn spies standing in
 *  for the delegates). */
function fakeTx() {
  return {
    goal: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    task: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    project: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    lens: { delete: vi.fn().mockResolvedValue({ id: "l" }) },
  };
}
type FakeTx = ReturnType<typeof fakeTx>;

/** A runner that hands the core the fake tx (the webapp tests swapped the
 *  module-level lensDb; the port passes the runner explicitly). */
const runIn = (tx: FakeTx) => <T>(fn: (t: FakeTx) => Promise<T>) => fn(tx);

describe("createLensCore", () => {
  it("creates an ordinary non-default Lens", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.create.mockResolvedValue({
      id: "l",
      name: "Studio",
      isDefault: false,
      isIncluded: false,
      color: "coral",
      purpose: "side projects",
    });

    const out = await createLensCore(
      asLenses(m.entities),
      { userId: "user-1", name: "Studio", color: "coral", purpose: "side projects" },
    );

    expect(m.entities.Lens.create).toHaveBeenCalledWith({
      data: {
        name: "Studio",
        isDefault: false,
        isIncluded: false,
        color: "coral",
        purpose: "side projects",
        userId: "user-1",
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
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
    const m = mockContext("user-1");
    await expect(
      createLensCore(asLenses(m.entities), {
        userId: "user-1",
        name: "X",
        color: "hotpink",
      }),
    ).rejects.toThrow(/Unknown lens color/);
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
  });

  it("rewrites a P2002 unique violation into a 409", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.create.mockRejectedValue(p2002());

    await expect(
      createLensCore(asLenses(m.entities), {
        userId: "user-1",
        name: "Work",
      }),
    ).rejects.toThrow(/already have a lens named "Work"/);
  });

  it("trims the name and nulls an empty purpose", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.create.mockResolvedValue({
      id: "l",
      name: "Studio",
      isDefault: false,
      isIncluded: false,
      color: null,
      purpose: null,
    });

    await createLensCore(asLenses(m.entities), {
      userId: "user-1",
      name: "  Studio  ",
      purpose: "   ",
    });
    expect(m.entities.Lens.create).toHaveBeenCalledWith({
      data: {
        name: "Studio",
        isDefault: false,
        isIncluded: false,
        color: null,
        purpose: null,
        userId: "user-1",
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        color: true,
        purpose: true,
      },
    });
  });

  it("requires a name (400 string)", async () => {
    const m = mockContext("user-1");
    await expect(
      createLensCore(asLenses(m.entities), {
        userId: "user-1",
        name: "   ",
      }),
    ).rejects.toThrow(/Lens name is required/);
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
  });
});

describe("updateLensCore", () => {
  it("updates name/purpose/color on a tenancy-scoped lens", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      isDefault: false,
    });
    m.entities.Lens.update.mockResolvedValue({
      id: "l",
      name: "Atelier",
      isDefault: false,
      isIncluded: false,
      color: "coral",
      purpose: "x",
    });

    await updateLensCore(asLenses(m.entities), {
      userId: "user-1",
      id: "l",
      name: "Atelier",
      purpose: "x",
      color: "coral",
    });
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith({
      where: { id: "l", userId: "user-1" },
      select: { id: true, name: true, isDefault: true },
    });
    expect(m.entities.Lens.update).toHaveBeenCalledWith({
      where: { id: "l" },
      data: { name: "Atelier", purpose: "x", color: "coral" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        color: true,
        purpose: true,
      },
    });
  });

  it("allows editing a SEEDED lens — rename yes, delete no", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l-work",
      name: "Work",
      isDefault: true,
    });
    m.entities.Lens.update.mockResolvedValue({
      id: "l-work",
      name: "Studio",
      isDefault: true,
      isIncluded: false,
      color: "indigo",
      purpose: null,
    });

    await updateLensCore(asLenses(m.entities), {
      userId: "user-1",
      id: "l-work",
      name: "Studio",
    });
    expect(m.entities.Lens.update).toHaveBeenCalledWith({
      where: { id: "l-work" },
      data: { name: "Studio" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        color: true,
        purpose: true,
      },
    });
  });

  it("404s when the lens is not found (or not the user's)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(null);
    await expect(
      updateLensCore(asLenses(m.entities), {
        userId: "user-1",
        id: "nope",
        name: "x",
      }),
    ).rejects.toThrow(/not found/i);
    expect(m.entities.Lens.update).not.toHaveBeenCalled();
  });

  it("rewrites a rename-collision P2002 into a 409", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Old",
      isDefault: false,
    });
    m.entities.Lens.update.mockRejectedValue(p2002());

    await expect(
      updateLensCore(asLenses(m.entities), {
        userId: "user-1",
        id: "l",
        name: "Work",
      }),
    ).rejects.toThrow(/already have a lens named "Work"/);
  });
});

describe("deleteLensCore", () => {
  it("refuses to delete a seeded lens → 409", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l-work",
      name: "Work",
      isDefault: true,
    });

    await expect(
      deleteLensCore(
        asLenses(m.entities),
        { userId: "user-1", id: "l-work", mode: "delete" },
        runIn(fakeTx()),
      ),
    ).rejects.toThrow(/can't be deleted/);
    expect(m.entities.Lens.delete).not.toHaveBeenCalled();
  });

  it("hard-deletes an EMPTY non-default lens (mode: delete)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      isDefault: false,
    });
    // Empty lens: all counts return 0.
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Lens.delete.mockResolvedValue({ id: "l" });

    const out = await deleteLensCore(
      asLenses(m.entities),
      { userId: "user-1", id: "l", mode: "delete" },
      runIn(fakeTx()),
    );
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
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      isDefault: false,
    });
    m.entities.Goal.count.mockResolvedValue(1);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(3);

    await expect(
      deleteLensCore(
        asLenses(m.entities),
        { userId: "user-1", id: "l", mode: "delete" },
        runIn(fakeTx()),
      ),
    ).rejects.toThrow(/still has content/);
    expect(m.entities.Lens.delete).not.toHaveBeenCalled();
  });

  it("reassigns content to the target lens then deletes (mode: reassign)", async () => {
    const m = mockContext("user-1");
    const tx = fakeTx();
    tx.goal.updateMany.mockResolvedValue({ count: 1 });
    tx.task.updateMany.mockResolvedValue({ count: 2 });
    tx.project.updateMany.mockResolvedValue({ count: 3 });
    tx.lens.delete.mockResolvedValue({ id: "l" });
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", isDefault: false }) // the lens
      .mockResolvedValueOnce({ id: "l-me", name: "Me", isDefault: true }); // tenancy-check target

    const out = await deleteLensCore(
      asLenses(m.entities),
      { userId: "user-1", id: "l", mode: "reassign", targetLensId: "l-me" },
      runIn(tx),
    );

    expect(out).toEqual({ id: "l" });
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
    // makes updateMany throw P2002. The core catches it and 409s with guidance.
    const m = mockContext("user-1");
    const tx = fakeTx();
    tx.goal.updateMany.mockRejectedValue(p2002());
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", isDefault: false })
      .mockResolvedValueOnce({ id: "l-me", name: "Me", isDefault: true });

    await expect(
      deleteLensCore(
        asLenses(m.entities),
        { userId: "user-1", id: "l", mode: "reassign", targetLensId: "l-me" },
        runIn(tx),
      ),
    ).rejects.toThrow(/shares a name with one in the target lens/);
    expect(tx.goal.updateMany).toHaveBeenCalled();
    expect(tx.task.updateMany).not.toHaveBeenCalled();
    expect(tx.project.updateMany).not.toHaveBeenCalled();
    expect(tx.lens.delete).not.toHaveBeenCalled();
  });

  it("reassign refuses the same lens as target (400)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({
      id: "l",
      name: "Studio",
      isDefault: false,
    });

    await expect(
      deleteLensCore(
        asLenses(m.entities),
        { userId: "user-1", id: "l", mode: "reassign", targetLensId: "l" },
        runIn(fakeTx()),
      ),
    ).rejects.toThrow(/different lens/);
  });

  it("reassign 404s when the target lens is not found / not the user's", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", isDefault: false })
      .mockResolvedValueOnce(null); // target missing

    await expect(
      deleteLensCore(
        asLenses(m.entities),
        { userId: "user-1", id: "l", mode: "reassign", targetLensId: "nope" },
        runIn(fakeTx()),
      ),
    ).rejects.toThrow(/Target lens not found/);
    expect(m.entities.Task.updateMany).not.toHaveBeenCalled();
  });
});
