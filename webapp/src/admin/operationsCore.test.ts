// @vitest-environment node
// Pure DB cores (no DOM, no wasp/server import) — node environment.
import { describe, it, expect } from "vitest";
import {
  getAdminStatsCore,
  getRecentFeedbackCore,
  FEEDBACK_STATUSES,
} from "./operationsCore";
import { mockContext } from "../test/mockContext";

function asStats(entities: ReturnType<typeof mockContext>["entities"]) {
  const spies = {
    User: entities.User,
    Task: entities.Task,
    Payment: entities.Payment,
    AnalyticsEvent: entities.AnalyticsEvent,
    AnalyticsSession: entities.AnalyticsSession,
    Feedback: entities.Feedback,
  };
  // SAFETY: EntitySpy vi.fn()s satisfy the read-only delegate slice at runtime.
  return spies as Parameters<typeof getAdminStatsCore>[0];
}

function asFeedback(entities: ReturnType<typeof mockContext>["entities"]) {
  // SAFETY: EntitySpy vi.fn()s satisfy the read-only delegate slice at runtime.
  return { Feedback: entities.Feedback } as Parameters<
    typeof getRecentFeedbackCore
  >[0];
}

describe("getAdminStatsCore", () => {
  it("returns zeroed counts when the DB is empty", async () => {
    const { entities } = mockContext();
    // Default mock: count resolves undefined; groupBy resolves []. Force zeros.
    entities.User.count.mockResolvedValue(0);
    entities.Task.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);

    const stats = await getAdminStatsCore(asStats(entities));

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

    const stats = await getAdminStatsCore(asStats(entities));

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

    await getAdminStatsCore(asStats(entities));

    // 9 calls: legacy windows plus selected-range signup and active counts.
    expect(entities.User.count).toHaveBeenCalledTimes(9);
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

    await getAdminStatsCore(asStats(entities));

    const calls = entities.User.count.mock.calls.map((c) => c[0]);
    const active7d = calls.find((c) => c?.where?.lastActiveAt?.gte);
    expect(active7d).toBeTruthy();
  });

  it("counts tasks created in 7d and completed in 7d separately", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);

    // Task.count calls: legacy 7d/total windows plus selected range activity.
    entities.Task.count
      .mockResolvedValueOnce(10) // created7d
      .mockResolvedValueOnce(4) // completed7d
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(10) // selected created
      .mockResolvedValueOnce(4); // selected completed

    const stats = await getAdminStatsCore(asStats(entities));

    expect(stats.tasks.created7d).toBe(10);
    expect(stats.tasks.completed7d).toBe(4);
    expect(stats.tasks.total).toBe(100);
  });

  it("counts unique active users by mobile, tablet, desktop, and window", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(0);
    entities.Task.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);
    const now = Date.now();
    entities.AnalyticsSession.findMany.mockResolvedValueOnce([
      {
        deviceClass: "mobile",
        events: [
          { userId: "mobile-user", occurredAt: new Date(now - 2 * 86_400_000) },
          { userId: "mobile-user", occurredAt: new Date(now - 3 * 86_400_000) },
        ],
      },
      {
        deviceClass: "tablet",
        events: [
          { userId: "tablet-user", occurredAt: new Date(now - 8 * 86_400_000) },
        ],
      },
      {
        deviceClass: "desktop",
        events: [
          { userId: "shared-user", occurredAt: new Date(now - 1 * 86_400_000) },
        ],
      },
      {
        deviceClass: null,
        events: [
          {
            userId: "unknown-user",
            occurredAt: new Date(now - 1 * 86_400_000),
          },
        ],
      },
      {
        deviceClass: "mobile",
        events: [
          { userId: "shared-user", occurredAt: new Date(now - 1 * 86_400_000) },
        ],
      },
    ]);

    const stats = await getAdminStatsCore(asStats(entities));

    expect(stats.users.deviceActivity.sevenDays).toEqual({
      mobile: 2,
      tablet: 0,
      desktop: 1,
      unknown: 1,
    });
    expect(stats.users.deviceActivity.thirtyDays).toEqual({
      mobile: 2,
      tablet: 1,
      desktop: 1,
      unknown: 1,
    });
  });
});

describe("getRecentFeedbackCore", () => {
  const row = (id: string): import("./operationsCore").FeedbackRow => ({
    id,
    shortId: id.toUpperCase(),
    createdAt: new Date("2026-07-22T10:00:00Z"),
    updatedAt: new Date("2026-07-22T10:00:00Z"),
    deletedAt: null,
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
    viewport: null,
    timezone: null,
  });

  it("first page: no afterId, take = limit+1, hasNext true when more exist", async () => {
    const { entities } = mockContext();
    // 11 rows returned (limit=10 + 1) → hasNext true, items trimmed to 10.
    entities.Feedback.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => row(`r${i}`)),
    );

    const page = await getRecentFeedbackCore(asFeedback(entities), {
      afterId: null,
      limit: 10,
    });

    expect(page.items).toHaveLength(10);
    expect(page.hasNext).toBe(true);
    expect(entities.Feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(entities.Feedback.findMany.mock.calls[0][0]).not.toHaveProperty(
      "cursor",
    );
  });

  it("first page: hasNext false when fewer than limit+1 rows", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([row("a"), row("b")]);

    const page = await getRecentFeedbackCore(asFeedback(entities), {
      afterId: null,
      limit: 10,
    });

    expect(page.items).toHaveLength(2);
    expect(page.hasNext).toBe(false);
  });

  it("cursor page: afterId present → skip 1 + cursor", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([row("c")]);

    const page = await getRecentFeedbackCore(asFeedback(entities), {
      afterId: "b",
      limit: 10,
    });

    expect(entities.Feedback.findMany.mock.calls[0][0]).toMatchObject({
      skip: 1,
      cursor: { id: "b" },
      take: 11,
    });
    expect(page.hasNext).toBe(false);
  });

  it("excludes soft-deleted rows (where deletedAt: null)", async () => {
    const { entities } = mockContext();
    entities.Feedback.findMany.mockResolvedValue([row("a")]);

    await getRecentFeedbackCore(asFeedback(entities), {
      afterId: null,
      limit: 10,
    });

    expect(entities.Feedback.findMany.mock.calls[0][0]).toMatchObject({
      where: { deletedAt: null },
    });
  });
});
