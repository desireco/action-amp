import { Temporal } from "@js-temporal/polyfill";

export { Temporal };

export type Instant = Temporal.Instant;
export type PlainDate = Temporal.PlainDate;
export type PlainTime = Temporal.PlainTime;

/** Exact-time boundary used for Prisma, Stripe, Web Push, and Wasp payloads. */
export function instantFrom(value: Date | string): Instant {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("Invalid instant.");
    return Temporal.Instant.fromEpochMilliseconds(value.getTime());
  }
  return Temporal.Instant.from(value);
}

/** Prisma still accepts and returns legacy Date objects. Keep that conversion here. */
export function instantToDate(value: Instant): Date {
  return new Date(value.epochMilliseconds);
}

/** Parse the canonical YYYY-MM-DD wire/storage form for a calendar-only date. */
export function plainDateFrom(value: string): PlainDate {
  return Temporal.PlainDate.from(value);
}

/** Normalize Wasp's ISO DateTime serialization or a YYYY-MM-DD wire value. */
export function plainDateFromValue(value: Date | string): PlainDate {
  return value instanceof Date
    ? plainDateFromDb(value)
    : Temporal.PlainDate.from(value.slice(0, 10));
}

/** Prisma maps PostgreSQL DATE to Date at UTC midnight. */
export function plainDateFromDb(value: Date): PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(value.getTime())
    .toZonedDateTimeISO("UTC")
    .toPlainDate();
}

/** Encode a calendar date for a Prisma DateTime @db.Date field. */
export function plainDateToDb(value: PlainDate): Date {
  return instantToDate(value.toZonedDateTime("UTC").toInstant());
}

export function instantToPlainDate(value: Instant, timeZone: string): PlainDate {
  return value.toZonedDateTimeISO(timeZone).toPlainDate();
}

export function systemTimeZone(): string {
  return Temporal.Now.timeZoneId();
}

export function currentPlainDate(timeZone = systemTimeZone()): PlainDate {
  return Temporal.Now.plainDateISO(timeZone);
}

export function calendarDayDifference(start: PlainDate, end: PlainDate): number {
  return start.until(end, { largestUnit: "days" }).days;
}

export interface Clock {
  instant(): Instant;
  timeZoneId(): string;
}

export const systemClock: Clock = {
  instant: () => Temporal.Now.instant(),
  timeZoneId: systemTimeZone,
};

export function fixedClock(instant: string, timeZone = "UTC"): Clock {
  const fixed = Temporal.Instant.from(instant);
  return {
    instant: () => fixed,
    timeZoneId: () => timeZone,
  };
}

export function assertTimeZone(timeZone: string): string {
  Temporal.Now.instant().toZonedDateTimeISO(timeZone);
  return timeZone;
}
