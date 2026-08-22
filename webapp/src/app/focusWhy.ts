/**
 * Compose the honest one-line "why this?" for the Next card.
 *
 * PRODUCT.md names transparency as load-bearing: the line under the suggestion
 * must state the *actual* reason `getTopTask` ranked this task first — never a
 * template that lies (e.g. "due today" when there's no due date). This helper
 * reads the same fields the matcher sorts on and composes a truthful sentence
 * in priority-of-signal order.
 *
 * It is PURE: same input → same output, no I/O. That keeps it trivially testable
 * (see focusWhy.test.ts) and out of the React render path's concerns.
 *
 * Ranking-signal priority (mirrors getTopTask's sort):
 *   1. startedAt != null  → "You're already doing this." (the Now state always
 *      wins; this is the strongest signal and the only one that's terminal).
 *   2. priority IMPORTANT → lead with "Important".
 *   3. priority LOW       → "Quick win" if size is S/M, else "Low priority".
 *      (NORMAL has no lead — it's the absence of a stronger signal.)
 *   4. due context        → appended ONLY when a scheduledDate exists: "overdue" /
 *      "due today" / "due tomorrow" / "due <weekday>" / "due <Jun 30>".
 *   5. size-fit           → appended only when it adds info (S/M → "fits in …").
 *
 * The split into `lead` / `detail` maps onto the NextCard's `why` (lead) +
 * `whyEmphasis` (detail, rendered strong in amber) props, keeping the visual
 * identical to the old hardcoded line.
 */
import {
  calendarDayDifference,
  currentPlainDate,
  plainDateFromValue,
} from "../shared/time/temporal";

// The Task fields the matcher actually uses. Subset of the Prisma Task row —
// kept as a structural type so the helper depends on data shape, not the ORM.
export interface FocusWhyInput {
  startedAt?: Date | string | null;
  priority: "LOW" | "NORMAL" | "IMPORTANT" | string;
  size: "S" | "M" | "L" | "XL" | string;
  status?: "TODAY" | "UPCOMING" | "SOMEDAY" | string;
  scheduledDate?: Date | string | null;
}

export interface FocusWhy {
  /** The lead clause, e.g. "You're already doing this." or "Important". Empty when there's no lead. */
  lead: string;
  /** The appended detail, e.g. "and overdue" / "— due today, fits in 15 min". Empty when none. */
  detail: string;
}

const SIZE_MINUTES = { S: 15, M: 30, L: 60, XL: 120 } as const;

/** Whole-day diff: 0 = today, -1 = overdue, 1 = tomorrow, etc. (timezone-naive by design — due dates are day-granular.) */
function dayDiff(date: Date | string): number {
  return calendarDayDifference(currentPlainDate(), plainDateFromValue(date));
}

/** The truthful due clause, or null when there's no due date to speak of. */
function dueClause(scheduledDate: FocusWhyInput["scheduledDate"]): string | null {
  if (!scheduledDate) return null; // no horizon → never fabricate a due reason
  const diff = dayDiff(scheduledDate);
  if (diff < 0) return "overdue";
  if (diff === 0) return "due today";
  if (diff === 1) return "due tomorrow";
  const date = plainDateFromValue(scheduledDate);
  if (diff <= 7) {
    return `due ${date.toLocaleString("en-US", { weekday: "short" })}`;
  }
  return `due ${date.toLocaleString("en-US", { month: "short", day: "numeric" })}`;
}

/** "fits in 15 min" only for the small sizes where it's a useful nudge; L/XL don't add info here. */
function sizeClause(size: FocusWhyInput["size"]): string | null {
  const mins = SIZE_MINUTES[size];
  if (!mins || mins >= 60) return null; // L/XL: "fits in 1 hr+" isn't a useful focus signal
  return `fits in ${mins} min`;
}

export function composeWhy(task: FocusWhyInput): FocusWhy {
  // 1. In-progress is the terminal signal — nothing else to say.
  if (task.startedAt) {
    return { lead: "You're already doing this.", detail: "" };
  }

  // 2/3. Priority lead.
  let lead = "";
  if (task.priority === "IMPORTANT") {
    lead = "Important";
  } else if (task.priority === "LOW") {
    lead = SIZE_MINUTES[task.size] && SIZE_MINUTES[task.size] < 60 ? "Quick win" : "Low priority";
  }
  // NORMAL → no lead (the detail carries the reason, if any).

  // 4/5. Append truthful detail clauses (due, then size-fit).
  const due = dueClause(task.scheduledDate);
  const size = sizeClause(task.size);
  const parts = [due, size].filter(
    (p): p is string => p !== null && p !== undefined,
  );

  let detail = "";
  if (parts.length > 0) {
    // Join with commas; "and" before the last only when there are exactly two
    // and no overdue (overdue reads better as "and overdue").
    if (lead) {
      detail = parts.length === 1 && due === "overdue" ? `and ${parts[0]}` : `— ${parts.join(", ")}`;
    } else {
      // No lead (NORMAL priority): the detail IS the reason. Capitalize the first letter.
      detail = parts.join(", ");
      detail = detail.charAt(0).toUpperCase() + detail.slice(1);
    }
  }

  return { lead, detail };
}
