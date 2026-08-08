import { describe, it, expect } from "vitest";
import {
  isEntitled,
  capViolation,
  lensViolation,
  lensConfigViolation,
  cliAccessViolation,
  sitewideSearchViolation,
  CLI_ACCESS_MESSAGE,
  SITEWIDE_SEARCH_MESSAGE,
  resolveLens,
  WORK_LENS_MESSAGE,
  CUSTOM_LENSES_MESSAGE,
} from "./entitlements";
import { FREE_LIMITS, PRO_LIMITS } from "./config";
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
 *
 * Lens decisions key on LensKind (NOT name) — the rename-safety fix. A renamed
 * Work lens (kind=WORK, name="Studio") still gates FREE; only PERSONAL is free.
 */

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

const MSG = {
  feature: "a 4th project",
  reason: "organize more than 3 projects with Pro",
};

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

  it("admin bypass → true regardless of plan (FREE admin is fully entitled)", () => {
    expect(isEntitled("FREE", null, true)).toBe(true);
    expect(isEntitled(undefined, null, true)).toBe(true);
    expect(isEntitled("PRO", PAST, true)).toBe(true); // expired PRO, but admin
  });

  it("admin flag false/absent → falls through to the plan check", () => {
    expect(isEntitled("FREE", null, false)).toBe(false);
    expect(isEntitled("FREE", null, undefined)).toBe(false);
    expect(isEntitled("PRO", FUTURE, false)).toBe(true);
  });
});

describe("cliAccessViolation", () => {
  it("allows active Pro, Founding, and admins", () => {
    expect(
      cliAccessViolation({ plan: "PRO", planRenewsAt: FUTURE }),
    ).toBeNull();
    expect(
      cliAccessViolation({ plan: "FOUNDER", planRenewsAt: null }),
    ).toBeNull();
    expect(
      cliAccessViolation({ plan: "FREE", planRenewsAt: null, isAdmin: true }),
    ).toBeNull();
  });

  it("blocks Free and expired Pro accounts across the entire CLI/API surface", () => {
    expect(cliAccessViolation({ plan: "FREE", planRenewsAt: null })).toEqual(
      CLI_ACCESS_MESSAGE,
    );
    expect(cliAccessViolation({ plan: "PRO", planRenewsAt: PAST })).toEqual(
      CLI_ACCESS_MESSAGE,
    );
  });
});

describe("sitewideSearchViolation", () => {
  it("allows active Pro, Founding, and admins", () => {
    expect(
      sitewideSearchViolation({ plan: "PRO", planRenewsAt: FUTURE }),
    ).toBeNull();
    expect(
      sitewideSearchViolation({ plan: "FOUNDER", planRenewsAt: null }),
    ).toBeNull();
    expect(
      sitewideSearchViolation({
        plan: "FREE",
        planRenewsAt: null,
        isAdmin: true,
      }),
    ).toBeNull();
  });

  it("blocks Free and expired Pro accounts", () => {
    expect(
      sitewideSearchViolation({ plan: "FREE", planRenewsAt: null }),
    ).toEqual(SITEWIDE_SEARCH_MESSAGE);
    expect(
      sitewideSearchViolation({ plan: "PRO", planRenewsAt: PAST }),
    ).toEqual(SITEWIDE_SEARCH_MESSAGE);
  });
});

describe("capViolation", () => {
  it("FREE at the cap returns the message", () => {
    expect(
      capViolation(
        { plan: "FREE", planRenewsAt: null },
        FREE_LIMITS.projects,
        FREE_LIMITS.projects,
        MSG,
      ),
    ).toEqual(MSG);
  });

  it("FREE under the cap returns null (count 2, cap 3)", () => {
    expect(
      capViolation(
        { plan: "FREE", planRenewsAt: null },
        2,
        FREE_LIMITS.projects,
        MSG,
      ),
    ).toBeNull();
  });

  it("active PRO is unlimited — null even over the cap", () => {
    expect(
      capViolation(
        { plan: "PRO", planRenewsAt: FUTURE },
        999,
        FREE_LIMITS.projects,
        MSG,
      ),
    ).toBeNull();
  });

  it("expired PRO is treated as FREE — returns the message at the cap", () => {
    expect(
      capViolation(
        { plan: "PRO", planRenewsAt: PAST },
        FREE_LIMITS.goals,
        FREE_LIMITS.goals,
        MSG,
      ),
    ).toEqual(MSG);
  });

  it("FOUNDER is unlimited — null even over the cap", () => {
    expect(
      capViolation(
        { plan: "FOUNDER", planRenewsAt: null },
        999,
        FREE_LIMITS.goals,
        MSG,
      ),
    ).toBeNull();
  });

  it("admin bypass — null even over the cap (FREE plan, but isAdmin)", () => {
    expect(
      capViolation(
        { plan: "FREE", planRenewsAt: null, isAdmin: true },
        999,
        FREE_LIMITS.projects,
        MSG,
      ),
    ).toBeNull();
  });
});

describe("lensViolation", () => {
  it("FREE + WORK lens → returns the Work-lens message", () => {
    expect(
      lensViolation(
        { plan: "FREE", planRenewsAt: null },
        { name: "Work", kind: "WORK" },
      ),
    ).toEqual(WORK_LENS_MESSAGE);
  });

  it("FREE + PERSONAL lens → null", () => {
    expect(
      lensViolation(
        { plan: "FREE", planRenewsAt: null },
        { name: "Me", kind: "PERSONAL" },
      ),
    ).toBeNull();
  });

  it("FREE + CUSTOM lens → message (custom lenses are Pro-only)", () => {
    expect(
      lensViolation(
        { plan: "FREE", planRenewsAt: null },
        { name: "Studio", kind: "CUSTOM" },
      ),
    ).toEqual(WORK_LENS_MESSAGE);
  });

  it("active PRO + WORK lens → null (all lenses)", () => {
    expect(
      lensViolation(
        { plan: "PRO", planRenewsAt: FUTURE },
        { name: "Work", kind: "WORK" },
      ),
    ).toBeNull();
  });

  it("admin bypass + WORK lens → null (FREE plan, but isAdmin)", () => {
    expect(
      lensViolation(
        { plan: "FREE", planRenewsAt: null, isAdmin: true },
        { name: "Work", kind: "WORK" },
      ),
    ).toBeNull();
    expect(
      lensViolation(
        { plan: "FREE", planRenewsAt: null, isAdmin: true },
        { name: "Studio", kind: "CUSTOM" },
      ),
    ).toBeNull();
  });

  it("expired PRO + WORK lens → message (treated as FREE)", () => {
    expect(
      lensViolation(
        { plan: "PRO", planRenewsAt: PAST },
        { name: "Work", kind: "WORK" },
      ),
    ).toEqual(WORK_LENS_MESSAGE);
  });

  // The load-bearing rename-safety test. The seeded "Work" lens is renameable
  // on Pro; the kind (WORK) is the stable handle that must keep gating FREE
  // even when the name is no longer "Work". This is the whole point of the
  // LensKind enum — without it, a rename breaks FREE gating.
  it("rename-safe: FREE + WORK lens renamed to 'Studio' → still gated", () => {
    expect(
      lensViolation(
        { plan: "FREE", planRenewsAt: null },
        { name: "Studio", kind: "WORK" },
      ),
    ).toEqual(WORK_LENS_MESSAGE);
  });

  it("rename-safe: FREE + PERSONAL lens renamed to 'Life' → still allowed", () => {
    expect(
      lensViolation(
        { plan: "FREE", planRenewsAt: null },
        { name: "Life", kind: "PERSONAL" },
      ),
    ).toBeNull();
  });

  it("accepts a custom message override", () => {
    expect(
      lensViolation(
        { plan: "FREE", planRenewsAt: null },
        { name: "Work", kind: "WORK" },
        MSG,
      ),
    ).toEqual(MSG);
  });

  it("null lens → null (defensive: missing lens is not a violation)", () => {
    expect(
      lensViolation({ plan: "FREE", planRenewsAt: null }, null),
    ).toBeNull();
  });
});

describe("lensConfigViolation", () => {
  it("FREE → custom-lenses message (configuration is Pro-only)", () => {
    expect(lensConfigViolation({ plan: "FREE", planRenewsAt: null })).toEqual(
      CUSTOM_LENSES_MESSAGE,
    );
  });

  it("FREE (no user) → message", () => {
    expect(lensConfigViolation(null)).toEqual(CUSTOM_LENSES_MESSAGE);
  });

  it("active PRO → null (may configure)", () => {
    expect(
      lensConfigViolation({ plan: "PRO", planRenewsAt: FUTURE }),
    ).toBeNull();
  });

  it("expired PRO → message (treated as FREE)", () => {
    expect(lensConfigViolation({ plan: "PRO", planRenewsAt: PAST })).toEqual(
      CUSTOM_LENSES_MESSAGE,
    );
  });

  it("FOUNDER → null (lifetime Pro)", () => {
    expect(
      lensConfigViolation({ plan: "FOUNDER", planRenewsAt: null }),
    ).toBeNull();
  });

  it("accepts a custom message override", () => {
    expect(
      lensConfigViolation({ plan: "FREE", planRenewsAt: null }, MSG),
    ).toEqual(MSG);
  });
});

describe("PRO_LIMITS", () => {
  it("exposes the lens soft cap for assertUnderCap", () => {
    expect(PRO_LIMITS.lenses).toBe(8);
  });
});

describe("resolveLens", () => {
  it("returns {name, kind} from a tenancy-safe lookup", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue({ name: "Work", kind: "WORK" });
    const lens = await resolveLens(m.entities, "user-1", "lens-1");
    expect(lens).toEqual({ name: "Work", kind: "WORK" });
    expect(m.entities.Lens.findFirst).toHaveBeenCalledWith({
      where: { id: "lens-1", userId: "user-1" },
      select: { name: true, kind: true },
    });
  });

  it("returns null for a missing lensId", async () => {
    const m = mockContext("user-1");
    const lens = await resolveLens(m.entities, "user-1", null);
    expect(lens).toBeNull();
    expect(m.entities.Lens.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for an unknown lens (no row)", async () => {
    const m = mockContext("user-1");
    m.entities.Lens.findFirst.mockResolvedValue(null);
    const lens = await resolveLens(m.entities, "user-1", "nope");
    expect(lens).toBeNull();
  });
});
