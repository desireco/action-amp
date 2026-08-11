import { describe, expect, it, vi } from "vitest";
import { getAdminUsersCore, grantAdminUserAccessCore, removeAdminUserAccessCore, deleteAdminUserCore, AdminUserInputError, AdminUserMutationError, AdminUserDeletionBlockedError } from "./userManagementCore";
import { mockContext } from "../test/mockContext";

function coreEntities() {
  const { entities } = mockContext();
  for (const name of ["LoginEvent", "AnalyticsEvent", "Task", "Project", "Goal"] as const) entities[name].groupBy.mockResolvedValue([]);
  entities.User.count.mockResolvedValue(1);
  entities.User.findMany.mockResolvedValue([]);
  entities.User.findUnique.mockResolvedValue({ id: "target", isAdmin: false, manualAccessGrant: null });
  entities.MagicLoginChallenge = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } as any;
  (entities as any).$transaction = async (fn: any) => fn(entities);
  return entities as any;
}

describe("admin user directory core", () => {
  it("validates list input before reading", async () => {
    const entities = coreEntities();
    await expect(getAdminUsersCore(entities, { sort: "bad" })).rejects.toBeInstanceOf(AdminUserInputError);
    expect(entities.User.findMany).not.toHaveBeenCalled();
  });

  it("uses one page query and bounded aggregates, never per-row queries", async () => {
    const entities = coreEntities();
    entities.User.findMany.mockResolvedValue([{ id: "u1", fullName: "A", createdAt: new Date(), lastLoginAt: null, lastActiveAt: null, plan: "FREE", planRenewsAt: null, isAdmin: false, manualAccessGrant: null, manualGrantAt: null, auth: { identities: [{ providerUserId: "a@example.com" }] } }]);
    const page = await getAdminUsersCore(entities, {});
    expect(page.items[0]).toMatchObject({ email: "a@example.com", logins7d: 0, tasksFinished30d: 0 });
    expect(entities.User.findMany).toHaveBeenCalledTimes(1);
    expect(entities.LoginEvent.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: { in: ["u1"] } }) }));
  });

  it("combines access, search, and activity filters instead of replacing them", async () => {
    const entities = coreEntities();
    await getAdminUsersCore(entities, { access: "founder", search: "ada", active: "inactive_30d" });
    const where = entities.User.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({ OR: expect.arrayContaining([{ plan: "FOUNDER" }]) }),
      expect.objectContaining({ OR: expect.any(Array) }),
    ]));
  });
});

describe("admin user mutations", () => {
  it("guards target before mutations and writes grant plus audit atomically", async () => {
    const entities = coreEntities();
    await grantAdminUserAccessCore(entities, { actorUserId: "actor", targetUserId: "target", grant: "FRIEND" });
    expect(entities.User.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ manualAccessGrant: "FRIEND" }) }));
    expect(entities.AdminUserAction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "GRANT_FRIEND" }) }));
  });

  it("rejects self and admin targets before mutation", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "actor", isAdmin: false, manualAccessGrant: null });
    await expect(removeAdminUserAccessCore(entities, { actorUserId: "actor", targetUserId: "actor" })).rejects.toBeInstanceOf(AdminUserMutationError);
    expect(entities.User.update).not.toHaveBeenCalled();
  });

  it("rejects a mismatched deletion confirmation before Stripe or local deletion", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "target", isAdmin: false, manualAccessGrant: "FRIEND", stripeCustomerId: null, auth: { identities: [{ providerUserId: "target@example.com" }] } });
    await expect(deleteAdminUserCore(entities, { actorUserId: "actor", targetUserId: "target", confirmedEmail: "wrong@example.com" })).rejects.toBeInstanceOf(AdminUserDeletionBlockedError);
    expect(entities.User.delete).not.toHaveBeenCalled();
  });

  it("deletes an eligible local account only after writing its audit record", async () => {
    const entities = coreEntities();
    entities.User.findUnique.mockResolvedValueOnce({ id: "target", isAdmin: false, manualAccessGrant: "FRIEND", stripeCustomerId: null, auth: { identities: [{ providerUserId: "target@example.com" }] } });
    await deleteAdminUserCore(entities, { actorUserId: "actor", targetUserId: "target", confirmedEmail: "target@example.com" });
    expect(entities.MagicLoginChallenge.deleteMany).toHaveBeenCalledWith({ where: { email: "target@example.com" } });
    expect(entities.AdminUserAction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "DELETE_USER", previousGrant: "FRIEND" }) }));
    expect(entities.User.delete).toHaveBeenCalledWith({ where: { id: "target" } });
  });

  it("does not let Friend grants consume a Founding-100 membership", async () => {
    const entities = coreEntities();
    await grantAdminUserAccessCore(entities, { actorUserId: "actor", targetUserId: "target", grant: "FRIEND" });
    expect(entities.User.count).not.toHaveBeenCalled();
  });
});
