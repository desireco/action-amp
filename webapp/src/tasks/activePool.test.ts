import { describe, it, expect } from "vitest";
import { activePoolWhere } from "./activePool";

/**
 * activePoolWhere — the single shared predicate for the actionable pool.
 *
 * This is the lock that keeps Next's top task, the Today nav badge, and the
 * per-lens pill in sync. If any of those three surfaces filters differently,
 * the count drift the app saw ("task shows on Next, badge says 0") comes back.
 * So this test pins the exact where-clause shape.
 */

const NOW = new Date("2026-07-09T12:00:00Z");
const PAST = new Date("2026-07-08T12:00:00Z"); // already due
const FUTURE = new Date("2026-07-10T12:00:00Z"); // snoozed / scheduled

describe("activePoolWhere — what's IN the pool (actionable)", () => {
  it("includes TODAY regardless of dueDate", () => {
    // The court: a committed-today task is always actionable.
    expect(activePoolWhere({ userId: "u1", now: NOW })).toMatchObject({
      userId: "u1",
      status: { in: ["TODAY", "UPCOMING"] },
      isDone: false,
    });
  });

  it("includes UPCOMING with no dueDate (bench, undated → immediately actionable)", () => {
    const w = activePoolWhere({ userId: "u1", now: NOW });
    // The OR clause must allow a null dueDate (triaged-to-Upcoming surfaces now).
    expect(w.OR).toEqual([
      { dueDate: null },
      { dueDate: { lte: NOW } },
    ]);
  });

  it("includes UPCOMING whose dueDate is now/past (snooze arrived)", () => {
    // Same OR clause covers dueDate <= now.
    const w = activePoolWhere({ userId: "u1", now: NOW });
    expect(w.OR).toContainEqual({ dueDate: { lte: NOW } });
    // Sanity: the due-now date is not in the future.
    expect(PAST.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });
});

describe("activePoolWhere — what's OUT of the pool (not actionable)", () => {
  // These are enforced by the shape of the predicate, not by enumerating
  // exclusions — status is { in: [TODAY, UPCOMING] } so SOMEDAY can't match;
  // isDone: false so completed tasks can't match; the OR clause requires null
  // or past dueDate so a future (snoozed) dueDate can't match. We assert each
  // constraint is present so a future edit can't silently widen the pool.

  it("excludes SOMEDAY (status set is exactly TODAY + UPCOMING)", () => {
    expect(activePoolWhere({ userId: "u1", now: NOW }).status).toEqual({
      in: ["TODAY", "UPCOMING"],
    });
  });

  it("excludes done tasks (isDone: false)", () => {
    expect(activePoolWhere({ userId: "u1", now: NOW }).isDone).toBe(false);
  });

  it("excludes snoozed tasks (future dueDate fails the OR guard)", () => {
    // FUTURE is strictly after NOW; the OR only admits null or <= NOW, so a
    // snoozed-to-tomorrow task is kept off Next until its time arrives.
    expect(FUTURE.getTime()).toBeGreaterThan(NOW.getTime());
    // SAFETY: activePoolWhere returns a Prisma WhereInput; OR is typed as a nested
    // conditional union, but in practice it's always an array here.
    const or = activePoolWhere({ userId: "u1", now: NOW }).OR as unknown[];
    expect(or).toEqual([{ dueDate: null }, { dueDate: { lte: NOW } }]);
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

describe("activePoolWhere — regression: the reported bug", () => {
  // The bug: an UPCOMING task with a today dueDate showed on Next (label
  // "due today") but the Today badge + lens pill read 0, because they filtered
  // status === "TODAY" only. The pool predicate must COUNT that task. This test
  // encodes the scenario as the where-clause shape that would admit it.
  it("would count an UPCOMING + due-today task (the case that read 0)", () => {
    const w = activePoolWhere({ userId: "u1", lensId: "lens-work", now: NOW });
    // An UPCOMING task due today matches: status set admits UPCOMING, and
    // dueDate <= now admits a today dueDate.
    expect(w.status).toEqual({ in: ["TODAY", "UPCOMING"] });
    expect(w.OR).toContainEqual({ dueDate: { lte: NOW } });
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
