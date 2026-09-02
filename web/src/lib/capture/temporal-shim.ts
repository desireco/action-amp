/**
 * Temporal availability shim for the browser (S2/S3 client).
 *
 * The capture parser's two runtimes must agree exactly: the server runs the
 * @actionamp/domain port on Bun's global Temporal; the browser may not ship
 * the global yet (the machine's Node 24 doesn't, and Playwright's Chromium
 * follows its V8), and web has no polyfill dependency. This module
 * installs a MINIMAL Temporal onto `globalThis` — only the surface the
 * capture parser + the small date-format helpers use — when the platform
 * lacks one. Where a real Temporal exists it is left untouched.
 *
 * Semantics matched to Temporal where the parser can tell the difference:
 *  - PlainDate is a pure calendar date (anchored at UTC internally);
 *  - `add({ days | weeks | months | years })` balances single-unit durations
 *    exactly like Temporal for the parser's calls (one unit at a time);
 *  - `with({ year })` keeps month/day (a Feb-29 overflow lands on Mar 1 —
 *    Temporal would reject the invalid date, the shim tolerates it; harmless
 *    for the past-month-day roll the parser performs);
 *  - `toZonedDateTime({ timeZone, plainTime })` resolves wall-clock time
 *    through the real IANA database via Intl (two-pass offset resolution);
 *  - `until(other, { largestUnit: "days" })` is whole calendar days.
 */

type DurationLike = { days?: number; weeks?: number; months?: number; years?: number };

function isoDayOfWeek(y: number, m: number, d: number): number {
  // ISO: Monday = 1 … Sunday = 7 (Temporal semantics).
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun = 0
  return dow === 0 ? 7 : dow;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Offset of `timeZone` at the given instant, in ms (east positive). */
function tzOffsetMs(timeZone: string, instantMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** Wall-clock time in a zone → the UTC instant that renders as it. */
function wallTimeToEpochMs(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const offset1 = tzOffsetMs(timeZone, guess);
  const inst = guess - offset1;
  const offset2 = tzOffsetMs(timeZone, inst);
  return guess - offset2;
}

class MiniPlainDate {
  readonly #y: number;
  readonly #m: number; // 1-based
  readonly #d: number;

  constructor(y: number, m: number, d: number) {
    this.#y = y;
    this.#m = m;
    this.#d = d;
  }

  get year(): number { return this.#y; }
  get month(): number { return this.#m; }
  get day(): number { return this.#d; }
  get dayOfWeek(): number { return isoDayOfWeek(this.#y, this.#m, this.#d); }
  get epochUtcMs(): number { return Date.UTC(this.#y, this.#m - 1, this.#d); }

  static from(value: string | { year: number; month: number; day: number }): MiniPlainDate {
    if (typeof value === "string") {
      const [y, m, d] = value.slice(0, 10).split("-").map(Number);
      return new MiniPlainDate(y, m, d);
    }
    return new MiniPlainDate(value.year, value.month, value.day);
  }

  static compare(a: MiniPlainDate, b: MiniPlainDate): -1 | 0 | 1 {
    const diff = a.epochUtcMs - b.epochUtcMs;
    return diff < 0 ? -1 : diff > 0 ? 1 : 0;
  }

  add(duration: DurationLike): MiniPlainDate {
    let { y, m, d } = { y: this.#y, m: this.#m, d: this.#d };
    if (duration.years || duration.months) {
      const total = (y * 12 + (m - 1)) + (duration.years ?? 0) * 12 + (duration.months ?? 0);
      y = Math.floor(total / 12);
      m = (total % 12) + 1;
      d = Math.min(d, daysInMonth(y, m));
    }
    if (duration.weeks) {
      const shifted = new Date(Date.UTC(y, m - 1, d));
      shifted.setUTCDate(shifted.getUTCDate() + duration.weeks * 7);
      y = shifted.getUTCFullYear();
      m = shifted.getUTCMonth() + 1;
      d = shifted.getUTCDate();
    }
    if (duration.days) {
      const shifted = new Date(Date.UTC(y, m - 1, d));
      shifted.setUTCDate(shifted.getUTCDate() + duration.days);
      y = shifted.getUTCFullYear();
      m = shifted.getUTCMonth() + 1;
      d = shifted.getUTCDate();
    }
    return new MiniPlainDate(y, m, d);
  }

  with(patch: { year?: number; month?: number; day?: number }): MiniPlainDate {
    return new MiniPlainDate(
      patch.year ?? this.#y,
      patch.month ?? this.#m,
      patch.day ?? this.#d,
    );
  }

  equals(other: MiniPlainDate): boolean {
    return this.epochUtcMs === other.epochUtcMs;
  }

  until(other: MiniPlainDate): { days: number } {
    return { days: Math.round((other.epochUtcMs - this.epochUtcMs) / 86_400_000) };
  }

  toZonedDateTime(
    arg: string | { timeZone: string; plainTime?: MiniPlainTime },
  ): MiniZonedDateTime {
    const timeZone = typeof arg === "string" ? arg : arg.timeZone;
    const time = typeof arg === "string" ? MiniPlainTime.from("00:00") : arg.plainTime ?? MiniPlainTime.from("00:00");
    const epochMs = wallTimeToEpochMs(this.#y, this.#m, this.#d, time.hour, time.minute, timeZone);
    return new MiniZonedDateTime(epochMs, timeZone);
  }

  toString(): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${this.#y}-${pad(this.#m)}-${pad(this.#d)}`;
  }
}

class MiniPlainTime {
  constructor(readonly hour: number, readonly minute: number) {}
  static from(value: string): MiniPlainTime {
    const [h, m] = value.split(":").map(Number);
    return new MiniPlainTime(h, m ?? 0);
  }
}

class MiniZonedDateTime {
  constructor(
    readonly epochMilliseconds: number,
    readonly timeZone: string,
  ) {}
  toInstant(): MiniInstant {
    return new MiniInstant(this.epochMilliseconds);
  }
  toPlainDate(): MiniPlainDate {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: this.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(this.epochMilliseconds));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return new MiniPlainDate(get("year"), get("month"), get("day"));
  }
}

class MiniInstant {
  constructor(readonly epochMilliseconds: number) {}
  static fromEpochMilliseconds(ms: number): MiniInstant {
    return new MiniInstant(ms);
  }
  static from(value: string): MiniInstant {
    return new MiniInstant(Date.parse(value));
  }
  static compare(a: MiniInstant, b: MiniInstant): -1 | 0 | 1 {
    return a.epochMilliseconds < b.epochMilliseconds ? -1 : a.epochMilliseconds > b.epochMilliseconds ? 1 : 0;
  }
  toZonedDateTimeISO(timeZone: string): MiniZonedDateTime {
    return new MiniZonedDateTime(this.epochMilliseconds, timeZone);
  }
}

interface MiniTemporalNamespace {
  Now: {
    instant(): MiniInstant;
    plainDateISO(timeZone?: string): MiniPlainDate;
    timeZoneId(): string;
  };
  Instant: {
    from(value: string): MiniInstant;
    fromEpochMilliseconds(ms: number): MiniInstant;
    compare(a: MiniInstant, b: MiniInstant): -1 | 0 | 1;
  };
  PlainDate: {
    from(value: string | { year: number; month: number; day: number }): MiniPlainDate;
    compare(a: MiniPlainDate, b: MiniPlainDate): -1 | 0 | 1;
  };
  PlainTime: { from(value: string): MiniPlainTime };
}

export type TemporalNamespace = MiniTemporalNamespace;
export type Instant = MiniInstant;
export type PlainDate = MiniPlainDate;
export type PlainTime = MiniPlainTime;

/**
 * The client parser ALWAYS uses the mini namespace — never a mixed real/shim
 * surface. Mixing is the danger: a real Temporal instance rejects shim
 * receivers in `until`/`compare` (internal-slot reads), so one capture could
 * hold dates from both worlds. One self-consistent implementation, semantics
 * matched to the Temporal spec for the surface the parser uses.
 */
export const Temporal: MiniTemporalNamespace = {
  Now: {
    instant: () => new MiniInstant(Date.now()),
    plainDateISO: (timeZone?: string) => {
      const tz = timeZone ?? systemTimeZoneValue();
      return new MiniZonedDateTime(Date.now(), tz).toPlainDate();
    },
    timeZoneId: systemTimeZoneValue,
  },
  Instant: MiniInstant,
  PlainDate: MiniPlainDate,
  PlainTime: MiniPlainTime,
};

const globalScope = globalThis as { Temporal?: unknown };
if (!globalScope.Temporal) {
  // Installed for other code that may expect the global — the parser uses the
  // module export above, never this.
  globalScope.Temporal = Temporal;
}

function systemTimeZoneValue(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function instantFrom(value: Date | string): MiniInstant {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("Invalid instant.");
    return new MiniInstant(value.getTime());
  }
  return MiniInstant.from(value);
}

export function instantToDate(value: MiniInstant): Date {
  return new Date(value.epochMilliseconds);
}

export function plainDateFrom(value: string): MiniPlainDate {
  return MiniPlainDate.from(value);
}

export function plainDateFromValue(value: Date | string): MiniPlainDate {
  return value instanceof Date ? plainDateFromDb(value) : MiniPlainDate.from(value);
}

/** A @db.Date arrives as a UTC-midnight Date (same as Prisma mapped it). */
export function plainDateFromDb(value: Date): MiniPlainDate {
  return MiniPlainDate.from(value.toISOString().slice(0, 10));
}

export function plainDateToDb(value: MiniPlainDate): Date {
  return new Date(value.epochUtcMs);
}

export function instantToPlainDate(value: MiniInstant, timeZone: string): MiniPlainDate {
  return value.toZonedDateTimeISO(timeZone).toPlainDate();
}

export function systemTimeZone(): string {
  return systemTimeZoneValue();
}

export function currentPlainDate(timeZone = systemTimeZone()): MiniPlainDate {
  return new MiniZonedDateTime(Date.now(), timeZone).toPlainDate();
}

export function calendarDayDifference(start: MiniPlainDate, end: MiniPlainDate): number {
  return start.until(end).days;
}
