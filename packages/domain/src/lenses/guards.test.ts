// @vitest-environment node
// S7/S11 — the lens-config guards: the whole surface is Pro-only, and the
// Pro soft cap binds whoever passes that gate (see assertLensesUnderCap's
// doc for why it differs from the FREE caps' capViolation).
import { describe, it, expect } from "vitest";
import { assertLensConfigAllowed, assertLensesUnderCap } from "./guards.js";
import { PRO_LIMITS } from "../billing/config.js";

const FUTURE = new Date(Date.now() + 60_000);
const FREE_USER = { id: "u1", plan: "FREE" };
const PRO_USER = { id: "u2", plan: "PRO", planRenewsAt: FUTURE };

describe("assertLensConfigAllowed", () => {
  it("402s a FREE user with the Custom lenses message", () => {
    expect(() => assertLensConfigAllowed(FREE_USER)).toThrowError(
      /Custom lenses is a Pro feature\./,
    );
  });

  it("admits an active PRO user", () => {
    expect(() => assertLensConfigAllowed(PRO_USER)).not.toThrow();
  });
});

describe("assertLensesUnderCap", () => {
  it("402s at the cap with the exact 'a 9th lens' payload", () => {
    try {
      assertLensesUnderCap(PRO_LIMITS.lenses, PRO_LIMITS.lenses, {
        feature: `a ${PRO_LIMITS.lenses + 1}th lens`,
        reason: "more life contexts unlock with Pro",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(402);
      expect((e as { data?: Record<string, string> }).data).toEqual({
        feature: "a 9th lens",
        reason: "more life contexts unlock with Pro",
      });
    }
  });

  it("admits below the cap (and PRO is NOT unlimited here — the soft cap binds)", () => {
    expect(() =>
      assertLensesUnderCap(PRO_LIMITS.lenses - 1, PRO_LIMITS.lenses, {
        feature: "a 9th lens",
        reason: "more life contexts unlock with Pro",
      }),
    ).not.toThrow();
  });
});
