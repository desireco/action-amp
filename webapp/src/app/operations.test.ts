import { describe, it, expect } from "vitest";
import { getAppData, updateProfile } from "./operations";
import { activePoolWhere } from "../tasks/activePool";
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
      { id: "lens-work", name: "Work", color: "indigo", kind: "WORK", purpose: null },
      { id: "lens-me", name: "Me", color: "emerald", kind: "PERSONAL", purpose: null },
    ];

    // Lens.findMany resolves first (awaited before the counts); the count spies
    // + the per-lens actionable groupBy then run in the Promise.all. Task.count
    // is called twice (active pool + Upcoming); resolve 3 for both.
    m.entities.Lens.findMany.mockResolvedValue(lenses);
    m.entities.InboxItem.count.mockResolvedValue(5);
    m.entities.Task.count.mockResolvedValue(3);
    m.entities.Project.count.mockResolvedValue(7);
    m.entities.Goal.count.mockResolvedValue(2);
    // Per-lens actionable counts for the lens-switch badges (groupBy shape: one
    // row per lens with its _count). Work has 3 on the table, Me has 1.
    m.entities.Task.groupBy.mockResolvedValue([
      { lensId: "lens-work", _count: { _all: 3 } },
      { lensId: "lens-me", _count: { _all: 1 } },
    ]);

    const result = await getAppData({ lensId: "lens-work" }, m.context);

    expect(result).toEqual({
      lenses,
      counts: { inbox: 5, active: 3, upcoming: 3, projects: 7, goals: 2 },
      activeByLens: { "lens-work": 3, "lens-me": 1 },
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
    // The active count uses the SHARED pool predicate (tasks/activePool.ts) —
    // the same where-clause Next's getTopTask draws from — lens-scoped so the
    // Today badge matches what's on the table in this lens. status is TODAY +
    // UPCOMING (not TODAY-only), with the due-now-or-null OR guard.
    expect(m.entities.Task.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          lensId: "lens-work",
          status: { in: ["TODAY", "UPCOMING"] },
          isDone: false,
          OR: [{ dueDate: null }, { dueDate: { lte: expect.any(Date) } }],
        }),
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
    // Per-lens actionable counts use the SAME pool predicate but are NOT scoped
    // to the active lens — grouped BY lensId across all lenses, so every pill
    // mirrors the Next pool for its own lens and can never diverge from the card.
    expect(m.entities.Task.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["lensId"],
        where: expect.objectContaining({
          userId: "user-1",
          status: { in: ["TODAY", "UPCOMING"] },
          isDone: false,
          OR: [{ dueDate: null }, { dueDate: { lte: expect.any(Date) } }],
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
      { id: "lens-me", name: "Me", color: "emerald", kind: "PERSONAL", purpose: null },
    ]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(1);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);

    await getAppData({ lensId: "stale-id" }, m.context); // id not present → first lens

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
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: today });
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

describe("getAppData — actionable pool (the consistency lock)", () => {
  // The bug this whole change exists to prevent: a task surfaced on Next (card
  // reads "due today") while the Today badge read 0 and the lens pill showed
  // nothing — because the counts filtered status === "TODAY" only, while Next
  // pooled TODAY + UPCOMING. Now the badge + pill draw from the SAME predicate
  // as Next (tasks/activePool.ts). These tests pin that.

  beforeEach(() => {
    // Default the active + Upcoming counts so rollover short-circuit cases have
    // something to resolve; individual tests override as needed.
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: new Date() });
  });

  it("the active count and the lens pill use the SAME predicate shape as Next", async () => {
    // Single-source proof: getAppData's Task.count (active) and groupBy (pill)
    // receive a where-clause that exactly matches activePoolWhere, which is the
    // same function getTopTask uses. If any of the three drifts, this fails.
    const m = mockContext();
    m.entities.User.findUnique.mockResolvedValue({ lastTodayRolloverAt: new Date() });
    m.entities.Lens.findMany.mockResolvedValue([
      { id: "lens-work", name: "Work", color: "indigo", kind: "WORK", purpose: null },
    ]);
    m.entities.InboxItem.count.mockResolvedValue(0);
    m.entities.Task.count.mockResolvedValue(0);
    m.entities.Project.count.mockResolvedValue(0);
    m.entities.Goal.count.mockResolvedValue(0);
    m.entities.Task.groupBy.mockResolvedValue([]);

    await getAppData({ lensId: "lens-work" }, m.context);

    const expectedLensScoped = activePoolWhere({ userId: "user-1", lensId: "lens-work" });
    const expectedPerLens = activePoolWhere({ userId: "user-1" });

    // Active count = pool predicate, lens-scoped (matches getTopTask's lens).
    expect(m.entities.Task.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(expectedLensScoped) }),
    );
    // Per-lens pill = pool predicate, unscoped (grouped BY lensId).
    expect(m.entities.Task.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(expectedPerLens) }),
    );
  });

  it("regression: counts an UPCOMING + due-today task (the case that used to read 0)", async () => {
    // Before the fix this task matched getTopTask (UPCOMING + due ≤ now) but
    // NOT the old status === "TODAY" count, so Next showed it and the badge
    // read 0. The pool predicate admits it; this test guarantees the where-
    // clause shape that would count it stays in place.
    const expected = activePoolWhere({ userId: "user-1", lensId: "lens-work" });
    expect(expected.status).toEqual({ in: ["TODAY", "UPCOMING"] }); // admits UPCOMING
    expect(expected.OR).toContainEqual({ dueDate: { lte: expect.any(Date) } }); // admits due-now
  });

  it("the active count is roll-invariant: a post-rollover TODAY→UPCOMING task still counts", async () => {
    // The daily rollover flips TODAY → UPCOMING. Under the old count (TODAY
    // only) the badge dropped to 0 overnight. The pool admits both statuses,
    // so the count is stable across midnight — only the Today PAGE resets.
    const before = activePoolWhere({ userId: "user-1", lensId: "lens-work" });
    const after = activePoolWhere({ userId: "user-1", lensId: "lens-work" });
    expect(before).toEqual(after); // predicate doesn't change with status flips
    expect(before.status).toEqual({ in: ["TODAY", "UPCOMING"] });
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
