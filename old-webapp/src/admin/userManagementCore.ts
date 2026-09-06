import { FOUNDING_100_CAP, FOUNDER_MEMBERSHIP_WHERE } from "../billing/config";
import { stripe } from "../billing/stripe";

// Pure admin data core. Authorization stays in the Wasp wrapper; this module
// validates its own public inputs so a future caller cannot widen the contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

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

const DAY = 86_400_000;
const emailSelect = {
  where: { providerName: "email" },
  select: { providerUserId: true },
  take: 1,
};
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
};

function accessWhere(access?: UserAccessFilter) {
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

function validatedArgs(args: any) {
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
  // SAFETY: type assertion is safe — value is validated or from a trusted source.
  return { ...args, limit, sort: (args?.sort ?? "signup_desc") as UserSort };
}

export async function getAdminUsersCore(entities: Entities, rawArgs: unknown) {
  const args = validatedArgs(rawArgs);
  const now = new Date();
  const clauses: any[] = [accessWhere(args.access)];
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
  const where: any = { AND: clauses };
  const field = args.sort.startsWith("signup")
    ? "createdAt"
    : args.sort === "last_login_desc"
      ? "lastLoginAt"
      : "lastActiveAt";
  const direction = args.sort === "signup_asc" ? "asc" : "desc";
  const query: any = {
    where,
    select: userSelect,
    take: args.limit + 1,
    orderBy: [{ [field]: direction }, { id: direction }],
  };
  if (args.cursor)
    Object.assign(query, { cursor: { id: args.cursor }, skip: 1 });
  let rows: any[];
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
  const index = (items: any[]) =>
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

function assertTarget(actorId: string, target: any) {
  if (!target) throw new AdminUserMutationError("User not found.");
  if (target.id === actorId)
    throw new AdminUserMutationError("You cannot change your own account.");
  if (target.isAdmin)
    throw new AdminUserMutationError("Admin accounts cannot be changed here.");
}

export async function grantAdminUserAccessCore(
  entities: Entities,
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
  return tx(async (db: Entities) => {
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
  entities: Entities,
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
  return tx(async (db: Entities) => {
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
  entities: Entities,
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
    if (!stripe)
      throw new AdminUserDeletionBlockedError(
        "Could not verify recurring billing. Try again.",
      );
    try {
      const subscriptions = await stripe.subscriptions.list({
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
  return tx(async (db: Entities) => {
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
  entities: Entities,
  args: { actorUserId: string; targetUserId: string },
) {
  return deleteEligibleAdminUser(entities, args);
}

export async function deleteAdminUsersCore(
  entities: Entities,
  args: { actorUserId: string; targetUserIds: string[] },
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
      await deleteEligibleAdminUser(entities, {
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
