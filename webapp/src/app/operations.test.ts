import { describe, it, expect } from "vitest";
import { getAppData } from "./operations";
import { mockContext } from "../test/mockContext";

/**
 * getAppData — app-shell bootstrap data (runs on every app load + lens switch).
 *
 * Moved here from onboarding/operations.test.ts when getAppData itself moved
 * out of onboarding (it's per-load shell data, not a one-time signup concern).
 * Covers: the auth guard, the count aggregation + lens scoping, lens fallback,
 * and the lazy daily Today→Upcoming rollover.
 */

describe("getAppData — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(getAppData(undefined as never, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe("getAppData — happy path", () => {
  it("aggregates lenses + four counts, lens-scoping the focus-nav counts", async () => {
    const m = mockContext();
    // Rollover already ran today → short-circuits so this test stays focused
    // on the count aggregation (covered in the rollover describe block).
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: new Date() });
    const lenses = [
      { id: "lens-work", name: "Work", color: "indigo" },
      { id: "lens-me", name: "Me", color: "emerald" },
    ];

    // Lens.findMany resolves first (awaited before the counts); the four count
    // spies + the per-lens Today groupBy then run in the Promise.all.
    m.entities.Lens.findMany.mockResolvedValue(lenses);
    m.entities.InboxItem.count.mockResolvedValue(5);
    m.entities.Task.count.mockResolvedValue(3);
    m.entities.Project.count.mockResolvedValue(7);
    m.entities.Goal.count.mockResolvedValue(2);
    // Per-lens Today counts for the lens-switch badges (groupBy shape: one row
    // per lens with its _count). Work has 3 today, Me has 1 today.
    m.entities.Task.groupBy.mockResolvedValue([
      { lensId: "lens-work", _count: { _all: 3 } },
      { lensId: "lens-me", _count: { _all: 1 } },
    ]);

    const result = await getAppData({ lensName: "Work" }, m.context);

    expect(result).toEqual({
      lenses,
      counts: { inbox: 5, today: 3, projects: 7, goals: 2 },
      todayByLens: { "lens-work": 3, "lens-me": 1 },
    });

    // Inbox is global (no lens) but only counts unprocessed items, matching
    // getInboxItems/InboxPage. Archived notes live in Logbook and must not
    // inflate the Inbox badge.
    expect(m.entities.InboxItem.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          status: "UNPROCESSED",
        },
      }),
    );
    expect(m.entities.Task.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lensId: "lens-work", status: "TODAY", isDone: false }),
      }),
    );
    expect(m.entities.Project.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lensId: "lens-work", isDone: false }),
      }),
    );
    expect(m.entities.Goal.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lensId: "lens-work", isDone: false }),
      }),
    );
    // Lenses carry their identity color + stable kind handle + purpose.
    expect(m.entities.Lens.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, color: true, kind: true, purpose: true },
      }),
    );
    // Per-lens Today counts are NOT scoped to the active lens — every lens gets
    // its own number so both Work/Me badges can show simultaneously.
    expect(m.entities.Task.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["lensId"],
        where: expect.objectContaining({
          userId: "user-1",
          status: "TODAY",
          isDone: false,
        }),
      }),
    );
    expect(m.entities.Task.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ lensId: expect.anything() }),
      }),
    );
  });

  it("falls back to the first lens when lensName is stale/missing", async () => {
    // Reproduces the original bug's shape: client sends a lensName that doesn't
    // match any lens yet (e.g. "Work" still in localStorage while lenses load,
    // or a renamed lens). Counts must still resolve against a real lens, not
    // silently zero out.
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-me", name: "Me", color: "emerald" },
    ]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(1);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensName: "Work" }, m.context); // "Work" not present

    expect(m.entities.Task.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lensId: "lens-me" }),
      }),
    );
  });
});

describe("getAppData — daily Today → Upcoming rollover (lazy)", () => {
  // The rollover runs at the top of getAppData, before the count fetches, so
  // todayCount reflects the roll. It's lazy (no cron) and idempotent within a
  // day via lastTodayRolloverAt. See WORKFLOW.md §2.3.

  it("rolls all incomplete TODAY tasks to UPCOMING on a new day (or first-ever load)", async () => {
    const m = mockContext();
    // lastTodayRolloverAt is null → treated as "never run" → rolls.
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: null });
    m.entities.Task.updateMany.mockResolvedValue({ count: 3 });
    m.entities.User.update.mockResolvedValue({});
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensName: "Work" }, m.context);

    // Bulk flip: every incomplete TODAY task for this user → UPCOMING.
    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "TODAY", isDone: false },
      data: { status: "UPCOMING" },
    });
    // The rollover timestamp is stamped so it won't re-run the same day.
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastTodayRolloverAt: expect.any(Date) },
    });
  });

  it("does NOT roll when lastTodayRolloverAt is already today (idempotent)", async () => {
    const m = mockContext();
    const today = new Date();
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: today });
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(2);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensName: "Work" }, m.context);

    // Same calendar day → rollover short-circuits; no flip, no re-stamp.
    expect(m.entities.Task.updateMany).not.toHaveBeenCalled();
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it("rolls again when lastTodayRolloverAt is a previous day", async () => {
    const m = mockContext();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: yesterday });
    m.entities.Task.updateMany.mockResolvedValue({ count: 1 });
    m.entities.User.update.mockResolvedValue({});
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensName: "Work" }, m.context);

    expect(m.entities.Task.updateMany).toHaveBeenCalled();
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastTodayRolloverAt: expect.any(Date) },
    });
  });

  it("preserves startedAt (the Now state) — only status flips", async () => {
    // The updateMany data object must NOT touch startedAt, so an interrupted
    // focus task keeps its place and resurfaces as #1 on Next.
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: null });
    m.entities.Task.updateMany.mockResolvedValue({ count: 1 });
    m.entities.User.update.mockResolvedValue({});
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensName: "Work" }, m.context);

    const call = m.entities.Task.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ status: "UPCOMING" });
    expect(call.data).not.toHaveProperty("startedAt");
  });

  it("excludes done tasks — only incomplete TODAY rolls", async () => {
    // The where-clause must include isDone: false so completed Today tasks
    // (shown under "Done today" / Logbook) are left as-is.
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: null });
    m.entities.Task.updateMany.mockResolvedValue({ count: 0 });
    m.entities.User.update.mockResolvedValue({});
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensName: "Work" }, m.context);

    expect(m.entities.Task.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: "user-1",
        status: "TODAY",
        isDone: false,
      }),
      data: { status: "UPCOMING" },
    });
  });
});
