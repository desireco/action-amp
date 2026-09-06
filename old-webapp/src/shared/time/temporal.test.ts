import { describe, expect, it } from "vitest";
import {
  fixedClock,
  calendarDayDifference,
  instantFrom,
  instantToDate,
  instantToPlainDate,
  plainDateFrom,
  plainDateFromDb,
  plainDateFromValue,
  plainDateToDb,
} from "./temporal";

describe("Temporal boundaries", () => {
  it("round-trips an exact instant through Prisma Date precision", () => {
    const instant = instantFrom("2026-08-22T10:15:30.123Z");
    expect(instantToDate(instant).toISOString()).toBe("2026-08-22T10:15:30.123Z");
  });

  it("round-trips a calendar-only Prisma date without a local-zone shift", () => {
    const date = plainDateFrom("2026-03-29");
    expect(plainDateFromDb(plainDateToDb(date)).toString()).toBe("2026-03-29");
  });

  it("normalizes a Wasp ISO payload as a calendar date", () => {
    expect(plainDateFromValue("2026-03-29T00:00:00.000Z").toString()).toBe(
      "2026-03-29",
    );
    expect(
      calendarDayDifference(
        plainDateFrom("2026-03-28"),
        plainDateFrom("2026-03-30"),
      ),
    ).toBe(2);
  });

  it("resolves the same instant to the correct date on either side of UTC", () => {
    const instant = instantFrom("2026-01-01T00:30:00Z");
    expect(instantToPlainDate(instant, "America/Los_Angeles").toString()).toBe("2025-12-31");
    expect(instantToPlainDate(instant, "Europe/Belgrade").toString()).toBe("2026-01-01");
  });

  it("provides a deterministic clock for domain tests", () => {
    const clock = fixedClock("2026-08-22T10:00:00Z", "Europe/Belgrade");
    expect(clock.instant().toString()).toBe("2026-08-22T10:00:00Z");
    expect(clock.timeZoneId()).toBe("Europe/Belgrade");
  });
});
