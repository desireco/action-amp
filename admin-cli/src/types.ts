/**
 * Shared types — the shapes the API returns, as the admin CLI sees them.
 *
 * These mirror the backend's response shapes (from webapp/src/auth/patRoutes.ts
 * + the feedback core's SELECT). Kept here rather than imported from wasp
 * because the admin CLI is a standalone package; if the API shape drifts, the
 * msw tests will fail (they assert the exact shapes).
 */

export type FeedbackStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return (FEEDBACK_STATUSES as string[]).includes(value);
}

export type Feedback = {
  id: string;
  shortId: string;
  createdAt: string;
  updatedAt: string;
  message: string;
  status: FeedbackStatus;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  route: string | null;
  section: string | null;
  lensId: string | null;
  lensName: string | null;
  lensColor: string | null;
  userAgent: string | null;
};

/**
 * whoami — the admin CLI checks isAdmin at login, so the stored session is
 * always an admin. The field is included here so `whoami` can render it and
 * stay defensive (if a non-admin token somehow lands in config, whoami says so
 * loudly instead of silently looking fine).
 */
export type Whoami = {
  user: {
    id: string;
    email: string | null;
    fullName: string;
    plan: string;
    /** Carried by patMiddleware's PatUser but not by the /api/cli/whoami body —
     *  the admin CLI fetches it separately during login. whoami re-derives it
     *  from the login-time assertion by assuming admin; if false, flag it. */
    isAdmin?: boolean;
  };
};

export type FeedbackListResult = { feedback: Feedback[] };
export type FeedbackShowResult = { feedback: Feedback };
export type FeedbackStatusResult = { feedback: Feedback };

// ----------------------------------------------------------------
// Admin stats (actionamp-admin stats)
// ----------------------------------------------------------------
// Mirrors webapp/src/admin/operationsCore.ts AdminStats. JSON from the server
// is the source of truth; this local type only types the formatter.
export type AdminStats = {
  users: {
    total: number;
    signedUpToday: number;
    signedUp7d: number;
    signedUp30d: number;
    activeToday: number;
    active7d: number;
    active30d: number;
  };
  tasks: {
    created7d: number;
    completed7d: number;
    total: number;
  };
  feedback: {
    byStatus: { OPEN: number; IN_PROGRESS: number; RESOLVED: number; CLOSED: number };
    total: number;
  };
};

export type StatsResult = { stats: AdminStats };
