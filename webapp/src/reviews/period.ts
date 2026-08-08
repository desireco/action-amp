export type ReviewCadence = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ReviewPeriod {
  cadence: ReviewCadence;
  start: Date;
  end: Date; // exclusive
  startDate: string;
  endDate: string; // inclusive local calendar date
  label: string;
  inProgress: boolean;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return timeZone;
  } catch {
    throw new Error("Time zone must be a valid IANA identifier.");
  }
}

export function parseCalendarDate(value: string): CalendarDate {
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error("Review date must use YYYY-MM-DD.");
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const normalized = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    normalized.getUTCFullYear() !== date.year ||
    normalized.getUTCMonth() !== date.month - 1 ||
    normalized.getUTCDate() !== date.day
  ) {
    throw new Error("Review date must be a real calendar date.");
  }
  return date;
}

export function localDateFor(date: Date, timeZone: string): string {
  assertTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function reviewPeriod(
  cadence: ReviewCadence,
  forDate: string,
  timeZone: string,
  now = new Date(),
): ReviewPeriod {
  assertTimeZone(timeZone);
  const selected = parseCalendarDate(forDate);
  const startCalendar = periodStartCalendar(cadence, selected);
  const nextCalendar = addCalendar(
    startCalendar,
    cadence === "DAILY" ? 1 : cadence === "WEEKLY" ? 7 : 0,
    cadence === "MONTHLY" ? 1 : 0,
  );
  const endInclusiveCalendar = addCalendar(nextCalendar, -1, 0);
  const start = zonedMidnightToUtc(startCalendar, timeZone);
  const end = zonedMidnightToUtc(nextCalendar, timeZone);

  return {
    cadence,
    start,
    end,
    startDate: formatCalendar(startCalendar),
    endDate: formatCalendar(endInclusiveCalendar),
    label: periodLabel(cadence, start, endInclusiveCalendar, timeZone),
    inProgress: now >= start && now < end,
  };
}

export function shiftReviewDate(
  forDate: string,
  cadence: ReviewCadence,
  direction: -1 | 1,
): string {
  const selected = parseCalendarDate(forDate);
  if (cadence === "MONTHLY") {
    return formatCalendar(addCalendar({ ...selected, day: 1 }, 0, direction));
  }
  const shifted = addCalendar(
    selected,
    cadence === "DAILY" ? direction : direction * 7,
    0,
  );
  return formatCalendar(shifted);
}

export function buildReviewSlices(
  completedAt: string[],
  startDate: string,
  endDate: string,
  timeZone: string,
): { startDate: string; completedTasks: number }[] {
  assertTimeZone(timeZone);
  parseCalendarDate(startDate);
  parseCalendarDate(endDate);
  const starts: string[] = [];
  for (
    let cursor = startDate;
    cursor <= endDate;
    cursor = addIsoDays(cursor, 7)
  )
    starts.push(cursor);
  const counts = new Map(starts.map((date) => [date, 0]));
  for (const value of completedAt) {
    const taskDate = localDateFor(new Date(value), timeZone);
    const elapsed = calendarDayDifference(startDate, taskDate);
    const key =
      starts[Math.min(starts.length - 1, Math.max(0, Math.floor(elapsed / 7)))];
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([sliceStart, completedTasks]) => ({
    startDate: sliceStart,
    completedTasks,
  }));
}

function periodStartCalendar(
  cadence: ReviewCadence,
  selected: CalendarDate,
): CalendarDate {
  if (cadence === "DAILY") return selected;
  if (cadence === "MONTHLY") return { ...selected, day: 1 };
  const utc = new Date(
    Date.UTC(selected.year, selected.month - 1, selected.day),
  );
  const daysSinceMonday = (utc.getUTCDay() + 6) % 7;
  return addCalendar(selected, -daysSinceMonday, 0);
}

function addCalendar(
  date: CalendarDate,
  days: number,
  months: number,
): CalendarDate {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1 + months, date.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarDayDifference(start: string, end: string): number {
  return Math.floor(
    (Date.parse(`${end}T00:00:00.000Z`) -
      Date.parse(`${start}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function formatCalendar(date: CalendarDate): string {
  return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
}

/** Convert a local midnight to its UTC instant without assuming a fixed offset. */
function zonedMidnightToUtc(date: CalendarDate, timeZone: string): Date {
  const target = Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const number = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(
      number("year"),
      number("month") - 1,
      number("day"),
      number("hour"),
      number("minute"),
      number("second"),
    );
    const correction = target - represented;
    guess += correction;
    if (correction === 0) break;
  }

  return new Date(guess);
}

function periodLabel(
  cadence: ReviewCadence,
  start: Date,
  endInclusive: CalendarDate,
  timeZone: string,
): string {
  if (cadence === "DAILY") {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(start);
  }
  if (cadence === "MONTHLY") {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      month: "long",
      year: "numeric",
    }).format(start);
  }
  const startLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(start);
  const endUtc = zonedMidnightToUtc(endInclusive, timeZone);
  const endLabel = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(endUtc);
  return `${startLabel} – ${endLabel}`;
}
