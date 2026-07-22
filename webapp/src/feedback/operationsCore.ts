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

import { uniqueShortId, normalizeShortId } from "../shared/shortId";

export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

/** Clamp + trim an optional string field to a max length, returning null if empty. */
function cleanOptional(value: string | null | undefined, max = 500): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** The fields the create + read paths select — one shape shared across surfaces. */
const FEEDBACK_SELECT = {
  id: true,
  shortId: true,
  createdAt: true,
  updatedAt: true,
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
    userName,
    userEmail,
  }: {
    userId: string;
    message: string;
    route?: string | null;
    section?: string | null;
    lens?: { id?: string | null; name?: string | null; color?: string | null } | null;
    userAgent?: string | null;
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
    },
    select: FEEDBACK_SELECT,
  });
}

// ----------------------------------------------------------------
// Read: list feedback (admin triage surface)
// ----------------------------------------------------------------
// Newest first. Optional status filter narrows to one bucket. `limit` caps the
// page (default 50) so an unbounded backlog never returns a huge payload in
// one shot.
export async function listFeedbackCore(
  entities: Entities,
  { status, limit = 50 }: { status?: FeedbackStatus; limit?: number },
) {
  return await entities.Feedback.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 200),
    select: FEEDBACK_SELECT,
  });
}

/**
 * Build a Prisma `where` for a feedback lookup, accepting either the UUID `id`
 * or the `XXXX-XXXX` shortId (canonicalized Crockford, case-insensitive).
 * Returns the single-key where the caller spreads into findUnique/update.
 */
function feedbackWhere(ref: string): { id: string } | { shortId: string } {
  const short = normalizeShortId(ref);
  return short ? { shortId: short } : { id: ref };
}

// ----------------------------------------------------------------
// Read: single feedback (admin triage surface)
// ----------------------------------------------------------------
export async function showFeedbackCore(entities: Entities, { id }: { id: string }) {
  return await entities.Feedback.findUnique({
    where: feedbackWhere(id),
    select: FEEDBACK_SELECT,
  });
}

// ----------------------------------------------------------------
// Write: update feedback status (admin triage surface)
// ----------------------------------------------------------------
// Validates the status value (defense-in-depth — the route + CLI also check),
// updates the row, and returns it. Throws "Feedback not found." if the id is
// absent so the route can map it to 404 via the standard `taskWriteError`-style
// convention. `updatedAt` auto-stamps via `@updatedAt`.
export async function updateFeedbackStatusCore(
  entities: Entities,
  { id, status }: { id: string; status: FeedbackStatus },
) {
  if (!isFeedbackStatus(status)) {
    throw new Error(
      `Invalid status. Must be one of: ${FEEDBACK_STATUSES.join(", ")}.`,
    );
  }

  const where = feedbackWhere(id);
  const existing = await entities.Feedback.findUnique({
    where,
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Feedback not found.");
  }

  return await entities.Feedback.update({
    where,
    data: { status },
    select: FEEDBACK_SELECT,
  });
}
