import { describe, expect, it } from "vitest";
import { presetToScheduledDate } from "./taskPropertyFields";

describe("presetToScheduledDate", () => {
  const sunday = new Date(2026, 7, 16, 14, 0, 0);

  it("schedules a named weekday in the current or next week", () => {
    expect(presetToScheduledDate("weekday-1", sunday)).toEqual(new Date("2026-08-17T00:00:00.000Z"));
    expect(presetToScheduledDate("weekday-0", sunday)).toEqual(new Date("2026-08-16T00:00:00.000Z"));
  });

  it("makes next week mean next Monday", () => {
    expect(presetToScheduledDate("next-week", sunday)).toEqual(new Date("2026-08-17T00:00:00.000Z"));
  });
});
