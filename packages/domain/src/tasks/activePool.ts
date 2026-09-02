import type { TaskWhereInput } from "../db/index.js";
import {
  Temporal,
  instantFrom,
  instantToDate,
  instantToPlainDate,
  plainDateToDb,
} from "../shared/time/temporal.js";

/**
 * Ported from webapp/src/tasks/activePool.ts (F4b) — SIGNATURES UNCHANGED
 * (`Prisma.TaskWhereInput` became the seam's `TaskWhereInput`).
 *
 * The actionable pool — the single source of truth for "what's on the table
 * right now." This predicate drives Next's top task AND every count that must
 * agree with it (the Today nav badge and the per-lens pill). Use it anywhere a
 * number is shown alongside the Next card so they can never diverge.
 *
 * Semantics (WORKFLOW.md §5.2):
 * - status ∈ {TODAY (the court), UPCOMING (the bench)}
 * - not done
 * - no future scheduledDate in the user's calendar
 * - no future snoozedUntil exact instant
 *
 * The two guards are independent: a task may retain its schedule while a short
 * snooze temporarily removes it from Next. SOMEDAY is never actionable.
 *
 * This exists because the Today badge + lens pill previously filtered
 * `status: "TODAY"` only, while Next pooled TODAY + UPCOMING — so an Upcoming
 * task due today (or one rolled TODAY→UPCOMING overnight) showed on Next but
 * read 0 everywhere else. Routing both through this one predicate closes that
 * gap permanently; the daily rollover becomes invisible to counts (both
 * statuses are in the pool).
 */
export function activePoolWhere({
  userId,
  lensId,
  now = instantToDate(Temporal.Now.instant()),
  timeZone = "UTC",
}: {
  userId: string;
  lensId?: string;
  now?: Date;
  timeZone?: string;
}): TaskWhereInput {
  const nowInstant = instantFrom(now);
  const today = plainDateToDb(instantToPlainDate(nowInstant, timeZone));
  const where: TaskWhereInput = {
    userId,
    status: { in: ["TODAY", "UPCOMING"] },
    isDone: false,
    AND: [
      {
        OR: [
          { scheduledDate: null },
          { scheduledDate: { lte: today } },
        ],
      },
      {
        OR: [
          { snoozedUntil: null },
          { snoozedUntil: { lte: instantToDate(nowInstant) } },
        ],
      },
    ],
  };
  if (lensId) where.lensId = lensId;
  return where;
}
