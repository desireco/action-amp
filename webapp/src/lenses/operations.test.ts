// @vitest-environment node
// Lens CRUD op tests. Mirrors entitlements.ops.test.ts: the server-only
// entitlement guards are stubbed so the test never touches `wasp/server`
// statically. The op itself uses the ponytail string-concat for its HttpError
// import (`await import("wasp/" + "server")`), so detectServerImports doesn't
// flag the op file; at runtime under node it resolves to the real SDK module.
// The pure guard logic is unit-tested in entitlements.test.ts; here we assert
// the ops wire the guards correctly and enforce tenancy + kind + unique.
import { describe, it, expect, vi } from "vitest";

const assertLensConfigAllowed = vi.fn();
const assertUnderCap = vi.fn().mockResolvedValue(undefined);
// throwHttpStatus is the real throw — stub it to throw a plain Error carrying
// the message, so rejects.toThrow(/message/) matches. The real HttpError lives
// in wasp/server (untestable here); the message contract is what we assert on.
const throwHttpStatus = vi.fn((statusCode: number, message: string) => {
  throw new Error(message);
});
vi.mock("../billing/entitlementHttp", () => ({
  assertLensConfigAllowed,
  assertUnderCap,
  throwHttpStatus,
}));

// Import AFTER the mock so the ops pick up the stubbed guards.
const { createLens, updateLens, deleteLens, getLenses } = await import("./operations");
import { mockContext, type MockUser } from "../test/mockContext";
import { PRO_LIMITS } from "../billing/config";

const FUTURE = new Date(Date.now() + 86_400_000);
const PRO_USER: MockUser = { id: "user-1", plan: "PRO", planRenewsAt: FUTURE };

function resetSpies() {
  assertLensConfigAllowed.mockReset();
  assertUnderCap.mockReset();
  assertUnderCap.mockResolvedValue(undefined);
}

/** A Prisma P2002 (unique constraint violation) shaped error, so the op's
 * catch block rewrites it into a 409. Mirrors what Prisma actually throws. */
function p2002() {
  return { code: "P2002", message: "Unique constraint failed" };
}

describe("createLens", () => {
  it("calls assertLensConfigAllowed + assertUnderCap with the lens cap, then creates with kind CUSTOM", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.count.mockResolvedValue(2);
    m.entities.Lens.create.mockResolvedValue({ id: "l", name: "Studio", kind: "CUSTOM", color: "coral", purpose: "side projects" });

    const out = await createLens({ name: "Studio", color: "coral", purpose: "side projects" }, m.context);

    expect(assertLensConfigAllowed).toHaveBeenCalledWith(m.context);
    expect(assertUnderCap).toHaveBeenCalledWith(
      m.context,
      "",
      2,
      PRO_LIMITS.lenses,
      { feature: `a ${PRO_LIMITS.lenses + 1}th lens`, reason: "more life contexts unlock with Pro" },
    );
    expect(m.entities.Lens.create).toHaveBeenCalledWith({
      data: { name: "Studio", kind: "CUSTOM", color: "coral", purpose: "side projects", userId: "user-1" },
      select: { id: true, name: true, kind: true, color: true, purpose: true },
    });
    expect(out).toEqual({ id: "l", name: "Studio", kind: "CUSTOM", color: "coral", purpose: "side projects" });
  });

  it("rejects an unknown color key (400)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    await expect(createLens({ name: "X", color: "hotpink" }, m.context)).rejects.toThrow(/Unknown lens color/);
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
  });

  it("rewrites a P2002 unique violation into a 409", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.count.mockResolvedValue(0);
    m.entities.Lens.create.mockRejectedValue(p2002());

    await expect(createLens({ name: "Work" }, m.context)).rejects.toThrow(/already have a lens named "Work"/);
  });

  it("trims the name and nulls an empty purpose", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.count.mockResolvedValue(0);
    m.entities.Lens.create.mockResolvedValue({ id: "l", name: "Studio", kind: "CUSTOM", color: null, purpose: null });

    await createLens({ name: "  Studio  ", purpose: "   " }, m.context);
    expect(m.entities.Lens.create).toHaveBeenCalledWith({
      data: { name: "Studio", kind: "CUSTOM", color: null, purpose: null, userId: "user-1" },
      select: { id: true, name: true, kind: true, color: true, purpose: true },
    });
  });
});

describe("updateLens", () => {
  it("updates name/purpose/color on a tenancy-scoped lens", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({ id: "l", name: "Studio", kind: "CUSTOM" });
    m.entities.Lens.update.mockResolvedValue({ id: "l", name: "Atelier", kind: "CUSTOM", color: "coral", purpose: "x" });

    await updateLens({ id: "l", name: "Atelier", purpose: "x", color: "coral" }, m.context);
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith({ where: { id: "l", userId: "user-1" }, select: { id: true, name: true, kind: true } });
    expect(m.entities.Lens.update).toHaveBeenCalledWith({
      where: { id: "l" },
      data: { name: "Atelier", purpose: "x", color: "coral" },
      select: { id: true, name: true, kind: true, color: true, purpose: true },
    });
  });

  it("allows editing a SEEDED lens (kind WORK) — rename yes, delete no", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({ id: "l-work", name: "Work", kind: "WORK" });
    m.entities.Lens.update.mockResolvedValue({ id: "l-work", name: "Studio", kind: "WORK", color: "indigo", purpose: null });

    await updateLens({ id: "l-work", name: "Studio" }, m.context);
    expect(m.entities.Lens.update).toHaveBeenCalledWith({
      where: { id: "l-work" },
      data: { name: "Studio" },
      select: { id: true, name: true, kind: true, color: true, purpose: true },
    });
  });

  it("404s when the lens is not found (or not the user's)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue(null);
    await expect(updateLens({ id: "nope", name: "x" }, m.context)).rejects.toThrow(/not found/i);
    expect(m.entities.Lens.update).not.toHaveBeenCalled();
  });

  it("rewrites a rename-collision P2002 into a 409", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({ id: "l", name: "Old", kind: "CUSTOM" });
    m.entities.Lens.update.mockRejectedValue(p2002());

    await expect(updateLens({ id: "l", name: "Work" }, m.context)).rejects.toThrow(/already have a lens named "Work"/);
  });
});

describe("deleteLens", () => {
  it("refuses to delete a seeded lens (kind !== CUSTOM) → 409", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({ id: "l-work", name: "Work", kind: "WORK" });

    await expect(deleteLens({ id: "l-work", mode: "delete" }, m.context)).rejects.toThrow(/can't be deleted/);
    expect(m.entities.Lens.delete).not.toHaveBeenCalled();
  });

  it("hard-deletes an EMPTY CUSTOM lens (mode: delete)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({ id: "l", name: "Studio", kind: "CUSTOM" });
    // Empty lens: all counts return 0.
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Lens.delete.mockResolvedValue({ id: "l" });

    const out = await deleteLens({ id: "l", mode: "delete" }, m.context);
    expect(out).toEqual({ id: "l" });
    expect(m.entities.Task.updateMany).not.toHaveBeenCalled(); // no reassign
    expect(m.entities.Lens.delete).toHaveBeenCalledWith({ where: { id: "l" }, select: { id: true } });
  });

  it("refuses hard-delete when the lens has content → 409 (no silent cascade)", async () => {
    // Spec: "No silent cascade delete." A lens with content must be reassigned,
    // not hard-deleted. The server enforces it even if the client bypasses the
    // dialog's "move first" default.
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({ id: "l", name: "Studio", kind: "CUSTOM" });
    m.entities.Goal.count.mockResolvedValue(1);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(3);

    await expect(deleteLens({ id: "l", mode: "delete" }, m.context)).rejects.toThrow(/still has content/);
    expect(m.entities.Lens.delete).not.toHaveBeenCalled();
  });

  it("reassigns content to the target lens then deletes (mode: reassign)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", kind: "CUSTOM" }) // the lens
      .mockResolvedValueOnce({ id: "l-me", name: "Me", kind: "PERSONAL" }); // tenancy-check target
    m.entities.Lens.delete.mockResolvedValue({ id: "l" });

    await deleteLens({ id: "l", mode: "reassign", targetLensId: "l-me" }, m.context);

    // All three entity types moved to the target (Goal first — it's the only one
    // that can collide on the global name unique), then the lens deleted.
    expect(m.entities.Goal.updateMany).toHaveBeenCalledWith({ where: { lensId: "l" }, data: { lensId: "l-me" } });
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({ where: { lensId: "l" }, data: { lensId: "l-me" } });
    expect(m.entities.Project.updateMany).toHaveBeenCalledWith({ where: { lensId: "l" }, data: { lensId: "l-me" } });
    expect(m.entities.Lens.delete).toHaveBeenCalledWith({ where: { id: "l" }, select: { id: true } });
  });

  it("reassign Goal collision (same name in target) → 409, nothing moved", async () => {
    // Goal has @@unique([userId, name]) — a same-named goal in the target lens
    // makes updateMany throw P2002. The op catches it, 409s with guidance, and
    // (because Goal moves first) Task/Project haven't moved and the lens stands.
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", kind: "CUSTOM" })
      .mockResolvedValueOnce({ id: "l-me", name: "Me", kind: "PERSONAL" });
    m.entities.Goal.updateMany.mockRejectedValue(p2002());

    await expect(deleteLens({ id: "l", mode: "reassign", targetLensId: "l-me" }, m.context))
      .rejects.toThrow(/shares a name with one in the target lens/);
    // Goal moved (and collided) but Task/Project/lens-delete never fired.
    expect(m.entities.Goal.updateMany).toHaveBeenCalled();
    expect(m.entities.Task.updateMany).not.toHaveBeenCalled();
    expect(m.entities.Project.updateMany).not.toHaveBeenCalled();
    expect(m.entities.Lens.delete).not.toHaveBeenCalled();
  });

  it("reassign refuses the same lens as target (400)", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst.mockResolvedValue({ id: "l", name: "Studio", kind: "CUSTOM" });

    await expect(deleteLens({ id: "l", mode: "reassign", targetLensId: "l" }, m.context)).rejects.toThrow(/different lens/);
  });

  it("reassign 404s when the target lens is not found / not the user's", async () => {
    resetSpies();
    const m = mockContext(PRO_USER);
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "l", name: "Studio", kind: "CUSTOM" })
      .mockResolvedValueOnce(null); // target missing

    await expect(deleteLens({ id: "l", mode: "reassign", targetLensId: "nope" }, m.context)).rejects.toThrow(/Target lens not found/);
    expect(m.entities.Task.updateMany).not.toHaveBeenCalled();
  });
});

describe("getLenses", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getLenses({}, m.context)).rejects.toThrow(/Not authenticated/);
  });

  it("returns lenses with per-lens counts, seeded-first sorted (PERSONAL, WORK, then CUSTOM)", async () => {
    const m = mockContext(PRO_USER);
    // findMany returns rows in arbitrary order (Prisma orderBy is createdAt
    // only); the op re-sorts in JS to seeded-first. Feed an out-of-order list
    // (CUSTOM first) and assert the output is PERSONAL → CUSTOM.
    m.entities.Lens.findMany.mockResolvedValue([
      {
        id: "l-studio", name: "Studio", kind: "CUSTOM", color: "coral", purpose: "side",
        _count: { goals: 0, projects: 1, tasks: 4 },
      },
      {
        id: "l-me", name: "Me", kind: "PERSONAL", color: "emerald", purpose: null,
        _count: { goals: 1, projects: 2, tasks: 3 },
      },
    ]);
    const out = await getLenses({}, m.context);
    // Seeded-first: PERSONAL before CUSTOM, despite the input order.
    expect(out.map((l) => l.kind)).toEqual(["PERSONAL", "CUSTOM"]);
    expect(out[0]).toEqual({ id: "l-me", name: "Me", kind: "PERSONAL", color: "emerald", purpose: null, counts: { goals: 1, projects: 2, tasks: 3 } });
    expect(out[1]).toEqual({ id: "l-studio", name: "Studio", kind: "CUSTOM", color: "coral", purpose: "side", counts: { goals: 0, projects: 1, tasks: 4 } });
    // Prisma query is scoped by user + ordered by createdAt (the JS sort handles kind).
    expect(m.entities.Lens.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
    }));
  });
});
