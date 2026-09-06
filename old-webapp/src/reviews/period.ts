import {
  Temporal,
  assertTimeZone as assertTemporalTimeZone,
  calendarDayDifference,
  instantFrom,
  instantToDate,
} from "../shared/time/temporal";

export type ReviewCadence = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ReviewPeriod {
  cadence: ReviewCadence;
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  label: string;
  inProgress: boolean;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertTimeZone(timeZone: string): string {
  try {
    return assertTemporalTimeZone(timeZone);
  } catch {
    throw new Error("Time zone must be a valid IANA identifier.");
  }
}

export function parseCalendarDate(value: string): CalendarDate {
  if (!ISO_DATE.test(value)) throw new Error("Review date must use YYYY-MM-DD.");
  try {
    const date = Temporal.PlainDate.from(value, { overflow: "reject" });
    return { year: date.year, month: date.month, day: date.day };
  } catch {
    throw new Error("Review date must be a real calendar date.");
  }
}

function plainDate(value: string): Temporal.PlainDate {
  parseCalendarDate(value);
  return Temporal.PlainDate.from(value);
}

export function localDateFor(date: Date, timeZone: string): string {
  assertTimeZone(timeZone);
  return instantFrom(date).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function reviewPeriod(
  cadence: ReviewCadence,
  forDate: string,
  timeZone: string,
  now = new Date(),
): ReviewPeriod {
  assertTimeZone(timeZone);
  const selected = plainDate(forDate);
  const startCalendar = periodStart(cadence, selected);
  const nextCalendar = startCalendar.add(
    cadence === "DAILY"
      ? { days: 1 }
      : cadence === "WEEKLY"
        ? { weeks: 1 }
        : { months: 1 },
  );
  const endInclusiveCalendar = nextCalendar.subtract({ days: 1 });
  const startInstant = startCalendar.toZonedDateTime(timeZone).toInstant();
  const endInstant = nextCalendar.toZonedDateTime(timeZone).toInstant();
  const nowInstant = instantFrom(now);

  return {
    cadence,
    start: instantToDate(startInstant),
    end: instantToDate(endInstant),
    startDate: startCalendar.toString(),
    endDate: endInclusiveCalendar.toString(),
    label: periodLabel(cadence, startCalendar, endInclusiveCalendar, timeZone),
    inProgress:
      Temporal.Instant.compare(nowInstant, startInstant) >= 0 &&
      Temporal.Instant.compare(nowInstant, endInstant) < 0,
  };
}

export function shiftReviewDate(
  forDate: string,
  cadence: ReviewCadence,
  direction: -1 | 1,
): string {
  const selected = plainDate(forDate);
  if (cadence === "MONTHLY") {
    return selected.with({ day: 1 }).add({ months: direction }).toString();
  }
  return selected
    .add(cadence === "DAILY" ? { days: direction } : { weeks: direction })
    .toString();
}

export function buildReviewSlices(
  completedAt: string[],
  startDate: string,
  endDate: string,
  timeZone: string,
): { startDate: string; completedTasks: number }[] {
  assertTimeZone(timeZone);
  const start = plainDate(startDate);
  const end = plainDate(endDate);
  const starts: Temporal.PlainDate[] = [];
  for (
    let cursor = start;
    Temporal.PlainDate.compare(cursor, end) <= 0;
    cursor = cursor.add({ weeks: 1 })
  ) {
    starts.push(cursor);
  }
  const counts = new Map(starts.map((date) => [date.toString(), 0]));
  for (const value of completedAt) {
    const taskDate = instantFrom(value)
      .toZonedDateTimeISO(timeZone)
      .toPlainDate();
    const elapsed = calendarDayDifference(start, taskDate);
    const key = starts[
      Math.min(starts.length - 1, Math.max(0, Math.floor(elapsed / 7)))
    ]?.toString();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([sliceStart, completedTasks]) => ({
    startDate: sliceStart,
    completedTasks,
  }));
}

function periodStart(
  cadence: ReviewCadence,
  selected: Temporal.PlainDate,
): Temporal.PlainDate {
  if (cadence === "DAILY") return selected;
  if (cadence === "MONTHLY") return selected.with({ day: 1 });
  return selected.subtract({ days: selected.dayOfWeek - 1 });
}

function periodLabel(
  cadence: ReviewCadence,
  start: Temporal.PlainDate,
  endInclusive: Temporal.PlainDate,
  timeZone: string,
): string {
  const startDate = instantToDate(start.toZonedDateTime(timeZone).toInstant());
  if (cadence === "DAILY") {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(startDate);
  }
  if (cadence === "MONTHLY") {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      month: "long",
      year: "numeric",
    }).format(startDate);
  }
  const startLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(startDate);
  const endDate = instantToDate(
    endInclusive.toZonedDateTime(timeZone).toInstant(),
  );
  const endLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(endDate);
  return `${startLabel} – ${endLabel}`;
}
