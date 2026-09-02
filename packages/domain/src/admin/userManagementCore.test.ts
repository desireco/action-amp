// S17 port of webapp/src/admin/userManagementCore.test.ts. The one deviation
// matches the core port: the deletion cores take `deps: { stripe }` (the
// webapp imported the singleton), so the Stripe-blocking behavior gets its
// own tests here.
import { describe, expect, it, vi } from "vitest";
import {
  getAdminUsersCore,
  grantAdminUserAccessCore,
  removeAdminUserAccessCore,
  deleteAdminUserCore,
  deleteAdminUsersCore,
  AdminUserInputError,
  AdminUserMutationError,
  AdminUserDeletionBlockedError,
  type UserManagementEntities,
} from "./userManagementCore.js";
import { mockContext } from "../test/mockContext.js";

function coreEntities() {
  const { entities } = mockContext();
  for (const name of ["LoginEvent", "AnalyticsEvent", "Task", "Project", "Goal"] as const)
    entities[name].groupBy.mockResolvedValue([]);
  entities.User.count.mockResolvedValue(1);
  entities.User.findMany.mockResolvedValue([]);
  entities.User.findUnique.mockResolvedValue({ id: "target", isAdmin: false, manualAccessGrant: null });
  // SAFETY: mock entities extend beyond the typed shape; the casts add
  // mock-only properties (MagicLoginChallenge + $transaction).
  entities.MagicLoginChallenge = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  } as never;
  // SAFETY: $transaction is not on the typed entities mock; as never adds it.
  (entities as { $transaction?: unknown }).$transaction = async (
    fn: (db: unknown) => Promise<void>,
  ) => fn(entities as unknown);
  return entities;
}

/** SAFETY: the EntitySpy bag satisfies the core slice at runtime. */
function asCore(entities: ReturnType<typeof coreEntities>): UserManagementEntities {
  return entities as unknown as UserManagementEntities;
}

describe("admin user directory core", () => {
  it("validates list input before reading", async () => {
    const entities = coreEntities();
    await expect(getAdminUsersCore(asCore(entities), { sort: "bad" })).rejects.toBeInstanceOf(AdminUserInputError);
    expect(entities.User.findMany).not.toHaveBeenCalled();
  });

  it("uses one page query and bounded aggregates, never per-row queries", async () => {
    const entities = coreEntities();
    entities.User.findMany.mockResolvedValue([
      {
        id: "u1",
        fullName: "A",
        createdAt: new Date(),
        lastLoginAt: null,
        lastActiveAt: null,
        plan: "FREE",
        planRenewsAt: null,
        isAdmin: false,
        manualAccessGrant: null,
        manualGrantAt: null,
        auth: { identities: [{ providerUserId: "a@example.com" }] },
      },
    ] as never);
    const page = await getAdminUsersCore(asCore(entities), {});
    expect(page.items[0]).toMatchObject({ email: "a@example.com", logins7d: 0, tasksFinished30d: 0 });
    expect(entities.User.findMany).toHaveBeenCalledTimes(1);
    expect(entities.LoginEvent.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: { in: ["u1"] } }) }));
  });

  it("combines access, search, and activity filters instead of replacing them", async () => {
    const entities = coreEntities();
    await getAdminUsersCore(asCore(entities), { access: "founder", search: "ada", active: "inactive_30d" });
    const call = entities.User.findMany.mock.calls[0][0] as { where: { AND: unknown[] } };
    expect(call.where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({ OR: expect.arrayContaining([{ plan: "FOUNDER" }]) }),
      expect.objectContaining({ OR: expect.any(Array) }),
    ]));
  });

  it("rejects an out-of-bounds page limit with the webapp message", async () => {
    const entities = coreEntities();
    await expect(getAdminUsersCore(asCore(entities), { limit: 51 })).rejects.toThrow(/Invalid user page limit/);
  });
});

describe("admin user mutations", () => {
  it("guards target before mutations and writes grant plus audit atomically", async () => {
    const entities = coreEntities();
    await grantAdminUserAccessCore(asCore(entities), { actorUserId: "actor", targetUserId: "target", grant: "FRIEND" });
    expect(entities.User.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ manualAccessGrant: "FRIEND" }) }));
    expect(entities.AdminUserAction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "GRANT_FRIEND" }) }));
  });

  it("rejects self and admin targets before mutation", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "actor", isAdmin: false, manualAccessGrant: null });
    await expect(removeAdminUserAccessCore(asCore(entities), { actorUserId: "actor", targetUserId: "actor" })).rejects.toBeInstanceOf(AdminUserMutationError);
    expect(entities.User.update).not.toHaveBeenCalled();
  });

  it("deletes without requiring an email to be typed after the UI confirmation", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "target", isAdmin: false, manualAccessGrant: "FRIEND", stripeCustomerId: null, auth: { identities: [{ providerUserId: "target@example.com" }] } });
    await deleteAdminUserCore(asCore(entities), { actorUserId: "actor", targetUserId: "target" });
    expect(entities.User.delete).toHaveBeenCalledWith({ where: { id: "target" } });
  });

  it("deletes an eligible local account only after writing its audit record", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "target", isAdmin: false, manualAccessGrant: "FRIEND", stripeCustomerId: null, auth: { identities: [{ providerUserId: "target@example.com" }] } });
    await deleteAdminUserCore(asCore(entities), { actorUserId: "actor", targetUserId: "target" });
    expect(entities.MagicLoginChallenge.deleteMany).toHaveBeenCalledWith({ where: { email: "target@example.com" } });
    expect(entities.AdminUserAction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DELETE_USER", previousGrant: "FRIEND" }) }));
    expect(entities.User.delete).toHaveBeenCalledWith({ where: { id: "target" } });
  });

  it("blocks a Stripe customer's deletion when no client is configured", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "target", isAdmin: false, manualAccessGrant: null, stripeCustomerId: "cus_123", auth: { identities: [{ providerUserId: "paid@example.com" }] } });
    await expect(
      deleteAdminUserCore(asCore(entities), { actorUserId: "actor", targetUserId: "target" }, { stripe: null }),
    ).rejects.toBeInstanceOf(AdminUserDeletionBlockedError);
    expect(entities.User.delete).not.toHaveBeenCalled();
  });

  it("blocks a Stripe customer with an active subscription (ported webapp check)", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "target", isAdmin: false, manualAccessGrant: null, stripeCustomerId: "cus_123", auth: { identities: [] } });
    await expect(
      deleteAdminUserCore(asCore(entities), { actorUserId: "actor", targetUserId: "target" }, {
        stripe: {
          subscriptions: {
            list: vi.fn().mockResolvedValue({ data: [{ status: "active" }] }),
          },
        },
      }),
    ).rejects.toThrow(/Active recurring billing must be resolved first/);
    expect(entities.User.delete).not.toHaveBeenCalled();
  });

  it("deletes a Stripe customer whose subscriptions are all inactive", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "target", isAdmin: false, manualAccessGrant: null, stripeCustomerId: "cus_123", auth: { identities: [{ providerUserId: "churned@example.com" }] } });
    const stripe = {
      subscriptions: {
        list: vi.fn().mockResolvedValue({ data: [{ status: "canceled" }] }),
      },
    };
    await deleteAdminUserCore(asCore(entities), { actorUserId: "actor", targetUserId: "target" }, { stripe });
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({ customer: "cus_123", status: "all", limit: 100 });
    expect(entities.User.delete).toHaveBeenCalledWith({ where: { id: "target" } });
  });

  it("does not let Friend grants consume a Founding-100 membership", async () => {
    const entities = coreEntities();
    await grantAdminUserAccessCore(asCore(entities), { actorUserId: "actor", targetUserId: "target", grant: "FRIEND" });
    expect(entities.User.count).not.toHaveBeenCalled();
  });

  it("re-checks the Founding-100 cap on a FOUNDER grant", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "target", isAdmin: false, manualAccessGrant: "PRO", stripeCustomerId: null, auth: { identities: [] } });
    entities.User.count.mockResolvedValue(100);
    await expect(
      grantAdminUserAccessCore(asCore(entities), { actorUserId: "actor", targetUserId: "target", grant: "FOUNDER" }),
    ).rejects.toThrow(/Founding 100 is full/);
    expect(entities.User.update).not.toHaveBeenCalled();
  });

  it("bulk deletes eligible accounts and reports protected accounts without stopping cleanup", async () => {
    const entities = coreEntities();
    entities.User.findUnique
      .mockResolvedValueOnce({ id: "first", isAdmin: false, manualAccessGrant: null, stripeCustomerId: null, auth: { identities: [] } })
      .mockResolvedValueOnce({ id: "admin", isAdmin: true, manualAccessGrant: null, stripeCustomerId: null, auth: { identities: [] } });
    const result = await deleteAdminUsersCore(asCore(entities), { actorUserId: "actor", targetUserIds: ["first", "admin"] });
    expect(result.deletedIds).toEqual(["first"]);
    expect(result.skipped).toEqual([{ targetUserId: "admin", reason: "Admin accounts cannot be changed here." }]);
  });

  it("bounds a bulk cleanup to one visible page", async () => {
    const entities = coreEntities();
    await expect(deleteAdminUsersCore(asCore(entities), { actorUserId: "actor", targetUserIds: Array.from({ length: 26 }, (_, index) => `u${index}`) })).rejects.toBeInstanceOf(AdminUserInputError);
  });

  it("fails the mutation cores closed when no transaction support rides the entities", async () => {
    const entities = coreEntities();
    (entities as { $transaction?: unknown }).$transaction = undefined;
    await expect(
      grantAdminUserAccessCore(asCore(entities), { actorUserId: "actor", targetUserId: "target", grant: "PRO" }),
    ).rejects.toThrow(/Admin transaction support is unavailable/);
  });
});
