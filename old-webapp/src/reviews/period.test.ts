import { describe, expect, it } from "vitest";
import {
  assertTimeZone,
  buildReviewSlices,
  localDateFor,
  parseCalendarDate,
  reviewPeriod,
  shiftReviewDate,
} from "./period";

describe("reviewPeriod", () => {
  it("builds a local Chicago day as an exclusive UTC range", () => {
    const period = reviewPeriod(
      "DAILY",
      "2026-08-08",
      "America/Chicago",
      new Date("2026-08-08T18:00:00Z"),
    );
    expect(period.start.toISOString()).toBe("2026-08-08T05:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-08-09T05:00:00.000Z");
    expect(period.startDate).toBe("2026-08-08");
    expect(period.endDate).toBe("2026-08-08");
    expect(period.inProgress).toBe(true);
  });

  it("handles 23-hour and 25-hour daylight-saving days", () => {
    const spring = reviewPeriod("DAILY", "2026-03-08", "America/Chicago");
    const fall = reviewPeriod("DAILY", "2026-11-01", "America/Chicago");
    expect(spring.end.getTime() - spring.start.getTime()).toBe(
      23 * 60 * 60 * 1000,
    );
    expect(fall.end.getTime() - fall.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("uses Monday through Sunday for weeks", () => {
    const period = reviewPeriod("WEEKLY", "2026-08-08", "UTC");
    expect(period.start.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(period.startDate).toBe("2026-08-03");
    expect(period.endDate).toBe("2026-08-09");
  });

  it("uses calendar-month boundaries", () => {
    const period = reviewPeriod("MONTHLY", "2024-02-20", "UTC");
    expect(period.start.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(period.endDate).toBe("2024-02-29");
  });
});

describe("review date helpers", () => {
  it("shifts dates by cadence", () => {
    expect(shiftReviewDate("2026-08-08", "DAILY", -1)).toBe("2026-08-07");
    expect(shiftReviewDate("2026-08-08", "WEEKLY", 1)).toBe("2026-08-15");
    expect(shiftReviewDate("2026-01-31", "MONTHLY", 1)).toBe("2026-02-01");
  });

  it("formats local dates in the requested zone", () => {
    expect(
      localDateFor(new Date("2026-08-08T02:00:00Z"), "America/Chicago"),
    ).toBe("2026-08-07");
  });

  it("rejects malformed dates and zones", () => {
    expect(() => parseCalendarDate("2026-02-30")).toThrow(/real calendar/);
    expect(() => parseCalendarDate("08/08/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => assertTimeZone("Mars/Olympus")).toThrow(/IANA/);
  });

  it("builds local calendar slices without DST drift", () => {
    expect(
      buildReviewSlices(
        ["2026-11-08T18:00:00.000Z"],
        "2026-11-01",
        "2026-11-30",
        "America/Chicago",
      ),
    ).toEqual([
      { startDate: "2026-11-01", completedTasks: 0 },
      { startDate: "2026-11-08", completedTasks: 1 },
      { startDate: "2026-11-15", completedTasks: 0 },
      { startDate: "2026-11-22", completedTasks: 0 },
      { startDate: "2026-11-29", completedTasks: 0 },
    ]);
  });
});
