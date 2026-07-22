// @vitest-environment node
// Pure DB cores (no DOM, no wasp/server import) — node environment.
import { describe, it, expect } from "vitest";
import { getAdminStatsCore, getRecentFeedbackCore, FEEDBACK_STATUSES } from "./operationsCore";
import { mockContext } from "../test/mockContext";

describe("getAdminStatsCore", () => {
  it("returns zeroed counts when the DB is empty", async () => {
    const { entities } = mockContext();
    // Default mock: count resolves undefined; groupBy resolves []. Force zeros.
    entities.User.count.mockResolvedValue(0);
    entities.Task.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);

    const stats = await getAdminStatsCore(entities);

    expect(stats.users.total).toBe(0);
    expect(stats.users.signedUpToday).toBe(0);
    expect(stats.users.activeToday).toBe(0);
    expect(stats.tasks.created7d).toBe(0);
    expect(stats.tasks.completed7d).toBe(0);
    expect(stats.feedback.total).toBe(0);
    for (const s of FEEDBACK_STATUSES) {
      expect(stats.feedback.byStatus[s]).toBe(0);
    }
  });

  it("folds a groupBy result into byStatus, zero-filling missing statuses", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(0);
    entities.Task.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(2);
    entities.Feedback.groupBy.mockResolvedValue([
      { status: "OPEN", _count: { _all: 1 } },
      { status: "RESOLVED", _count: { _all: 1 } },
    ]);

    const stats = await getAdminStatsCore(entities);

    expect(stats.feedback.byStatus.OPEN).toBe(1);
    expect(stats.feedback.byStatus.RESOLVED).toBe(1);
    expect(stats.feedback.byStatus.IN_PROGRESS).toBe(0);
    expect(stats.feedback.byStatus.CLOSED).toBe(0);
    expect(stats.feedback.total).toBe(2);
  });

  it("queries User.count with a createdAt >= window for signups", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(5);
    entities.Task.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);

    await getAdminStatsCore(entities);

    // 7 calls: total, today, 7d, 30d (signups) + today, 7d, 30d (active)
    expect(entities.User.count).toHaveBeenCalledTimes(7);
    // The signedUp7d call includes a createdAt gte filter.
    const calls = entities.User.count.mock.calls.map((c) => c[0]);
    const signup7d = calls.find(
      (c) => c?.where?.createdAt?.gte && !c?.where?.lastActiveAt,
    );
    expect(signup7d).toBeTruthy();
    expect(signup7d.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("queries User.count with a lastActiveAt >= window for active users", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(3);
    entities.Task.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);

    await getAdminStatsCore(entities);

    const calls = entities.User.count.mock.calls.map((c) => c[0]);
    const active7d = calls.find((c) => c?.where?.lastActiveAt?.gte);
    expect(active7d).toBeTruthy();
  });

  it("counts tasks created in 7d and completed in 7d separately", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);

    // 3 Task.count calls: created7d, completed7d, total.
    entities.Task.count
      .mockResolvedValueOnce(10) // created7d
      .mockResolvedValueOnce(4)  // completed7d
      .mockResolvedValueOnce(100); // total

    const stats = await getAdminStatsCore(entities);

    expect(stats.tasks.created7d).toBe(10);
    expect(stats.tasks.completed7d).toBe(4);
    expect(stats.tasks.total).toBe(100);
  });
});

describe("getRecentFeedbackCore", () => {
  const row = (id: string): import("./operationsCore").FeedbackRow => ({
    id,
    shortId: id.toUpperCase(),
    createdAt: new Date("2026-07-22T10:00:00Z"),
    updatedAt: new Date("2026-07-22T10:00:00Z"),
    message: "m",
    status: "OPEN",
    userId: "u",
    userName: null,
    userEmail: null,
    route: null,
    section: null,
    lensId: null,
    lensName: null,
    lensColor: null,
    userAgent: null,
  });

  it("first page: no afterId, take = limit+1, hasNext true when more exist", async () => {
    const { entities } = mockContext();
    // 11 rows returned (limit=10 + 1) → hasNext true, items trimmed to 10.
    entities.Feedback.findMany.mockResolvedValue(Array.from({ length: 11 }, (_, i) => row(`r${i}`)));

    const page = await getRecentFeedbackCore(entities, { afterId: null, limit: 10 });

    expect(page.items).toHaveLength(10);
    expect(page.hasNext).toBe(true);
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 11, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    );
    expect(entities.Feedback.findMany.mock.calls[0][0]).not.toHaveProperty("cursor");
  });

  it("first page: hasNext false when fewer than limit+1 rows", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([row("a"), row("b")]);

    const page = await getRecentFeedbackCore(entities, { afterId: null, limit: 10 });

    expect(page.items).toHaveLength(2);
    expect(page.hasNext).toBe(false);
  });

  it("cursor page: afterId present → skip 1 + cursor", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([row("c")]);

    const page = await getRecentFeedbackCore(entities, { afterId: "b", limit: 10 });

    expect(entities.Feedback.findMany.mock.calls[0][0]).toMatchObject({
      skip: 1,
      cursor: { id: "b" },
      take: 11,
    });
    expect(page.hasNext).toBe(false);
  });
});
