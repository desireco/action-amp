/**
 * Parse the Date-or-string representation once at the boundary —
 * instanceof, so every formatter below consumes a concrete Date.
 */
function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatRelativeDue(d: Date | string): string {
  const date = toDate(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  const date = toDate(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays < 0)
    return { label: `${Math.abs(diffDays)}d overdue`, overdue: true };
  if (diffDays === 0) return { label: "today", overdue: false };
  if (diffDays === 1) return { label: "tomorrow", overdue: false };
  if (diffDays < 7) return { label: `in ${diffDays}d`, overdue: false };
  return {
    label: date.toLocaleDateString(undefined, {
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
  const seconds = Math.floor((Date.now() - toDate(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Neutral day label — used for parsed-date chips and inbox contexts where the
 * deadline framing of `formatRelativeDue` ("in Nd" / "Nd overdue") is wrong.
 * Resolves to "today" / "yesterday" / "tomorrow" / "Mon D".
 */
export function formatRelativeDay(d: Date | string): string {
  const date = toDate(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Same calendar day, ignoring time. */
export function isSameDay(a: Date | string, b: Date | string): boolean {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
