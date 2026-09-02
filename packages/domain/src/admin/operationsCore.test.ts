// @vitest-environment node
// S17 port of webapp/src/admin/operationsCore.test.ts — pure DB cores (no
// DOM, no framework import); node environment.
import { describe, it, expect } from "vitest";
import {
  getAdminStatsCore,
  getRecentFeedbackCore,
  getActivityStatsCore,
  startOfISOWeek,
} from "./operationsCore.js";
import { FEEDBACK_STATUSES } from "../feedback/operationsCore.js";
import { mockContext } from "../test/mockContext.js";

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
    entities.AnalyticsSession.findMany.mockResolvedValue([]);

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
    entities.AnalyticsSession.findMany.mockResolvedValue([]);

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
    entities.AnalyticsSession.findMany.mockResolvedValue([]);

    await getAdminStatsCore(asStats(entities));

    // 9 calls: legacy windows plus selected-range signup and active counts.
    expect(entities.User.count).toHaveBeenCalledTimes(9);
    // The signedUp7d call includes a createdAt gte filter.
    type CountCall = { where?: { createdAt?: { gte?: Date }; lastActiveAt?: { gte?: Date } } };
    const calls = entities.User.count.mock.calls.map((c: CountCall[]) => c[0]);
    const signup7d = calls.find(
      (c) => c?.where?.createdAt?.gte && !c?.where?.lastActiveAt,
    );
    expect(signup7d).toBeTruthy();
    expect(signup7d?.where?.createdAt?.gte).toBeInstanceOf(Date);
  });

  it("queries User.count with a lastActiveAt >= window for active users", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(3);
    entities.Task.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);
    entities.AnalyticsSession.findMany.mockResolvedValue([]);

    await getAdminStatsCore(asStats(entities));

    type CountCall = { where?: { lastActiveAt?: { gte?: Date } } };
    const calls = entities.User.count.mock.calls.map((c: CountCall[]) => c[0]);
    const active7d = calls.find((c) => c?.where?.lastActiveAt?.gte);
    expect(active7d).toBeTruthy();
  });

  it("counts tasks created in 7d and completed in 7d separately", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);
    entities.AnalyticsSession.findMany.mockResolvedValue([]);

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
        id: "s1",
        deviceClass: "mobile",
        referrerHost: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        events: [
          { name: "APP_OPENED", userId: "mobile-user", occurredAt: new Date(now - 2 * 86_400_000) },
          { name: "APP_OPENED", userId: "mobile-user", occurredAt: new Date(now - 3 * 86_400_000) },
        ],
      },
      {
        id: "s2",
        deviceClass: "tablet",
        referrerHost: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        events: [
          { name: "APP_OPENED", userId: "tablet-user", occurredAt: new Date(now - 8 * 86_400_000) },
        ],
      },
      {
        id: "s3",
        deviceClass: "desktop",
        referrerHost: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        events: [
          { name: "APP_OPENED", userId: "shared-user", occurredAt: new Date(now - 1 * 86_400_000) },
        ],
      },
      {
        id: "s4",
        deviceClass: null,
        referrerHost: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        events: [
          {
            name: "APP_OPENED",
            userId: "unknown-user",
            occurredAt: new Date(now - 1 * 86_400_000),
          },
        ],
      },
      {
        id: "s5",
        deviceClass: "mobile",
        referrerHost: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        events: [
          { name: "APP_OPENED", userId: "shared-user", occurredAt: new Date(now - 1 * 86_400_000) },
        ],
      },
    ] as never);

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

  it("degrades payments + analytics to zeros when the delegates are absent", async () => {
    const { entities } = mockContext();
    entities.User.count.mockResolvedValue(2);
    entities.Task.count.mockResolvedValue(0);
    entities.Feedback.count.mockResolvedValue(0);
    entities.Feedback.groupBy.mockResolvedValue([]);
    entities.AnalyticsSession.findMany.mockResolvedValue([]);
    const spies = asStats(entities);
    // SAFETY: the optional delegates are removed to prove the degradation
    // (AnalyticsSession absent → the funnel degrades to [] too).
    const { Payment: _p, AnalyticsEvent: _a, AnalyticsSession: _s, ...rest } =
      spies as unknown as Record<string, never>;

    const stats = await getAdminStatsCore(
      rest as unknown as Parameters<typeof getAdminStatsCore>[0],
    );

    expect(stats.payments.confirmed).toBe(0);
    expect(stats.payments.checkoutToPaidPct).toBeNull();
    expect(stats.activity.captures).toBe(0);
    expect(stats.activity.triageCompleted).toBe(0);
    expect(stats.funnel).toEqual([]);
  });
});

describe("getRecentFeedbackCore", () => {
  const row = (id: string): import("./operationsCore.js").FeedbackRow => ({
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

function asActivity(entities: ReturnType<typeof mockContext>["entities"]) {
  const spies = {
    User: entities.User,
    Task: entities.Task,
    AnalyticsEvent: entities.AnalyticsEvent,
  };
  // SAFETY: EntitySpy vi.fn()s satisfy the read-only delegate slice at runtime.
  return spies as Parameters<typeof getActivityStatsCore>[0];
}

describe("startOfISOWeek", () => {
  it("returns the same instant for Monday 00:00 UTC", () => {
    expect(startOfISOWeek(new Date("2026-08-31T00:00:00.000Z")).toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("maps Sunday 23:59:59.999 UTC to the previous Monday", () => {
    expect(startOfISOWeek(new Date("2026-09-06T23:59:59.999Z")).toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("maps a midweek Thursday back to its Monday", () => {
    expect(startOfISOWeek(new Date("2026-09-03T12:00:00Z")).toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("keeps a week spanning a year boundary Monday-derived", () => {
    // Friday Jan 1 2027 belongs to the week starting Monday Dec 28 2026.
    expect(startOfISOWeek(new Date("2027-01-01T05:00:00Z")).toISOString()).toBe("2026-12-28T00:00:00.000Z");
  });
});

describe("getActivityStatsCore", () => {
  const NOW = new Date("2026-09-03T12:00:00Z"); // Thursday

  function zeroMocks(entities: ReturnType<typeof mockContext>["entities"]) {
    entities.User.count.mockResolvedValue(0);
    entities.Task.count.mockResolvedValue(0);
    entities.AnalyticsEvent.count.mockResolvedValue(0);
  }

  it("returns 8 full ISO trend weeks, oldest → newest, last marked current", async () => {
    const { entities } = mockContext();
    zeroMocks(entities);

    const stats = await getActivityStatsCore(asActivity(entities), { now: NOW });

    expect(stats.weeks).toHaveLength(8);
    expect(stats.weeks[0].weekStart).toBe("2026-07-13T00:00:00.000Z");
    expect(stats.weeks[7].weekStart).toBe("2026-08-31T00:00:00.000Z");
    expect(stats.weeks[7].weekEnd).toBe("2026-09-07T00:00:00.000Z");
    expect(stats.weeks.map((w: { isCurrent: boolean }) => w.isCurrent)).toEqual([
      false, false, false, false, false, false, false, true,
    ]);
  });

  it("clips month buckets to the calendar month so the rows sum to the month", async () => {
    const { entities } = mockContext();
    zeroMocks(entities);

    const stats = await getActivityStatsCore(asActivity(entities), { now: NOW });

    expect(stats.month.label).toBe("September 2026");
    expect(stats.month.weeks.map((w: { weekStart: string; weekEnd: string }) => [w.weekStart, w.weekEnd])).toEqual([
      ["2026-09-01T00:00:00.000Z", "2026-09-08T00:00:00.000Z"],
      ["2026-09-08T00:00:00.000Z", "2026-09-15T00:00:00.000Z"],
      ["2026-09-15T00:00:00.000Z", "2026-09-22T00:00:00.000Z"],
      ["2026-09-22T00:00:00.000Z", "2026-09-29T00:00:00.000Z"],
      ["2026-09-29T00:00:00.000Z", "2026-10-01T00:00:00.000Z"],
    ]);
    expect(stats.month.weeks[0].isCurrent).toBe(true);
    expect(stats.month.weeks.slice(1).every((w) => !w.isCurrent)).toBe(true);
  });

  it("counts each bucket with exclusive-end createdAt ranges", async () => {
    const { entities } = mockContext();
    zeroMocks(entities);

    await getActivityStatsCore(asActivity(entities), { now: NOW });

    const signupCalls = entities.User.count.mock.calls
      .map((c: Array<{ where?: { createdAt?: { gte?: Date; lt?: Date } } }>) => c[0])
      .filter((c) => c?.where?.createdAt?.gte);
    const currentWeekCall = signupCalls.find(
      (c) => c?.where?.createdAt?.gte?.getTime() === Date.parse("2026-08-31T00:00:00Z"),
    );
    // A row exactly at weekEnd (Sep 7 00:00) is excluded here (lt) and lands in the next bucket.
    expect(currentWeekCall).toBeTruthy();
    expect(currentWeekCall?.where?.createdAt?.lt?.getTime()).toBe(Date.parse("2026-09-07T00:00:00Z"));
  });

  it("derives bucket numbers from the matching range, month rows independently", async () => {
    const { entities } = mockContext();
    entities.User.count.mockImplementation(async (args: { where?: { createdAt?: { gte?: Date } } }) => {
      const gte = args?.where?.createdAt?.gte;
      return gte?.getTime() === Date.parse("2026-08-31T00:00:00Z") ? 4 : 1;
    });
    entities.Task.count.mockResolvedValue(0);
    entities.AnalyticsEvent.count.mockResolvedValue(0);

    const stats = await getActivityStatsCore(asActivity(entities), { now: NOW });

    // The trend's current week starts Aug 31 (Monday); the month's first row starts Sep 1 (clipped).
    expect(stats.weeks[7].signups).toBe(4);
    expect(stats.month.weeks[0].signups).toBe(1);
  });

  it("counts captures and triage from analytics events by occurredAt window", async () => {
    const { entities } = mockContext();
    zeroMocks(entities);

    await getActivityStatsCore(asActivity(entities), { now: NOW });

    const eventNames = entities.AnalyticsEvent.count.mock.calls.map(
      (c: Array<{ where?: { name?: string } }>) => c[0]?.where?.name,
    );
    expect(eventNames).toContain("CAPTURE_CREATED");
    expect(eventNames).toContain("TRIAGE_COMPLETED");
    type EventCall = { where?: { occurredAt?: { gte?: Date; lt?: Date } } };
    for (const call of entities.AnalyticsEvent.count.mock.calls as EventCall[][]) {
      expect(call[0]?.where?.occurredAt?.gte).toBeInstanceOf(Date);
      expect(call[0]?.where?.occurredAt?.lt).toBeInstanceOf(Date);
    }
  });

  it("counts completed tasks with isDone and a completedAt window", async () => {
    const { entities } = mockContext();
    zeroMocks(entities);

    await getActivityStatsCore(asActivity(entities), { now: NOW });

    const doneCalls = entities.Task.count.mock.calls
      .map((c: Array<{ where?: { isDone?: boolean; completedAt?: { gte?: Date; lt?: Date } } }>) => c[0])
      .filter((c) => c?.where?.isDone === true);
    expect(doneCalls.length).toBeGreaterThan(0);
    for (const call of doneCalls) {
      expect(call?.where?.completedAt?.gte).toBeInstanceOf(Date);
      expect(call?.where?.completedAt?.lt).toBeInstanceOf(Date);
    }
  });

  it("coerces undefined counts to zero and survives a missing AnalyticsEvent delegate", async () => {
    const { entities } = mockContext();
    // Test doubles may resolve undefined (the core coerces to 0, not NaN).
    entities.User.count.mockImplementation(async () => undefined);
    entities.Task.count.mockImplementation(async () => undefined);
    const { AnalyticsEvent: _missing, ...rest } = asActivity(entities);

    const stats = await getActivityStatsCore(rest as Parameters<typeof getActivityStatsCore>[0], { now: NOW });

    for (const week of [...stats.weeks, ...stats.month.weeks]) {
      expect(week.signups).toBe(0);
      expect(week.captures).toBe(0);
      expect(week.triageCompleted).toBe(0);
      expect(week.tasksCompleted).toBe(0);
    }
  });
});
