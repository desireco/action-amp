import { describe, it, expect } from "vitest";
import { activePoolWhere } from "./activePool.js";

/**
 * activePoolWhere — the single shared predicate for the actionable pool.
 *
 * This is the lock that keeps Next's top task, the Today nav badge, and the
 * per-lens pill in sync. If any of those three surfaces filters differently,
 * the count drift the app saw ("task shows on Next, badge says 0") comes back.
 * So this test pins the exact where-clause shape.
 */

const NOW = new Date("2026-07-09T12:00:00Z");
const TODAY = new Date("2026-07-09T00:00:00Z");

describe("activePoolWhere — what's IN the pool (actionable)", () => {
  it("defines the active status and completion guards", () => {
    expect(activePoolWhere({ userId: "u1", now: NOW })).toMatchObject({
      userId: "u1",
      status: { in: ["TODAY", "UPCOMING"] },
      isDone: false,
    });
  });

  it("admits an unscheduled and unsnoozed bench task", () => {
    const w = activePoolWhere({ userId: "u1", now: NOW });
    expect(w.AND).toEqual([
      {
        OR: [
          { scheduledDate: null },
          { scheduledDate: { lte: TODAY } },
        ],
      },
      {
        OR: [
          { snoozedUntil: null },
          { snoozedUntil: { lte: NOW } },
        ],
      },
    ]);
  });

  it("uses an exact instant for snooze availability", () => {
    const w = activePoolWhere({ userId: "u1", now: NOW });
    expect(w.AND).toContainEqual({
      OR: [
        { snoozedUntil: null },
        { snoozedUntil: { lte: NOW } },
      ],
    });
  });

  it("resolves a schedule against the user's calendar date", () => {
    const instant = new Date("2026-07-09T00:30:00Z");
    const losAngeles = activePoolWhere({
      userId: "u1",
      now: instant,
      timeZone: "America/Los_Angeles",
    });
    expect(losAngeles.AND).toContainEqual({
      OR: [
        { scheduledDate: null },
        { scheduledDate: { lte: new Date("2026-07-08T00:00:00.000Z") } },
      ],
    });
  });
});

describe("activePoolWhere — what's OUT of the pool (not actionable)", () => {
  // These are enforced by the shape of the predicate, not by enumerating
  // exclusions — status is { in: [TODAY, UPCOMING] } so SOMEDAY can't match;
  // isDone: false so completed tasks can't match; the OR clause requires null
  // or past scheduledDate so a future (snoozed) scheduledDate can't match. We assert each
  // constraint is present so a future edit can't silently widen the pool.

  it("excludes SOMEDAY (status set is exactly TODAY + UPCOMING)", () => {
    expect(activePoolWhere({ userId: "u1", now: NOW }).status).toEqual({
      in: ["TODAY", "UPCOMING"],
    });
  });

  it("excludes done tasks (isDone: false)", () => {
    expect(activePoolWhere({ userId: "u1", now: NOW }).isDone).toBe(false);
  });

  it("requires both the calendar schedule and exact snooze guards", () => {
    expect(activePoolWhere({ userId: "u1", now: NOW }).AND).toHaveLength(2);
  });
});

describe("activePoolWhere — lens scoping", () => {
  it("adds lensId when provided (Next + Today badge are lens-scoped)", () => {
    expect(activePoolWhere({ userId: "u1", lensId: "lens-work", now: NOW }))
      .toMatchObject({ lensId: "lens-work" });
  });

  it("omits lensId when not provided (per-lens pill groupBy groups BY lensId)", () => {
    const w = activePoolWhere({ userId: "u1", now: NOW });
    expect(w).not.toHaveProperty("lensId");
  });
});

describe("activePoolWhere — count coherence", () => {
  it("uses the same schedule guard for UPCOMING counts and Next", () => {
    const w = activePoolWhere({ userId: "u1", lensId: "lens-work", now: NOW });
    expect(w.status).toEqual({ in: ["TODAY", "UPCOMING"] });
    expect(w.AND).toContainEqual({
      OR: [
        { scheduledDate: null },
        { scheduledDate: { lte: TODAY } },
      ],
    });
    expect(w.lensId).toBe("lens-work");
  });

  it("would still count a TODAY task after the overnight rollover flips it to UPCOMING", () => {
    // Post-rollover the task is UPCOMING (startedAt preserved). The pool admits
    // UPCOMING, so the badge/pill stay nonzero — the rollover becomes invisible
    // to counts. Only the Today PAGE (status === TODAY) resets.
    const w = activePoolWhere({ userId: "u1", now: NOW });
    expect(w.status).toEqual({ in: ["TODAY", "UPCOMING"] });
  });
});
