import type { GetLogbook } from "wasp/server/operations";
// Pure core shared with /api/cli/* routes — auth + entitlement guards stay
// here (the wrapper), the DB shape lives in the core. See operationsCore.ts.
import { getLogbookData } from "./operationsCore";

/**
 * Logbook — the record of things no longer active, scoped to the active Lens.
 *
 * Four categories, all read-only here (restore/reopen/delete are separate
 * actions):
 *  - completed Tasks  (isDone, completedAt)
 *  - completed Projects
 *  - completed Goals  (goal-planning spec §D — same shape as projects, with
 *                      goal: null since a goal has no parent goal)
 *  - archived InboxItems ("I will not do now") — status ARCHIVED, archivedAt.
 *                      Kept (not deleted) so the user never loses a captured
 *                      note for declining to act on it.
 *
 * Note on scoping: Tasks, Projects, and Goals carry a lensId; archived
 * InboxItems do NOT (the inbox is universal). Archived notes are returned
 * regardless of the active lens — they belong to the user, not a context.
 *
 * Entitlement: this read currently lacks an assertLensAllowed guard. A FREE
 * user who reaches the Work-lens Logbook via direct navigation would read Work
 * completion history. The planned CLI route should add the guard; the pure core
 * is entitlement-agnostic (the caller decides).
 */
export const getLogbook = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await getLogbookData(context.entities, {
    userId: context.user.id,
    lensId: args.lensId,
  });
}) satisfies GetLogbook<{ lensId: string }>;
