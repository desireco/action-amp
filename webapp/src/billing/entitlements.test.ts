import { describe, it, expect } from "vitest";
import {
  isEntitled,
  capViolation,
  lensViolation,
  resolveLensName,
  WORK_LENS_MESSAGE,
} from "./entitlements";
import { FREE_LIMITS } from "./config";
import { mockContext } from "../test/mockContext";

/**
 * Entitlement guards — the pure decision logic (no `wasp/server`).
 *
 * These test the violation decisions that the server-only `entitlementHttp.ts`
 * turns into thrown HttpErrors. The HTTP behavior (402 status + {feature,reason}
 * body) is covered end-to-end; here we verify the plan/cap/lens math itself.
 *
 * Plan states under test:
 *   FREE         — plan undefined/missing → capped, Me-only.
 *   PRO active   — plan "PRO", planRenewsAt in the future → unlimited.
 *   PRO expired  — plan "PRO", planRenewsAt in the past → treated as FREE.
 *   FOUNDER      — plan "FOUNDER", planRenewsAt null → unlimited (lifetime).
 */

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

const MSG = { feature: "a 4th project", reason: "organize more than 3 projects with Pro" };

describe("isEntitled", () => {
  it("FREE (undefined plan) → false", () => {
    expect(isEntitled(undefined, null)).toBe(false);
    expect(isEntitled("FREE", null)).toBe(false);
  });

  it("active PRO → true", () => {
    expect(isEntitled("PRO", FUTURE)).toBe(true);
  });

  it("expired PRO → false (treated as FREE)", () => {
    expect(isEntitled("PRO", PAST)).toBe(false);
  });

  it("FOUNDER → always true, even with null renewal (lifetime)", () => {
    expect(isEntitled("FOUNDER", null)).toBe(true);
    expect(isEntitled("FOUNDER", PAST)).toBe(true); // never expires
  });
});

describe("capViolation", () => {
  it("FREE at the cap returns the message", () => {
    expect(
      capViolation({ plan: "FREE", planRenewsAt: null }, FREE_LIMITS.projects, FREE_LIMITS.projects, MSG),
    ).toEqual(MSG);
  });

  it("FREE under the cap returns null (count 2, cap 3)", () => {
    expect(
      capViolation({ plan: "FREE", planRenewsAt: null }, 2, FREE_LIMITS.projects, MSG),
    ).toBeNull();
  });

  it("active PRO is unlimited — null even over the cap", () => {
    expect(
      capViolation({ plan: "PRO", planRenewsAt: FUTURE }, 999, FREE_LIMITS.projects, MSG),
    ).toBeNull();
  });

  it("expired PRO is treated as FREE — returns the message at the cap", () => {
    expect(
      capViolation({ plan: "PRO", planRenewsAt: PAST }, FREE_LIMITS.goals, FREE_LIMITS.goals, MSG),
    ).toEqual(MSG);
  });

  it("FOUNDER is unlimited — null even over the cap", () => {
    expect(
      capViolation({ plan: "FOUNDER", planRenewsAt: null }, 999, FREE_LIMITS.goals, MSG),
    ).toBeNull();
  });
});

describe("lensViolation", () => {
  it("FREE + Work lens → returns the Work-lens message", () => {
    expect(lensViolation({ plan: "FREE", planRenewsAt: null }, "Work")).toEqual(WORK_LENS_MESSAGE);
  });

  it("FREE + Me lens → null", () => {
    expect(lensViolation({ plan: "FREE", planRenewsAt: null }, "Me")).toBeNull();
  });

  it("active PRO + Work lens → null (all lenses)", () => {
    expect(lensViolation({ plan: "PRO", planRenewsAt: FUTURE }, "Work")).toBeNull();
  });

  it("expired PRO + Work lens → message (treated as FREE)", () => {
    expect(lensViolation({ plan: "PRO", planRenewsAt: PAST }, "Work")).toEqual(WORK_LENS_MESSAGE);
  });

  it("accepts a custom message override", () => {
    expect(
      lensViolation({ plan: "FREE", planRenewsAt: null }, "Work", MSG),
    ).toEqual(MSG);
  });
});

describe("resolveLensName", () => {
  it("returns the lens name from a tenancy-safe lookup", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({ name: "Work" });
    const name = await resolveLensName(m.entities, "user-1", "lens-1");
    expect(name).toBe("Work");
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith({
      where: { id: "lens-1", userId: "user-1" },
      select: { name: true },
    });
  });

  it("returns null for a missing lensId", async () => {
    const m = mockContext("user-1");
    const name = await resolveLensName(m.entities, "user-1", null);
    expect(name).toBeNull();
    expect(m.entities.Lens.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for an unknown lens (no row)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(null);
    const name = await resolveLensName(m.entities, "user-1", "nope");
    expect(name).toBeNull();
  });
});
