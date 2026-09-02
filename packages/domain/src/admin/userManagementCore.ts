/**
 * Pure admin user-management core (S17) — ported from webapp/src/admin/
 * userManagementCore.ts. Authorization stays in the API wrapper (the
 * `isAdmin` gate); this module validates its own public inputs so a future
 * caller cannot widen the contract.
 *
 * PORT DEVIATION (the one signature change): webapp imported the Stripe
 * singleton directly; the seam must stay framework-free, so the deletion
 * cores take an optional `deps: { stripe }` argument instead. The webapp
 * semantics are preserved exactly: a missing client blocks deletions of
 * Stripe customers with "Could not verify recurring billing. Try again."
 */

import { FOUNDING_100_CAP, FOUNDER_MEMBERSHIP_WHERE } from "../billing/config.js";
import type {
  AdminUserActionDelegate,
  AdminUserFindManyArgs,
  AdminUserFindRow,
  AnalyticsEventWhereInput,
  GoalWhereInput,
  LoginEventGroupByArgs,
  MagicLoginChallengeDelegate,
  ProjectWhereInput,
  TaskWhereInput,
  User,
  UserAdminFindUniqueArgs,
  UserAdminGuardRow,
  UserCountArgs,
  UserFindUniqueArgs,
  UserIdCountRow,
  UserUpdateArgs,
  UserWhereInput,
} from "../db/index.js";

/** The entities slice the admin user cores call. */
export interface UserManagementEntities {
  User: {
    findMany(args: AdminUserFindManyArgs): Promise<AdminUserFindRow[]>;
    findUnique(
      args: UserAdminFindUniqueArgs | UserFindUniqueArgs,
    ): Promise<UserAdminGuardRow | User | null>;
    count(args?: UserCountArgs): Promise<number>;
    update(args: UserUpdateArgs): Promise<User>;
    delete(args: { where: { id: string } }): Promise<User>;
  };
  AdminUserAction: AdminUserActionDelegate;
  MagicLoginChallenge: MagicLoginChallengeDelegate;
  LoginEvent: {
    groupBy(args: LoginEventGroupByArgs): Promise<UserIdCountRow[]>;
  };
  AnalyticsEvent: {
    groupBy(args: {
      by: ["userId"];
      where?: AnalyticsEventWhereInput;
      _count: { _all: true };
    }): Promise<UserIdCountRow[]>;
  };
  Task: {
    groupBy(args: {
      by: ["userId"];
      where?: TaskWhereInput;
      _count: { _all: true };
    }): Promise<UserIdCountRow[]>;
  };
  Project: {
    groupBy(args: {
      by: ["userId"];
      where?: ProjectWhereInput;
      _count: { _all: true };
    }): Promise<UserIdCountRow[]>;
  };
  Goal: {
    groupBy(args: {
      by: ["userId"];
      where?: GoalWhereInput;
      _count: { _all: true };
    }): Promise<UserIdCountRow[]>;
  };
  /** Interactive transaction; absent → the mutation cores fail closed. */
  $transaction?: <T>(fn: (tx: UserManagementEntities) => Promise<T>) => Promise<T>;
}

export const USER_SORTS = [
  "signup_desc",
  "signup_asc",
  "last_login_desc",
  "last_active_desc",
] as const;
export const USER_ACCESS_FILTERS = [
  "free",
  "pro",
  "founder",
  "friend",
  "admin",
] as const;
export type UserSort = (typeof USER_SORTS)[number];
export type UserAccessFilter = (typeof USER_ACCESS_FILTERS)[number];
export type ManualGrant = "PRO" | "FOUNDER" | "FRIEND";

export class AdminUserInputError extends Error {
  name = "AdminUserInputError";
}
export class AdminUserMutationError extends Error {
  name = "AdminUserMutationError";
}
export class AdminUserDeletionBlockedError extends Error {
  name = "AdminUserDeletionBlockedError";
}

/**
 * The slice of the Stripe SDK the deletion billing check calls. The API layer
 * passes the real client (built from STRIPE_SECRET_KEY) or null — a null
 * client blocks deletions of Stripe customers, exactly like the webapp's
 * unset-singleton behavior.
 */
export interface AdminStripeClient {
  subscriptions: {
    list(args: {
      customer: string;
      status: "all";
      limit: number;
    }): Promise<{ data: Array<{ status: string }> }>;
  };
}

export interface AdminMutationDeps {
  stripe?: AdminStripeClient | null;
}

const DAY = 86_400_000;
const emailSelect = {
  where: { providerName: "email" },
  select: { providerUserId: true },
  take: 1,
} as const;
const userSelect = {
  id: true,
  fullName: true,
  firstName: true,
  createdAt: true,
  lastLoginAt: true,
  lastActiveAt: true,
  plan: true,
  planRenewsAt: true,
  isAdmin: true,
  manualAccessGrant: true,
  manualGrantAt: true,
  auth: { select: { identities: emailSelect } },
} as const satisfies AdminUserFindManyArgs["select"];

function accessWhere(access?: UserAccessFilter): UserWhereInput {
  switch (access) {
    case "admin":
      return { isAdmin: true };
    case "friend":
      return { manualAccessGrant: "FRIEND" };
    case "founder":
      return { OR: [{ manualAccessGrant: "FOUNDER" }, { plan: "FOUNDER" }] };
    case "pro":
      return { OR: [{ manualAccessGrant: "PRO" }, { plan: "PRO" }] };
    case "free":
      return { isAdmin: false, manualAccessGrant: null, plan: "FREE" };
    default:
      return {};
  }
}

type AdminUsersArgs = {
  search?: string;
  joined?: "7d" | "30d";
  active?: "7d" | "30d" | "inactive_30d" | "never";
  access?: UserAccessFilter;
  sort?: UserSort;
  cursor?: string | null;
  limit?: number;
};

function validatedArgs(rawArgs: unknown): Required<Pick<AdminUsersArgs, "limit" | "sort">> & AdminUsersArgs {
  // SAFETY: the core validates every field it reads off the raw input (the
  // webapp widened it with `any`; the checks below ARE the contract).
  const args = (rawArgs ?? {}) as unknown as AdminUsersArgs;
  const limit = args?.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new AdminUserInputError("Invalid user page limit.");
  if (args?.sort && !USER_SORTS.includes(args.sort))
    throw new AdminUserInputError("Invalid user sort.");
  if (args?.access && !USER_ACCESS_FILTERS.includes(args.access))
    throw new AdminUserInputError("Invalid access filter.");
  if (args?.joined && !["7d", "30d"].includes(args.joined))
    throw new AdminUserInputError("Invalid joined filter.");
  if (
    args?.active &&
    !["7d", "30d", "inactive_30d", "never"].includes(args.active)
  )
    throw new AdminUserInputError("Invalid active filter.");
  if (
    args?.cursor !== undefined &&
    (typeof args.cursor !== "string" || !args.cursor)
  )
    throw new AdminUserInputError("Invalid user cursor.");
  return { ...args, limit, sort: (args?.sort ?? "signup_desc") as UserSort };
}

export async function getAdminUsersCore(entities: UserManagementEntities, rawArgs: unknown) {
  const args = validatedArgs(rawArgs);
  const now = new Date();
  const clauses: UserWhereInput[] = [accessWhere(args.access)];
  if (args.search?.trim())
    clauses.push({
      OR: [
        { fullName: { contains: args.search.trim(), mode: "insensitive" } },
        {
          auth: {
            identities: {
              some: {
                providerName: "email",
                providerUserId: {
                  contains: args.search.trim(),
                  mode: "insensitive",
                },
              },
            },
          },
        },
      ],
    });
  if (args.joined)
    clauses.push({
      createdAt: {
        gte: new Date(now.getTime() - (args.joined === "7d" ? 7 : 30) * DAY),
      },
    });
  if (args.active === "never") clauses.push({ lastActiveAt: null });
  if (args.active === "inactive_30d")
    clauses.push({
      OR: [
        { lastActiveAt: null },
        { lastActiveAt: { lt: new Date(now.getTime() - 30 * DAY) } },
      ],
    });
  if (args.active === "7d" || args.active === "30d")
    clauses.push({
      lastActiveAt: {
        gte: new Date(now.getTime() - (args.active === "7d" ? 7 : 30) * DAY),
      },
    });
  const where: UserWhereInput = { AND: clauses };
  const field = args.sort.startsWith("signup")
    ? "createdAt"
    : args.sort === "last_login_desc"
      ? "lastLoginAt"
      : "lastActiveAt";
  const direction = args.sort === "signup_asc" ? "asc" : "desc";
  const query: AdminUserFindManyArgs = {
    where,
    select: userSelect,
    take: args.limit + 1,
    orderBy: [{ [field]: direction }, { id: direction }] as AdminUserFindManyArgs["orderBy"],
  };
  if (args.cursor)
    Object.assign(query, { cursor: { id: args.cursor }, skip: 1 });
  let rows: AdminUserFindRow[];
  try {
    rows = await entities.User.findMany(query);
  } catch {
    throw new AdminUserInputError("Stale or invalid user cursor.");
  }
  const hasNext = rows.length > args.limit;
  rows = hasNext ? rows.slice(0, args.limit) : rows;
  const ids = rows.map((row) => row.id);
  const since7 = new Date(now.getTime() - 7 * DAY),
    since30 = new Date(now.getTime() - 30 * DAY);
  const [
    total,
    logins,
    opens,
    taskCreated,
    projectCreated,
    goalCreated,
    finished7,
    finished30,
  ] = await Promise.all([
    entities.User.count({ where }),
    entities.LoginEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, createdAt: { gte: since7 } },
      _count: { _all: true },
    }),
    entities.AnalyticsEvent.groupBy({
      by: ["userId"],
      where: {
        userId: { in: ids },
        name: "APP_OPENED",
        occurredAt: { gte: since7 },
      },
      _count: { _all: true },
    }),
    entities.Task.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, createdAt: { gte: since7 } },
      _count: { _all: true },
    }),
    entities.Project.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, createdAt: { gte: since7 } },
      _count: { _all: true },
    }),
    entities.Goal.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, createdAt: { gte: since7 } },
      _count: { _all: true },
    }),
    entities.Task.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, completedAt: { gte: since7 } },
      _count: { _all: true },
    }),
    entities.Task.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, completedAt: { gte: since30 } },
      _count: { _all: true },
    }),
  ]);
  const index = (items: UserIdCountRow[]) =>
    new Map(items.map((x) => [x.userId, x._count._all]));
  const [loginMap, openMap, taskMap, projectMap, goalMap, done7Map, done30Map] =
    [
      logins,
      opens,
      taskCreated,
      projectCreated,
      goalCreated,
      finished7,
      finished30,
    ].map(index);
  return {
    total,
    nextCursor: hasNext ? (rows.at(-1)?.id ?? null) : null,
    items: rows.map((u) => ({
      id: u.id,
      name: u.fullName,
      email: u.auth?.identities?.[0]?.providerUserId ?? null,
      signedUpAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      lastActiveAt: u.lastActiveAt,
      billedPlan: u.plan,
      manualAccessGrant: u.manualAccessGrant,
      manualGrantAt: u.manualGrantAt,
      isAdmin: u.isAdmin,
      logins7d: loginMap.get(u.id) ?? 0,
      appOpens7d: openMap.get(u.id) ?? 0,
      tasksCreated7d: taskMap.get(u.id) ?? 0,
      projectsCreated7d: projectMap.get(u.id) ?? 0,
      goalsCreated7d: goalMap.get(u.id) ?? 0,
      tasksFinished7d: done7Map.get(u.id) ?? 0,
      tasksFinished30d: done30Map.get(u.id) ?? 0,
    })),
  };
}

function assertTarget(
  actorId: string,
  target: UserAdminGuardRow | null,
): asserts target is UserAdminGuardRow {
  if (!target) throw new AdminUserMutationError("User not found.");
  if (target.id === actorId)
    throw new AdminUserMutationError("You cannot change your own account.");
  if (target.isAdmin)
    throw new AdminUserMutationError("Admin accounts cannot be changed here.");
}

export async function grantAdminUserAccessCore(
  entities: UserManagementEntities,
  args: { actorUserId: string; targetUserId: string; grant: ManualGrant },
) {
  if (!(["PRO", "FOUNDER", "FRIEND"] as const).includes(args.grant))
    throw new AdminUserInputError("Invalid manual access grant.");
  const target = await entities.User.findUnique({
    where: { id: args.targetUserId },
    select: { id: true, isAdmin: true, manualAccessGrant: true },
  });
  assertTarget(args.actorUserId, target);
  if (args.grant === "FOUNDER") {
    const claimed = await entities.User.count({
      where: FOUNDER_MEMBERSHIP_WHERE,
    });
    if (target.manualAccessGrant !== "FOUNDER" && claimed >= FOUNDING_100_CAP)
      throw new AdminUserMutationError("Founding 100 is full.");
  }
  const tx = entities.$transaction;
  if (!tx)
    throw new AdminUserMutationError(
      "Admin transaction support is unavailable.",
    );
  return tx(async (db) => {
    await db.User.update({
      where: { id: target.id },
      data: { manualAccessGrant: args.grant, manualGrantAt: new Date() },
    });
    await db.AdminUserAction.create({
      data: {
        actorUserId: args.actorUserId,
        targetUserId: target.id,
        action: `GRANT_${args.grant}`,
        previousGrant: target.manualAccessGrant,
        nextGrant: args.grant,
      },
    });
  });
}

export async function removeAdminUserAccessCore(
  entities: UserManagementEntities,
  args: { actorUserId: string; targetUserId: string },
) {
  const target = await entities.User.findUnique({
    where: { id: args.targetUserId },
    select: { id: true, isAdmin: true, manualAccessGrant: true },
  });
  assertTarget(args.actorUserId, target);
  const tx = entities.$transaction;
  if (!tx)
    throw new AdminUserMutationError(
      "Admin transaction support is unavailable.",
    );
  return tx(async (db) => {
    await db.User.update({
      where: { id: target.id },
      data: { manualAccessGrant: null, manualGrantAt: null },
    });
    await db.AdminUserAction.create({
      data: {
        actorUserId: args.actorUserId,
        targetUserId: target.id,
        action: "REMOVE_MANUAL_GRANT",
        previousGrant: target.manualAccessGrant,
        nextGrant: null,
      },
    });
  });
}

async function deleteEligibleAdminUser(
  entities: UserManagementEntities,
  deps: AdminMutationDeps,
  args: { actorUserId: string; targetUserId: string },
) {
  const target = await entities.User.findUnique({
    where: { id: args.targetUserId },
    select: {
      id: true,
      isAdmin: true,
      manualAccessGrant: true,
      stripeCustomerId: true,
      auth: { select: { identities: emailSelect } },
    },
  });
  assertTarget(args.actorUserId, target);
  const email = target.auth?.identities?.[0]?.providerUserId
    ?.trim()
    .toLowerCase();
  if (target.stripeCustomerId) {
    // An unset client counts as "could not verify" — same blocked outcome as a failed lookup.
    if (!deps.stripe)
      throw new AdminUserDeletionBlockedError(
        "Could not verify recurring billing. Try again.",
      );
    try {
      const subscriptions = await deps.stripe.subscriptions.list({
        customer: target.stripeCustomerId,
        status: "all",
        limit: 100,
      });
      if (
        subscriptions.data.some((s) =>
          ["active", "trialing", "past_due", "unpaid"].includes(s.status),
        )
      )
        throw new AdminUserDeletionBlockedError(
          "Active recurring billing must be resolved first.",
        );
    } catch (error) {
      if (error instanceof AdminUserDeletionBlockedError) throw error;
      throw new AdminUserDeletionBlockedError(
        "Could not verify recurring billing. Try again.",
      );
    }
  }
  const tx = entities.$transaction;
  if (!tx)
    throw new AdminUserMutationError(
      "Admin transaction support is unavailable.",
    );
  return tx(async (db) => {
    if (email) await db.MagicLoginChallenge.deleteMany({ where: { email } });
    await db.AdminUserAction.create({
      data: {
        actorUserId: args.actorUserId,
        targetUserId: target.id,
        action: "DELETE_USER",
        previousGrant: target.manualAccessGrant,
        nextGrant: null,
      },
    });
    await db.User.delete({ where: { id: target.id } });
  });
}

export async function deleteAdminUserCore(
  entities: UserManagementEntities,
  args: { actorUserId: string; targetUserId: string },
  deps: AdminMutationDeps = {},
) {
  return deleteEligibleAdminUser(entities, deps, args);
}

export async function deleteAdminUsersCore(
  entities: UserManagementEntities,
  args: { actorUserId: string; targetUserIds: string[] },
  deps: AdminMutationDeps = {},
) {
  const ids = [...new Set(args.targetUserIds ?? [])];
  if (
    !ids.length ||
    ids.length > 25 ||
    ids.some((id) => typeof id !== "string" || !id)
  ) {
    throw new AdminUserInputError("Select between 1 and 25 users to delete.");
  }
  const deletedIds: string[] = [];
  const skipped: Array<{ targetUserId: string; reason: string }> = [];
  for (const targetUserId of ids) {
    try {
      await deleteEligibleAdminUser(entities, deps, {
        actorUserId: args.actorUserId,
        targetUserId,
      });
      deletedIds.push(targetUserId);
    } catch (error) {
      skipped.push({
        targetUserId,
        reason:
          error instanceof Error
            ? error.message
            : "Could not delete this account.",
      });
    }
  }
  return { deletedIds, skipped };
}
