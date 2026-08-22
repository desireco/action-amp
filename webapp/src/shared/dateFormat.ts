import {
  Temporal,
  calendarDayDifference,
  currentPlainDate,
  instantFrom,
  systemTimeZone,
  plainDateFromValue,
} from "./time/temporal";

export function formatRelativeDue(d: Date | string): string {
  const target = plainDateFromValue(d);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return target.toLocaleString(undefined, { month: "short", day: "numeric" });
}

/**
 * Due-chip payload for TaskRow — the label + whether it should read as
 * overdue (rose) instead of neutral-due (teal). Same wording as
 * `formatRelativeDue`, but splits the overdue signal out so the caller can
 * pick a chip variant without re-deriving it.
 */
/** Due-chip payload — the label plus the overdue signal, split so the caller
 *  picks a chip variant without re-deriving it. */
export interface DueChip {
  label: string;
  overdue: boolean;
}

export function formatDueChip(d: Date | string): DueChip {
  const target = plainDateFromValue(d);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays < 0)
    return { label: `${Math.abs(diffDays)}d overdue`, overdue: true };
  if (diffDays === 0) return { label: "today", overdue: false };
  if (diffDays === 1) return { label: "tomorrow", overdue: false };
  if (diffDays < 7) return { label: `in ${diffDays}d`, overdue: false };
  return {
    label: target.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
    }),
    overdue: false,
  };
}

/**
 * Relative elapsed time for "X ago" labels — Inbox row timestamps, capture
 * chips. Resolves to "just now" / "N min ago" / "N hr ago" / "N days ago".
 */
export function formatAgo(date: Date | string): string {
  const seconds = Math.floor(
    (Temporal.Now.instant().epochMilliseconds - instantFrom(date).epochMilliseconds) /
      1000,
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
    : value.toPlainDate().toLocaleString(undefined, {
        month: "short",
        day: "numeric",
      });
  const time = value.toPlainTime().toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}

/**
 * Neutral day label — used for parsed-date chips and inbox contexts where the
 * deadline framing of `formatRelativeDue` ("in Nd" / "Nd overdue") is wrong.
 * Resolves to "today" / "yesterday" / "tomorrow" / "Mon D".
 */
export function formatRelativeDay(d: Date | string): string {
  const target = plainDateFromValue(d);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return target.toLocaleString(undefined, { month: "short", day: "numeric" });
}

/** Same calendar day, ignoring time. */
export function isSameDay(a: Date | string, b: Date | string): boolean {
  return plainDateFromValue(a).equals(plainDateFromValue(b));
}
