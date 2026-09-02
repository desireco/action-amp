/**
 * Pure feedback-operation cores — the shared DB layer for the admin
 * `/api/cli/feedback/*` PAT routes and the admin dashboard's feedback ops
 * (S17; ported from webapp/src/feedback/operationsCore.ts).
 *
 * Pattern (mirrors the other domain cores): every core takes `entities` as
 * its first arg plus plain args, does the DB work, and returns data. No
 * framework imports.
 *
 * Tenancy note: feedback is global to the admin (not lens-scoped, not
 * user-scoped from the admin's view), so these cores do not filter by
 * `userId`. The row's owner is always recorded at submit time.
 *
 * NOT ported here: `submitFeedbackCore` (the in-app feedback write). It mints
 * Crockford shortIds via webapp's shared/shortId helper, which belongs to the
 * user-facing feedback-submit surface; when that surface slices, it should
 * land `src/shared/shortId.ts` and the submit core beside this file (see
 * docs/plans/slices/s17-wiring.md §5).
 */

import type {
  FeedbackDelegate,
  FeedbackFindManyArgs,
  FeedbackRow,
  FeedbackSelect,
  FeedbackWhereInput,
} from "../db/index.js";

/** The entities slice these cores read. */
export interface FeedbackEntities {
  Feedback: FeedbackDelegate;
}

export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  // SAFETY: narrowing readonly string array for .includes() call.
  return (
    typeof value === "string" &&
    (FEEDBACK_STATUSES as readonly string[]).includes(value)
  );
}

/** Re-exported from the seam — ONE definition (the FEEDBACK_SELECT shape). */
export type { FeedbackRow, FeedbackSelect };

/** The fields the read paths select — one shape shared across surfaces. */
export const FEEDBACK_SELECT: FeedbackSelect = {
  id: true,
  shortId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  message: true,
  status: true,
  userId: true,
  userName: true,
  userEmail: true,
  route: true,
  section: true,
  lensId: true,
  lensName: true,
  lensColor: true,
  userAgent: true,
  viewport: true,
  timezone: true,
};

// ----------------------------------------------------------------
// Read: list feedback (admin triage surface)
// ----------------------------------------------------------------
// Newest first. Optional status filter narrows to one bucket. `limit` (when
// given) caps the page; when omitted, returns everything matching the filter
// (the caller — route/CLI — decides whether to cap). Bounds validation lives
// in the route, not here: the core trusts a finite positive number or none.
export async function listFeedbackCore(
  entities: FeedbackEntities,
  { status, limit }: { status?: FeedbackStatus; limit?: number },
) {
  const where: FeedbackWhereInput = { deletedAt: null };
  if (status) where.status = status;
  const queryOpts: FeedbackFindManyArgs = {
    where,
    orderBy: { createdAt: "desc" },
    select: FEEDBACK_SELECT,
  };
  if (limit) queryOpts.take = limit;
  return await entities.Feedback.findMany(queryOpts);
}

/**
 * Resolve a feedback ref to the first matching row, by prefix. The ref can be:
 *   - a shortId prefix (any leading chars of the canonical XXXX-XXXX form,
 *     case-insensitive — e.g. "CFV", "cfvs", "CFVS-J9AQ" all match),
 *   - a UUID id prefix (e.g. "d1759ed5" or the full UUID).
 * "First" = newest by createdAt, so an ambiguous prefix deterministically
 * resolves to the most recent match (matches how `list` orders). Returns null
 * when nothing matches — callers translate that to 404.
 *
 * Prefix (not exact) matching is intentional: the admin types a few chars from
 * the list output and gets the newest match. Uniqueness is not required on the
 * input; if two rows share a prefix, the newer one wins.
 */
async function findFeedbackByRef(
  entities: FeedbackEntities,
  ref: string,
  select: FeedbackSelect,
): Promise<FeedbackRow | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  // The stored shortId is formatted "XXXX-XXXX" (dash at index 4). Build a
  // prefix in that same format so startsWith matches the stored value: strip
  // any dash the user typed, upper-case, map ambiguous chars (0↔O, 1↔I/L per
  // Crockford), then re-insert the dash once the prefix crosses 4 chars. So
  // "cfv" → "CFV", "cfvs" → "CFVS", "cfvsj" → "CFVS-J", "cfvs-j9aq" → "CFVS-J9AQ".
  const dashless = trimmed
    .toUpperCase()
    .replace(/-/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  const shortPrefix =
    dashless.length <= 4
      ? dashless
      : `${dashless.slice(0, 4)}-${dashless.slice(4, 8)}`;

  return await entities.Feedback.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { shortId: { startsWith: shortPrefix } },
        { id: { startsWith: trimmed } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select,
  });
}

// ----------------------------------------------------------------
// Read: single feedback (admin triage surface)
// ----------------------------------------------------------------
export async function showFeedbackCore(
  entities: FeedbackEntities,
  { id }: { id: string },
) {
  return await findFeedbackByRef(entities, id, FEEDBACK_SELECT);
}

// ----------------------------------------------------------------
// Write: update feedback status (admin triage surface)
// ----------------------------------------------------------------
// Validates the status value (defense-in-depth — the route + CLI also check),
// resolves the row by prefix (see findFeedbackByRef), then updates by the
// row's real PK id (a guaranteed singleton, so update can't touch two rows
// even if the prefix matched several). Throws "Feedback not found." if no row
// matches so the route maps it to 404. `updatedAt` re-stamps below the seam.
export async function updateFeedbackStatusCore(
  entities: FeedbackEntities,
  { id, status }: { id: string; status: FeedbackStatus },
) {
  if (!isFeedbackStatus(status)) {
    throw new Error(
      `Invalid status. Must be one of: ${FEEDBACK_STATUSES.join(", ")}.`,
    );
  }

  const existing = await findFeedbackByRef(entities, id, { id: true });
  if (!existing) {
    throw new Error("Feedback not found.");
  }

  return await entities.Feedback.update({
    where: { id: existing.id },
    data: { status },
    select: FEEDBACK_SELECT,
  });
}

// ----------------------------------------------------------------
// Soft-delete (admin triage surface)
// ----------------------------------------------------------------
// Marks the row removed: sets deletedAt (filtered out by every read core)
// without destroying the record. The row + its audit trail stay queryable
// directly in the DB. Not idempotent from the caller's view: because the
// lookup filters deletedAt: null, deleting an already-deleted row throws
// "Feedback not found." (the route maps that to 404). The UI prevents the
// double-delete case by removing the row on success; the 404 is the correct
// signal if a second delete somehow races in.
export async function deleteFeedbackCore(
  entities: FeedbackEntities,
  { id }: { id: string },
) {
  const existing = await findFeedbackByRef(entities, id, { id: true });
  if (!existing) {
    throw new Error("Feedback not found.");
  }

  return await entities.Feedback.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
    select: FEEDBACK_SELECT,
  });
}
