import type { Prisma } from "@prisma/client";

/**
 * The actionable pool — the single source of truth for "what's on the table
 * right now." This predicate drives Next's top task AND every count that must
 * agree with it (the Today nav badge and the per-lens pill). Use it anywhere a
 * number is shown alongside the Next card so they can never diverge.
 *
 * Semantics (WORKFLOW.md §5.2):
 * - status ∈ {TODAY (the court), UPCOMING (the bench)}
 * - not done
 * - no dueDate (always actionable) OR dueDate ≤ now (a snooze that has arrived)
 *
 * A future dueDate means the task is snoozed/scheduled → excluded until its time
 * arrives. SOMEDAY is never actionable.
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
  now = new Date(),
}: {
  userId: string;
  lensId?: string;
  now?: Date;
}): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    userId,
    status: { in: ["TODAY", "UPCOMING"] },
    isDone: false,
    // A future dueDate = snoozed/scheduled; keep it off Next until due.
    // (null dueDate = no horizon → always a candidate.)
    OR: [{ dueDate: null }, { dueDate: { lte: now } }],
  };
  if (lensId) where.lensId = lensId;
  return where;
}

