/**
 * Admin store — the S17 data client for the admin workspace, following the
 * F9a class-singleton pattern (see prefs.svelte.ts). The `AdminClientSlice`
 * mirrors the contract's admin procedures structurally (the same bridge the
 * prefs/projects stores use): the shared client's type gains `admin` when
 * the composition line in docs/plans/slices/s17-wiring.md §1 is live; this
 * slice keeps the store typechecking either way.
 *
 * Every op is admin-gated SERVER-side (`isAdmin` → 403 "Admin only."); the
 * browser layout gate (routes/do/admin/+layout.svelte) is presentation —
 * the same boundary as the webapp.
 */
import { client } from "../api";
import { fetchAuthUser, type AuthUser } from "../auth";

// ----------------------------------------------------------------
// Wire shapes (the contract's admin schemas — kept as local interfaces so
// the store never imports the contract directly, per the api.ts boundary).
// ----------------------------------------------------------------

export type FunnelRange = "7d" | "30d" | "all";

export const FEEDBACK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface FeedbackRow {
  id: string;
  shortId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
  viewport: string | null;
  timezone: string | null;
}

export interface FunnelStep {
  name: string;
  count: number;
  fromPreviousPct: number | null;
  fromLandingPct: number | null;
}

export interface AdminStats {
  range: FunnelRange;
  since: string | null;
  users: {
    total: number;
    signedUpToday: number;
    signedUp7d: number;
    signedUp30d: number;
    activeToday: number;
    active7d: number;
    active30d: number;
    selectedSignups: number;
    selectedActive: number;
    deviceActivity: {
      sevenDays: DeviceUserCounts;
      thirtyDays: DeviceUserCounts;
    };
  };
  tasks: { created7d: number; completed7d: number; total: number };
  payments: { confirmed: number; total: number; checkoutToPaidPct: number | null };
  activity: {
    captures: number;
    triageCompleted: number;
    tasksCreated: number;
    tasksCompleted: number;
    taskCompletionPct: number | null;
  };
  funnel: FunnelStep[];
  feedback: {
    byStatus: Record<FeedbackStatus, number>;
    total: number;
  };
}

export interface DeviceUserCounts {
  mobile: number;
  tablet: number;
  desktop: number;
  unknown: number;
}

export interface ActivityWeek {
  weekStart: string;
  weekEnd: string;
  isCurrent: boolean;
  signups: number;
  activeUsers: number;
  captures: number;
  triageCompleted: number;
  tasksCreated: number;
  tasksCompleted: number;
}

export interface ActivityStats {
  weeks: ActivityWeek[];
  month: { label: string; weeks: ActivityWeek[] };
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string | null;
  signedUpAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  billedPlan: string;
  manualAccessGrant: string | null;
  manualGrantAt: string | null;
  isAdmin: boolean;
  logins7d: number;
  appOpens7d: number;
  tasksCreated7d: number;
  projectsCreated7d: number;
  goalsCreated7d: number;
  tasksFinished7d: number;
  tasksFinished30d: number;
}

export interface AdminUsersPage {
  total: number;
  nextCursor: string | null;
  items: AdminUserRow[];
}

export interface UserQuery {
  search?: string;
  joined?: "7d" | "30d";
  active?: "7d" | "30d" | "inactive_30d" | "never";
  access?: "free" | "pro" | "founder" | "friend" | "admin";
  sort?: "signup_desc" | "signup_asc" | "last_login_desc" | "last_active_desc";
  cursor?: string;
}

export interface FunnelStats {
  range: FunnelRange;
  since: string | null;
  funnel: FunnelStep[];
  sources: Array<{
    source: string;
    sessions: number;
    signups: number;
    checkouts: number;
    payments: number;
    conversionPct: number | null;
  }>;
  retention: { d1Pct: number | null; d7Pct: number | null; note?: string };
}

export interface RecentFeedback {
  items: FeedbackRow[];
  hasNext: boolean;
}

export interface BulkDeleteResult {
  deletedIds: string[];
  skipped: Array<{ targetUserId: string; reason: string }>;
}

export type ManualGrant = "PRO" | "FOUNDER" | "FRIEND";

interface AdminClientSlice {
  stats(input: { range?: string }): Promise<AdminStats>;
  activityStats(): Promise<ActivityStats>;
  users(input?: {
    search?: string;
    joined?: string;
    active?: string;
    access?: string;
    sort?: string;
    cursor?: string;
    limit?: number;
  }): Promise<AdminUsersPage>;
  grantAccess(input: { targetUserId: string; grant: ManualGrant }): Promise<void>;
  removeAccess(input: { targetUserId: string }): Promise<void>;
  deleteUser(input: { targetUserId: string }): Promise<void>;
  deleteUsers(input: { targetUserIds: string[] }): Promise<BulkDeleteResult>;
  funnel(input: { range?: string }): Promise<FunnelStats>;
  recentFeedback(input: {
    afterId?: string | null;
    limit?: number;
    statuses?: FeedbackStatus[];
  }): Promise<RecentFeedback>;
  updateFeedbackStatus(input: { id: string; status: FeedbackStatus }): Promise<FeedbackRow>;
  deleteFeedback(input: { id: string }): Promise<FeedbackRow>;
}

const rpc = (client as unknown as { admin: AdminClientSlice }).admin;

/** Unwrap an oRPC/HTTP error into its message (the webapp e.message parity). */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

class AdminStore {
  /** The session read the layout gate + pages share (one fetch). */
  user = $state<AuthUser | null>(null);
  userLoading = $state(true);

  async loadUser(): Promise<AuthUser | null> {
    if (this.user || !this.userLoading) return this.user;
    try {
      this.user = await fetchAuthUser();
    } catch {
      this.user = null;
    } finally {
      this.userLoading = false;
    }
    return this.user;
  }

  async stats(range: FunnelRange): Promise<AdminStats> {
    return await rpc.stats({ range });
  }

  async activityStats(): Promise<ActivityStats> {
    return await rpc.activityStats();
  }

  async users(query: UserQuery): Promise<AdminUsersPage> {
    return await rpc.users({ ...query, limit: 25 });
  }

  async funnel(range: FunnelRange): Promise<FunnelStats> {
    return await rpc.funnel({ range });
  }

  async recentFeedback(input: {
    afterId?: string | null;
    limit?: number;
    statuses?: FeedbackStatus[];
  }): Promise<RecentFeedback> {
    return await rpc.recentFeedback(input);
  }

  updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<FeedbackRow> {
    return rpc.updateFeedbackStatus({ id, status });
  }

  deleteFeedback(id: string): Promise<FeedbackRow> {
    return rpc.deleteFeedback({ id });
  }

  grantAccess(targetUserId: string, grant: ManualGrant): Promise<void> {
    return rpc.grantAccess({ targetUserId, grant });
  }

  removeAccess(targetUserId: string): Promise<void> {
    return rpc.removeAccess({ targetUserId });
  }

  deleteUser(targetUserId: string): Promise<void> {
    return rpc.deleteUser({ targetUserId });
  }

  deleteUsers(targetUserIds: string[]): Promise<BulkDeleteResult> {
    return rpc.deleteUsers({ targetUserIds });
  }
}

export const admin = new AdminStore();
