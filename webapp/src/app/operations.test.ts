import { describe, it, expect } from "vitest";
import { getAppData, updateProfile, saveTodayCap } from "./operations";
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
  it("derives global Today + lens-scoped Upcoming/Someday from their own queries", async () => {
    // Today is global (WORKFLOW.md §5.11); Upcoming/Someday stay lens-scoped.
    // They use SEPARATE queries on purpose — the scopes disagree by design.
    // Pro user so both lenses are accessible (exercises the global today path).
    const m = mockContext({
      id: "user-1",
      plan: "PRO",
      planRenewsAt: new Date(Date.now() + 86_400_000),
    });
    // Rollover already ran today → short-circuits so this test stays focused
    // on the count aggregation (covered in the rollover describe block).
    // lastActiveAt is "recent" so the throttled activity write also short-
    // circuits (this test is about counts, not activity tracking).
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: new Date(),
      todayCap: 5,
      lastActiveAt: new Date(),
    });
    const lenses = [
      { id: "lens-work", name: "Work", color: "indigo", kind: "WORK", purpose: null },
      { id: "lens-me", name: "Me", color: "emerald", kind: "PERSONAL", purpose: null },
    ];

    m.entities.Lens.findMany.mockResolvedValue(lenses);
    m.entities.InboxItem.count.mockResolvedValue(5);
    m.entities.Project.count.mockResolvedValue(7);
    m.entities.Goal.count.mockResolvedValue(2);
    // Global Today count (across both accessible lenses).
    m.entities.Task.count.mockResolvedValue(2);
    // Lens-scoped Upcoming + Someday rollup. (Today is NOT in this groupBy —
    // it's the Task.count above. Don't add a TODAY row here.)
    m.entities.Task.groupBy.mockResolvedValueOnce([
      { status: "UPCOMING", _count: { _all: 3 } },
      { status: "SOMEDAY", _count: { _all: 4 } },
    ]);

    const result = await getAppData({ lensId: "lens-work" }, m.context);

    expect(result).toEqual({
      lenses,
      counts: {
        inbox: 5,
        today: 2,
        upcoming: 3,
        someday: 4,
        projects: 7,
        goals: 2,
      },
      todayCap: 5,
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
    // Global Today count — accessible-lens set (Pro → all), status TODAY, not
    // done. No active-lens filter: this must match what the global Today page
    // renders, or the badge and the page disagree.
    expect(m.entities.Task.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          lensId: { in: ["lens-work", "lens-me"] },
          status: "TODAY",
          isDone: false,
        }),
      }),
    );
    // Lens-scoped Upcoming + Someday rollup — still the active-lens filter.
    expect(m.entities.Task.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["status"],
        where: expect.objectContaining({
          userId: "user-1",
          lensId: "lens-work",
          isDone: false,
        }),
        _count: { _all: true },
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
  });

  it("falls back to the first lens when lensName is stale/missing", async () => {
    // Reproduces the original bug's shape: client sends a lensName that doesn't
    // match any lens yet (e.g. "Work" still in localStorage while lenses load,
    // or a renamed lens). Counts must still resolve against a real lens, not
    // silently zero out.
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: new Date(),
      lastActiveAt: new Date(),
    });
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-me", name: "Me", color: "emerald", kind: "PERSONAL", purpose: null },
    ]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensId: "stale-id" }, m.context); // id not present → first lens

    expect(m.entities.Task.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["status"],
        where: expect.objectContaining({ lensId: "lens-me", isDone: false }),
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

    await getAppData({ lensId: "Work" }, m.context);

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
    // lastActiveAt is also recent so the throttled activity write short-
    // circuits too — this test asserts NO User.update calls at all.
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: today,
      lastActiveAt: today,
    });
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(2);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensId: "Work" }, m.context);

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

    await getAppData({ lensId: "Work" }, m.context);

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

    await getAppData({ lensId: "Work" }, m.context);

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

    await getAppData({ lensId: "Work" }, m.context);

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

describe("getAppData — throttled lastActiveAt stamp (admin dashboard)", () => {
  // Powers admin "active today/7d/30d" counts. The stamp is throttled (≤15 min)
  // and fire-and-forget — a non-awaited, .catch-swallowed write that must never
  // break an app load. Mirrors the rollover's lazy-write idiom.

  it("stamps lastActiveAt when it is null (first-ever load)", async () => {
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: new Date(),
      lastActiveAt: null,
    });
    m.entities.User.update.mockResolvedValue({});
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensId: "Work" }, m.context);

    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastActiveAt: expect.any(Date) },
    });
  });

  it("stamps lastActiveAt when it is older than 15 minutes", async () => {
    const m = mockContext();
    const stale = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: new Date(),
      lastActiveAt: stale,
    });
    m.entities.User.update.mockResolvedValue({});
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensId: "Work" }, m.context);

    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastActiveAt: expect.any(Date) },
    });
  });

  it("does NOT stamp when lastActiveAt is within 15 minutes (throttled)", async () => {
    const m = mockContext();
    const recent = new Date(Date.now() - 60 * 1000); // 1 min ago
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: new Date(),
      lastActiveAt: recent,
    });
    m.entities.Lens.findMany.mockResolvedValue([]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensId: "Work" }, m.context);

    expect(m.entities.User.update).not.toHaveBeenCalled();
  });
});

describe("getAppData — planning counter consistency", () => {
  it("keeps Today (global) distinct from Upcoming/Someday (lens-scoped)", async () => {
    // Today is its own global count; Upcoming/Someday come from the lens-scoped
    // groupBy. They must never be summed into one "open" number — the scopes
    // disagree (global today + lens upcoming + lens someday = nonsense).
    const m = mockContext({
      id: "user-1",
      plan: "PRO",
      planRenewsAt: new Date(Date.now() + 86_400_000),
    });
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: new Date(),
      lastActiveAt: new Date(),
    });
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-work", name: "Work", color: "indigo", kind: "WORK", purpose: null },
    ]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(2); // global today
    m.entities.Task.groupBy.mockResolvedValueOnce([
      { status: "UPCOMING", _count: { _all: 5 } },
      { status: "SOMEDAY", _count: { _all: 3 } },
    ]);

    const result = await getAppData({ lensId: "lens-work" }, m.context);

    expect(result.counts).toMatchObject({
      today: 2,
      upcoming: 5,
      someday: 3,
    });
    // No `open` field — it was a mixed-scope sum with no honest meaning once
    // today went global, so it was removed.
    expect(result.counts).not.toHaveProperty("open");
  });

  it("global Today count respects the accessible-lens filter (FREE → PERSONAL only)", async () => {
    // A FREE user with a WORK + PERSONAL lens: the global Today count must
    // only see the PERSONAL lens, even though both exist. This is the badge-
    // level mirror of getTodayTasks' entitlement filter.
    const m = mockContext(); // FREE (no plan on the default mock)
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: new Date(),
      lastActiveAt: new Date(),
    });
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-work", name: "Work", color: "indigo", kind: "WORK", purpose: null },
      { id: "lens-me", name: "Me", color: "emerald", kind: "PERSONAL", purpose: null },
    ]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(1);
    m.entities.Task.groupBy.mockResolvedValue([]);

    await getAppData({ lensId: "lens-me" }, m.context);

    expect(m.entities.Task.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          // Only the PERSONAL lens is accessible to FREE; WORK is excluded.
          lensId: { in: ["lens-me"] },
          status: "TODAY",
          isDone: false,
        }),
      }),
    );
  });

  it("global Today count is 0 when the user has no accessible lenses", async () => {
    // Edge case: a FREE user whose only lens is WORK (non-PERSONAL). The
    // accessible set is empty → today must short-circuit to 0 rather than fire
    // a Prisma `in: []` query that could surprise.
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({
      lastTodayRolloverAt: new Date(),
      lastActiveAt: new Date(),
    });
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-work", name: "Work", color: "indigo", kind: "WORK", purpose: null },
    ]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Task.groupBy.mockResolvedValue([]);

    const result = await getAppData({ lensId: "lens-work" }, m.context);

    expect(result.counts.today).toBe(0);
    // The today count query must NOT have run — the empty-set short-circuit
    // returns 0 directly.
    expect(m.entities.Task.count).not.toHaveBeenCalled();
  });
});

describe("updateProfile", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);

    await expect(
      updateProfile({ fullName: "Jake Doe", preferredName: "Jake" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("validates required profile fields", async () => {
    const m = mockContext();

    await expect(
      updateProfile({ fullName: " ", preferredName: "Jake" }, m.context),
    ).rejects.toThrow(/Name is required/);
    await expect(
      updateProfile({ fullName: "Jake Doe", preferredName: "" }, m.context),
    ).rejects.toThrow(/Call me is required/);
  });

  it("trims fields, derives firstName, and updates the user", async () => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({
      fullName: "Jake Doe",
      firstName: "Jake",
      preferredName: "JD",
    });

    const result = await updateProfile(
      { fullName: "  Jake Doe  ", preferredName: "  JD  " },
      m.context,
    );

    expect(result).toEqual({
      fullName: "Jake Doe",
      firstName: "Jake",
      preferredName: "JD",
    });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { fullName: "Jake Doe", firstName: "Jake", preferredName: "JD" },
      select: { fullName: true, firstName: true },
    });
  });
});

// ----------------------------------------------------------------
// saveTodayCap — the global Today cap preference (WORKFLOW.md §5.11)
// ----------------------------------------------------------------
describe("saveTodayCap", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(saveTodayCap({ todayCap: 5 }, m.context)).rejects.toThrow(
      /Not authenticated/,
    );
  });

  it.each([
    [2, /between 3 and 12/],
    [13, /between 3 and 12/],
    [0, /between 3 and 12/],
    [NaN, /between 3 and 12/],
    [5.5, /between 3 and 12/],
  ])("rejects an out-of-range or non-integer value (%s)", async (value, expected) => {
    const m = mockContext();
    await expect(saveTodayCap({ todayCap: value }, m.context)).rejects.toThrow(
      expected,
    );
    expect(m.entities.User.update).not.toHaveBeenCalled();
  });

  it.each([[3], [12], [5], [7]])("accepts and persists a valid value (%s)", async (value) => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({});

    const result = await saveTodayCap({ todayCap: value }, m.context);

    expect(result).toEqual({ ok: true });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { todayCap: value },
    });
  });
});
