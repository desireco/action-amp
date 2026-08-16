/**
 * Pure feedback-operation cores — the shared DB layer for both the Wasp server
 * op (`./operations.ts`) and the admin `/api/cli/feedback/*` PAT routes.
 *
 * Pattern (mirrors `goals/operationsCore.ts`): every core takes `entities` as
 * its first arg (loosely typed — any Prisma-client-shaped object works) plus
 * plain args, does the DB work, and returns data. **No `wasp/server` import
 * lives here.** Wasp's detectServerImports plugin blocks `wasp/server` under
 * `src/` in the client build Vitest uses, so keeping this pure keeps it unit-
 * testable and importable from both worlds.
 *
 * submit is shared (user op + CLI write path), list/show/updateStatus are the
 * admin triage surface (read + status workflow). The Wasp op wrapper stays
 * responsible for the email-notification side effect (it touches
 * `wasp/server/email`) and calls `submitFeedbackCore` for the row create.
 *
 * Tenancy note: feedback is global to the admin (not lens-scoped, not
 * user-scoped from the admin's view), so the admin cores do not filter by
 * `userId`. submit still writes the submitter's userId — the row's owner is
 * always recorded.
 */

/**
 * The entities slice these cores read. Loosely typed (same approach as the
 * other cores): callers pass Wasp's Prisma delegate, a test mock, or a PAT
 * route's Prisma client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

import { uniqueShortId } from "../shared/shortId";
import type { Prisma } from "@prisma/client";

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

/** Clamp + trim an optional string field to a max length, returning null if empty. */
function cleanOptional(
  value: string | null | undefined,
  max = 500,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** The fields the create + read paths select — one shape shared across surfaces. */
const FEEDBACK_SELECT = {
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
// Write: submit feedback (shared by the in-app action + any write surface)
// ----------------------------------------------------------------
// Trims + validates the message, resolves the submitter's stored name + email,
// and creates the row. Returns the full row (the in-app wrapper only needs
// `{ id }` but the full row lets a future write surface skip a re-read).
//
// Email notification is deliberately NOT here — it lives in the Wasp op
// wrapper, which is the only place that can `import("wasp/server/email")`.
export async function submitFeedbackCore(
  entities: Entities,
  {
    userId,
    message,
    route,
    section,
    lens,
    userAgent,
    viewport,
    timezone,
    userName,
    userEmail,
  }: {
    userId: string;
    message: string;
    route?: string | null;
    section?: string | null;
    lens?: {
      id?: string | null;
      name?: string | null;
      color?: string | null;
    } | null;
    userAgent?: string | null;
    viewport?: string | null;
    timezone?: string | null;
    /** Resolved up-front by the wrapper (User.fullName lookup + Auth email). */
    userName?: string | null;
    userEmail?: string | null;
  },
) {
  const trimmed = message?.trim();
  if (!trimmed) {
    throw new Error("Feedback is required.");
  }
  if (trimmed.length > 4000) {
    throw new Error("Feedback is too long.");
  }

  // Mint a unique human-addressable short id (XXXX-XXXX). Retry-on-collision;
  // the DB @unique constraint is the race backstop.
  const shortId = await uniqueShortId(async (candidate) => {
    const clash = await entities.Feedback.findUnique({
      where: { shortId: candidate },
      select: { id: true },
    });
    return !!clash;
  });

  return await entities.Feedback.create({
    data: {
      shortId,
      message: trimmed,
      userId,
      userName: cleanOptional(userName ?? null, 160),
      userEmail: cleanOptional(userEmail ?? null, 300),
      route: cleanOptional(route, 300),
      section: cleanOptional(section, 40),
      lensId: cleanOptional(lens?.id, 80),
      lensName: cleanOptional(lens?.name, 120),
      lensColor: cleanOptional(lens?.color, 80),
      userAgent: cleanOptional(userAgent, 500),
      viewport: cleanOptional(viewport, 20),
      timezone: cleanOptional(timezone, 60),
    },
    select: FEEDBACK_SELECT,
  });
}

// ----------------------------------------------------------------
// Read: list feedback (admin triage surface)
// ----------------------------------------------------------------
// Newest first. Optional status filter narrows to one bucket. `limit` (when
// given) caps the page; when omitted, returns everything matching the filter
// (the caller — route/CLI — decides whether to cap). Bounds validation lives
// in the route, not here: the core trusts a finite positive number or none.
export async function listFeedbackCore(
  entities: Entities,
  { status, limit }: { status?: FeedbackStatus; limit?: number },
) {
  const where: Prisma.FeedbackWhereInput = { deletedAt: null };
  if (status) where.status = status;
  const queryOpts: Prisma.FeedbackFindManyArgs = {
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
  entities: Entities,
  ref: string,
  select: object,
) {
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
  entities: Entities,
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
// matches so the route maps it to 404. `updatedAt` auto-stamps via `@updatedAt`.
export async function updateFeedbackStatusCore(
  entities: Entities,
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
  entities: Entities,
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
