// @vitest-environment node
// The Free-plan lens scope (2026-09-26): FREE reads the two SEEDED lenses —
// identified by the seed flags isIncluded (Me) / isDefault (Work), never by
// name — and no customs. Configuration stays Pro-only (guards.test.ts covers
// that gate); this file covers the read decisions.
import { describe, it, expect, vi } from "vitest";
import {
  lensViolation,
  resolveLens,
  resolveAccessibleLenses,
  WORK_LENS_MESSAGE,
} from "./entitlements.js";

const FUTURE = new Date(Date.now() + 60_000);
const FREE_USER = { plan: "FREE" };
const PRO_USER = { plan: "PRO", planRenewsAt: FUTURE };

/** The seeded pair as the rows carry them: Me is the included primary,
 *  Work is a default without isIncluded. A custom lens carries neither. */
const ME = { name: "Me", isIncluded: true, isDefault: true };
const WORK = { name: "Work", isIncluded: false, isDefault: true };
const CUSTOM = { name: "Studio", isIncluded: false, isDefault: false };

describe("lensViolation", () => {
  it("admits a FREE user reading either seeded lens", () => {
    expect(lensViolation(FREE_USER, ME)).toBeNull();
    expect(lensViolation(FREE_USER, WORK)).toBeNull();
  });

  it("402-message-returns a FREE user reading a custom lens", () => {
    expect(lensViolation(FREE_USER, CUSTOM)).toEqual(WORK_LENS_MESSAGE);
  });

  it("admits paid users on any lens, and a missing lens row", () => {
    expect(lensViolation(PRO_USER, CUSTOM)).toBeNull();
    expect(lensViolation(FREE_USER, null)).toBeNull();
  });
});

describe("resolveLens", () => {
  it("selects the seed flags (rename-safe handles), tenancy-scoped", async () => {
    const findFirst = vi.fn().mockResolvedValue(WORK);
    const lens = await resolveLens({ Lens: { findFirst } }, "u1", "l1");
    expect(lens).toEqual(WORK);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "l1", userId: "u1" },
      select: { name: true, isIncluded: true, isDefault: true },
    });
  });

  it("returns null for a missing lensId without querying", async () => {
    const findFirst = vi.fn();
    expect(await resolveLens({ Lens: { findFirst } }, "u1", null)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveAccessibleLenses", () => {
  it("filters a FREE user to the seeded pair via the flags", async () => {
    const findMany = vi.fn().mockResolvedValue([ME, WORK]);
    const rows = await resolveAccessibleLenses({ Lens: { findMany } }, FREE_USER, "u1");
    expect(rows).toHaveLength(2);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      userId: "u1",
      OR: [{ isIncluded: true }, { isDefault: true }],
    });
    expect(arg.select).toEqual({
      id: true,
      name: true,
      color: true,
      isIncluded: true,
      isDefault: true,
    });
  });

  it("gives paid users every lens", async () => {
    const findMany = vi.fn().mockResolvedValue([ME, WORK, CUSTOM]);
    const rows = await resolveAccessibleLenses({ Lens: { findMany } }, PRO_USER, "u1");
    expect(rows).toHaveLength(3);
    expect(findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });
  });
});
