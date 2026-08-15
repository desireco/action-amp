import { describe, expect, it } from "vitest";
import { presetToDate } from "./taskPropertyFields";

describe("presetToDate", () => {
  const sunday = new Date(2026, 7, 16, 14, 0, 0);

  it("schedules a named weekday in the current or next week", () => {
    expect(presetToDate("weekday-1", sunday)).toEqual(new Date(2026, 7, 17));
    expect(presetToDate("weekday-0", sunday)).toEqual(new Date(2026, 7, 16));
  });

  it("makes next week mean next Monday", () => {
    expect(presetToDate("next-week", sunday)).toEqual(new Date(2026, 7, 17));
  });
});
