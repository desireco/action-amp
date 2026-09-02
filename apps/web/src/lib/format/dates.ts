/**
 * Date-format helpers — ported from webapp/src/shared/dateFormat.ts (S2/S3
 * surfaces: inbox row meta, triage chips). Runs over the local Temporal shim
 * (../capture/temporal-shim) for the calendar math.
 */
import {
  Temporal,
  calendarDayDifference,
  currentPlainDate,
  instantFrom,
  plainDateFromValue,
  systemTimeZone,
} from "../capture/temporal-shim";

/** Relative elapsed time — "just now" / "N min ago" / "N hr ago" / "N days ago". */
export function formatAgo(date: Date | string): string {
  const seconds = Math.floor(
    (Temporal.Now.instant().epochMilliseconds - instantFrom(date).epochMilliseconds) / 1000,
  );
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export function formatSnoozedUntil(date: Date | string): string {
  const value = instantFrom(date).toZonedDateTimeISO(systemTimeZone());
  const day = value.toPlainDate().equals(currentPlainDate())
    ? "today"
    : formatMonthDay(value.toPlainDate());
  const time = formatClock(value.epochMilliseconds);
  return `${day} ${time}`;
}

/**
 * Neutral day label — parsed-date chips and inbox contexts where the deadline
 * framing is wrong. Resolves to "today" / "yesterday" / "tomorrow" / "Mon D".
 */
export function formatRelativeDay(d: Date | string): string {
  const target = plainDateFromValue(d);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return formatMonthDay(target);
}

/** Same calendar day, ignoring time. */
export function isSameDay(a: Date | string, b: Date | string): boolean {
  return plainDateFromValue(a).equals(plainDateFromValue(b));
}

/** "Jun 24" — month-short + day. */
export function formatMonthDay(d: { month: number; day: number }): string {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[d.month - 1]} ${d.day}`;
}

/** "8:00 PM" wall clock in the system zone. */
function formatClock(epochMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(epochMs));
}
