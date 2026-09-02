// Ported from webapp/src/shared/time/temporal.ts (F4b) — the Temporal helpers
// the task cores and entitlements share. SIGNATURES UNCHANGED.
//
// One deviation: the webapp imports `@js-temporal/polyfill`; packages/ has no
// such dependency (root deps: drizzle-orm, postgres, vitest) and the runtime
// is Bun, which ships Temporal as a global. This module therefore binds
// `globalThis.Temporal` through a minimal locally-declared interface covering
// exactly the surface these helpers use. If a future goal ever needs the
// polyfill, reconcile its ambient types with the ones here.
//
// `Date` conversions keep Prisma semantics: Prisma mapped PostgreSQL
// `timestamp(3)` to `Date` and `@db.Date` to a `Date` at UTC midnight — the
// schema now runs mode:'date', so the seam hands the cores the same shapes.

/** Minimal, locally-declared Temporal surface (see file header). Sub-second
 *  duration fields are omitted until a port needs them. */
export interface TemporalDurationLike {
  days?: number;
  weeks?: number;
  months?: number;
  hours?: number;
  minutes?: number;
}

export interface TemporalDuration {
  days: number;
  hours: number;
  minutes: number;
}

export interface TemporalTimeLike {
  hours?: number;
  minutes?: number;
}

/** Calendar-field partial for `PlainDate.with` (S2 capture parser: year rolls). */
export interface TemporalPlainDateLike {
  year?: number;
  month?: number;
  day?: number;
}

export interface TemporalInstant {
  epochMilliseconds: number;
  add(duration: TemporalDurationLike | TemporalDuration): TemporalInstant;
  toZonedDateTimeISO(timeZone: string): TemporalZonedDateTime;
}

export interface TemporalZonedDateTime {
  toPlainDate(): TemporalPlainDate;
  toInstant(): TemporalInstant;
}

export interface TemporalPlainDate {
  dayOfWeek: number;
  /** Calendar-field reads (S2 capture parser: month-day + M/D tokens). */
  readonly year: number;
  readonly month: number;
  readonly day: number;
  add(duration: TemporalDurationLike): TemporalPlainDate;
  subtract(duration: TemporalDurationLike): TemporalPlainDate;
  /** Calendar-field overwrite (S2 capture parser: past month/day rolls to
   *  next year) — returns a new PlainDate, `this` untouched. */
  with(duration: TemporalPlainDateLike): TemporalPlainDate;
  toZonedDateTime(
    timeZone: string | { timeZone: string; plainTime?: TemporalPlainTime | TemporalTimeLike },
  ): TemporalZonedDateTime;
  until(other: TemporalPlainDate, options?: { largestUnit?: "auto" | "days" | "hours" | "months" | "years" }): TemporalDuration;
}

/** Opaque — only ever constructed via `Temporal.PlainTime.from` and passed
 *  through to `toZonedDateTime`. */
export interface TemporalPlainTime {
  readonly __brand: "TemporalPlainTime";
}

export interface TemporalNow {
  instant(): TemporalInstant;
  plainDateISO(timeZone?: string): TemporalPlainDate;
  timeZoneId(): string;
}

export interface TemporalNamespace {
  Now: TemporalNow;
  Instant: {
    from(value: string): TemporalInstant;
    fromEpochMilliseconds(epochMilliseconds: number): TemporalInstant;
    compare(a: TemporalInstant, b: TemporalInstant): -1 | 0 | 1;
  };
  PlainDate: {
    from(value: string): TemporalPlainDate;
    /** Calendar-fields object form (S2 capture parser: month-day tokens). */
    from(value: { year: number; month: number; day: number }): TemporalPlainDate;
    /** Chronological ordering of two calendar dates (past-date roll logic). */
    compare(a: TemporalPlainDate, b: TemporalPlainDate): -1 | 0 | 1;
  };
  PlainTime: { from(value: string): TemporalPlainTime };
  Duration: { from(value: TemporalDurationLike): TemporalDuration };
}

const globalTemporal = (globalThis as { Temporal?: TemporalNamespace }).Temporal;
if (!globalTemporal) {
  throw new Error(
    "Temporal is not available. The domain package runs on Bun (or Node ≥ 24), which ship it as a global.",
  );
}

/** The Temporal namespace — same name/shape the webapp re-exported from the
 *  polyfill, so ported cores keep their original call sites. */
export const Temporal: TemporalNamespace = globalTemporal;

export type Instant = TemporalInstant;
export type PlainDate = TemporalPlainDate;
export type PlainTime = TemporalPlainTime;

/** Exact-time boundary used for the seam, Stripe, Web Push, and API payloads. */
export function instantFrom(value: Date | string): Instant {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("Invalid instant.");
    return Temporal.Instant.fromEpochMilliseconds(value.getTime());
  }
  return Temporal.Instant.from(value);
}

/** The seam accepts and returns legacy Date objects (Prisma parity). Keep that conversion here. */
export function instantToDate(value: Instant): Date {
  return new Date(value.epochMilliseconds);
}

/** Parse the canonical YYYY-MM-DD wire/storage form for a calendar-only date. */
export function plainDateFrom(value: string): PlainDate {
  return Temporal.PlainDate.from(value);
}

/** Normalize an ISO DateTime serialization or a YYYY-MM-DD wire value. */
export function plainDateFromValue(value: Date | string): PlainDate {
  return value instanceof Date
    ? plainDateFromDb(value)
    : Temporal.PlainDate.from(value.slice(0, 10));
}

/** PostgreSQL DATE maps to Date at UTC midnight (schema mode:'date'). */
export function plainDateFromDb(value: Date): PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(value.getTime())
    .toZonedDateTimeISO("UTC")
    .toPlainDate();
}

/** Encode a calendar date for a @db.Date column (Task.scheduledDate & co). */
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
