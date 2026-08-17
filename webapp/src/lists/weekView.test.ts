// Pure week-bucketing rules (weekView.ts) — dated → weekday, overdue → Today,
// TODAY-undated → Today, undated-UPCOMING → dropped. The pool feeding these
// rules is pinned in tasks/operationsCore.test.ts (getWeekTasksData).
import { describe, it, expect } from "vitest";
import { bucketWeekTasks, dayKey } from "./weekView";
import type { TaskLensListRow } from "../tasks/operationsCore";

function task(overrides: Partial<TaskLensListRow>): TaskLensListRow {
  return {
    id: "t",
    description: "Task",
    isDone: false,
    status: "TODAY",
    dueDate: null,
    // SAFETY: test fixture widens the base row with just the fields the
    // bucketing reads; the remaining Task columns are irrelevant here.
    ...overrides,
  } as TaskLensListRow;
}

// Monday 2026-08-10 .. Sunday 2026-08-16; today = Thursday 2026-08-13.
const WEEK_START = new Date(2026, 7, 10);
const TODAY = new Date(2026, 7, 13);

describe("bucketWeekTasks", () => {
  it("places a dated task on its weekday", () => {
    const buckets = bucketWeekTasks(
      [task({ id: "dated", dueDate: new Date(2026, 7, 14) })], // Friday
      WEEK_START,
      TODAY,
    );
    expect(buckets.find((b) => b.key === dayKey(new Date(2026, 7, 14)))?.items.map((t) => t.id))
      .toEqual(["dated"]);
  });

  it("places an undated TODAY task in the Today bucket", () => {
    const buckets = bucketWeekTasks(
      [task({ id: "committed", status: "TODAY", dueDate: null })],
      WEEK_START,
      TODAY,
    );
    expect(buckets.find((b) => b.key === dayKey(TODAY))?.items.map((t) => t.id))
      .toEqual(["committed"]);
  });

  it("places an overdue task (dated before the week) in the Today bucket", () => {
    const buckets = bucketWeekTasks(
      [task({ id: "late", status: "UPCOMING", dueDate: new Date(2026, 7, 3) })], // previous Monday
      WEEK_START,
      TODAY,
    );
    expect(buckets.find((b) => b.key === dayKey(TODAY))?.items.map((t) => t.id))
      .toEqual(["late"]);
  });

  it("keeps a TODAY task that still carries a this-week date on its weekday", () => {
    // Promoting a scheduled task to Today must not make it disappear from its
    // weekday (the view's founding rule).
    const buckets = bucketWeekTasks(
      [task({ id: "promoted", status: "TODAY", dueDate: new Date(2026, 7, 15) })],
      WEEK_START,
      TODAY,
    );
    expect(buckets.find((b) => b.key === dayKey(new Date(2026, 7, 15)))?.items.map((t) => t.id))
      .toEqual(["promoted"]);
    expect(buckets.find((b) => b.key === dayKey(TODAY))?.items).toEqual([]);
  });

  it("drops an undated UPCOMING task defensively (the pool never sends one)", () => {
    const buckets = bucketWeekTasks(
      [task({ id: "bench", status: "UPCOMING", dueDate: null })],
      WEEK_START,
      TODAY,
    );
    expect(buckets.flatMap((b) => b.items)).toEqual([]);
  });

  it("returns all seven day buckets in week order, empty included", () => {
    const buckets = bucketWeekTasks([], WEEK_START, TODAY);
    expect(buckets).toHaveLength(7);
    expect(buckets[0]?.key).toBe(dayKey(new Date(2026, 7, 10)));
    expect(buckets[6]?.key).toBe(dayKey(new Date(2026, 7, 16)));
  });
});
