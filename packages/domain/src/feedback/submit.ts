/**
 * The user-facing feedback submit core (S-review port) — `submitFeedbackCore`
 * from webapp/src/feedback/operationsCore.ts, the write half the S17 admin
 * file deliberately left unported (see its header: the shortId helper belongs
 * to this surface; `../shared/shortId.ts` lands beside it now).
 *
 * Trims + validates the message, mints the Crockford `XXXX-XXXX` short id
 * (collision-retried against the `Feedback_shortId_key` unique — the DB
 * constraint is the race backstop), and creates the row. Returns the full
 * FEEDBACK_SELECT row (the oRPC wrapper only needs `{ id }`, but the full row
 * lets a future write surface skip a re-read).
 *
 * The webapp op wrapper's email side effect (the admin notification) stays a
 * wrapper concern here too — the stored row is the source of truth and the
 * notification must never make the user retry (see procedures/feedback.ts).
 */
import { uniqueShortId } from "../shared/shortId.js";
import {
  FEEDBACK_SELECT,
  type FeedbackEntities,
  type FeedbackRow,
} from "./operationsCore.js";

/** The entities slice the submit path needs (a superset satisfies it). */
export interface FeedbackSubmitEntities {
  Feedback: Pick<FeedbackEntities["Feedback"], "findUnique" | "create">;
}

/** Clamp + trim an optional string field to a max length, returning null if empty. */
function cleanOptional(
  value: string | null | undefined,
  max = 500,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Create one feedback row (the in-app submit action's shared write path). */
export async function submitFeedbackCore(
  entities: FeedbackSubmitEntities,
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
    /** Resolved up-front by the wrapper (the acting user's stored name/email). */
    userName?: string | null;
    userEmail?: string | null;
  },
): Promise<FeedbackRow> {
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
