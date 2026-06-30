import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureOnboarded,
  setPreferredName,
  getAppData,
  completeOnboarding,
} from "./operations";
import { mockContext } from "../test/mockContext";

// sendWelcomeEmail reaches Auth via a module-level PrismaClient (Auth isn't
// exposed through context.entities). Mock it so tests don't hit the real DB;
// auth.findFirst returns null by default => no email resolves, no send. The
// email path itself is covered in welcomeEmail.test.ts (buildWelcomeEmail).
// vi.hoisted: vi.mock is hoisted above top-level consts, so the mock fn must
// be hoisted too or it's accessed before initialization.
const { authFindFirst } = vi.hoisted(() => ({
  authFindFirst: vi.fn().mockResolvedValue(null),
}));
vi.mock("@prisma/client", () => ({
  PrismaClient: class MockPrismaClient {
    auth = { findFirst: authFindFirst };
  },
}));

beforeEach(() => {
  authFindFirst.mockResolvedValue(null);
  authFindFirst.mockClear();
});

/**
 * Onboarding operations — three ops with distinct shapes:
 *   - ensureOnboarded: loop-based find-or-create (idempotency)
 *   - setPreferredName: simple update + validation
 *   - getAppData: Promise.all aggregation of 5 entity calls
 */

describe("ensureOnboarded — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      ensureOnboarded(undefined as never, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });
});

describe("ensureOnboarded — idempotency", () => {
  it("creates both default lenses + a General project per lens when none exist", async () => {
    const m = mockContext();
    // Lens.findFirst is called 4x total: 2x in the lens loop (both missing →
    // null), then 2x in the project-seed loop (return the created ids).
    m.entities.Lens.findFirst
      .mockResolvedValueOnce(null) // lens loop: Work missing
      .mockResolvedValueOnce(null) // lens loop: Me missing
      .mockResolvedValueOnce({ id: "lens-work", name: "Work" }) // seed lookup
      .mockResolvedValueOnce({ id: "lens-me", name: "Me" }); // seed lookup
    m.entities.Lens.create
      .mockResolvedValueOnce({ id: "lens-work", name: "Work" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me" });
    m.entities.Project.findFirst.mockResolvedValue(null); // General missing in both
    m.entities.Project.create.mockResolvedValue({ id: "gen" });
    // Existing user already has tasks → seed guard skips.
    m.entities.Task.count.mockResolvedValue(3);

    const result = await ensureOnboarded(undefined as never, m.context);

    expect(result.createdLenses).toEqual([
      { id: "lens-work", name: "Work" },
      { id: "lens-me", name: "Me" },
    ]);
    // Each lens is created with its identity color (Work=indigo, Me=emerald).
    expect(m.entities.Lens.create).toHaveBeenCalledTimes(2);
    expect(m.entities.Lens.create).toHaveBeenNthCalledWith(1, {
      data: { name: "Work", color: "indigo", userId: "user-1" },
      select: { id: true, name: true },
    });
    expect(m.entities.Lens.create).toHaveBeenNthCalledWith(2, {
      data: { name: "Me", color: "emerald", userId: "user-1" },
      select: { id: true, name: true },
    });
    // General project seeded once per lens.
    expect(m.entities.Project.create).toHaveBeenCalledTimes(2);
    expect(m.entities.Project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "General",
        lensId: "lens-work",
        userId: "user-1",
      }),
      select: { id: true },
    });
    // No example task seeded — user already has tasks.
    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });

  it("creates only the missing lens (and only its General project)", async () => {
    const m = mockContext();
    // Work exists (with its color already set), Me doesn't.
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce(null);
    m.entities.Lens.create.mockResolvedValueOnce({ id: "lens-me", name: "Me" });
    // Project-seeding lookups: Work's General exists, Me's doesn't.
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" });
    m.entities.Project.findFirst
      .mockResolvedValueOnce({ id: "gen-work" })
      .mockResolvedValueOnce(null);
    m.entities.Project.create.mockResolvedValueOnce({ id: "gen-me" });
    m.entities.Task.count.mockResolvedValue(1);

    const result = await ensureOnboarded(undefined as never, m.context);

    expect(result.createdLenses).toEqual([{ id: "lens-me", name: "Me" }]);
    expect(m.entities.Lens.create).toHaveBeenCalledTimes(1);
    expect(m.entities.Project.create).toHaveBeenCalledTimes(1);
    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });

  it("creates nothing when both lenses and both General projects exist", async () => {
    const m = mockContext();
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" })
      // project-seeding lookups:
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" });
    m.entities.Project.findFirst
      .mockResolvedValueOnce({ id: "gen-work" })
      .mockResolvedValueOnce({ id: "gen-me" });
    m.entities.Task.count.mockResolvedValue(5);

    const result = await ensureOnboarded(undefined as never, m.context);

    expect(result.createdLenses).toEqual([]);
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
    expect(m.entities.Project.create).not.toHaveBeenCalled();
    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });

  // Backfill: lenses created before the color column existed have color=null.
  // ensureOnboarded patches them up to the default identity color (idempotent),
  // so existing users get lens identity on next load without a manual step.
  it("backfills the identity color onto pre-existing lenses missing it", async () => {
    const m = mockContext();
    // Both lenses exist but predate the color column (color: null).
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: null })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: null })
      // project-seeding lookups (General already exists for both):
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: null })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: null });
    m.entities.Project.findFirst
      .mockResolvedValueOnce({ id: "gen-work" })
      .mockResolvedValueOnce({ id: "gen-me" });
    m.entities.Task.count.mockResolvedValue(5);

    await ensureOnboarded(undefined as never, m.context);

    // No new lenses created; both existing ones patched to their default color.
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
    expect(m.entities.Lens.update).toHaveBeenCalledTimes(2);
    expect(m.entities.Lens.update).toHaveBeenNthCalledWith(1, {
      where: { id: "lens-work" },
      data: { color: "indigo" },
      select: { id: true },
    });
    expect(m.entities.Lens.update).toHaveBeenNthCalledWith(2, {
      where: { id: "lens-me" },
      data: { color: "emerald" },
      select: { id: true },
    });
  });
});

describe("ensureOnboarded — first-run seed", () => {
  it("seeds three light TODAY tasks in the Me lens when the user has zero tasks", async () => {
    const m = mockContext();
    // Both lenses already exist (colors already set); both General projects
    // exist (we're isolating the seed path, not the lens/project find-or-create).
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" }) // lens loop
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" })
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" }) // project loop
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" });
    m.entities.Project.findFirst
      .mockResolvedValueOnce({ id: "gen-work" })
      .mockResolvedValueOnce({ id: "gen-me" });
    m.entities.Task.count.mockResolvedValue(0); // ← zero-task guard triggers
    m.entities.Task.create.mockResolvedValue({ id: "seed-task" });

    await ensureOnboarded(undefined as never, m.context);

    // Three tiny tasks, in the Me lens, TODAY/NORMAL/S, enough to teach the
    // loop without filling the user's day.
    expect(m.entities.Task.create).toHaveBeenCalledTimes(3);
    expect(m.entities.Task.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        userId: "user-1",
        lensId: "lens-me",
        status: "TODAY",
        priority: "NORMAL",
        size: "S",
        description: "Try it: complete this task",
      }),
      select: { id: true },
    });
    expect(m.entities.Task.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        userId: "user-1",
        lensId: "lens-me",
        status: "TODAY",
        priority: "NORMAL",
        size: "S",
        description: "Capture one real thing on your mind",
      }),
      select: { id: true },
    });
    expect(m.entities.Task.create).toHaveBeenNthCalledWith(3, {
      data: expect.objectContaining({
        userId: "user-1",
        lensId: "lens-me",
        status: "TODAY",
        priority: "NORMAL",
        size: "S",
        description: "Open the Inbox and decide what that thing becomes",
      }),
      select: { id: true },
    });
  });

  it("seeds nothing when the user already has at least one task", async () => {
    const m = mockContext();
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" })
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" });
    m.entities.Project.findFirst
      .mockResolvedValueOnce({ id: "gen-work" })
      .mockResolvedValueOnce({ id: "gen-me" });
    m.entities.Task.count.mockResolvedValue(2); // ← non-zero → no seed

    await ensureOnboarded(undefined as never, m.context);

    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });

  it("seeds nothing when the Me lens is absent (no home for the seed)", async () => {
    const m = mockContext();
    // Work exists, Me somehow missing — defensive: don't seed into a null lens.
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" }) // lens loop
      .mockResolvedValueOnce(null) // Me missing in lens loop
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" }) // project loop
      .mockResolvedValueOnce(null); // Me missing in project loop
    m.entities.Project.findFirst.mockResolvedValue({ id: "gen-work" });
    m.entities.Task.count.mockResolvedValue(0);

    await ensureOnboarded(undefined as never, m.context);

    // meLensId stays null → seed skipped, even though taskCount is 0.
    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });
});

describe("completeOnboarding — guards + behavior", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      completeOnboarding(undefined as never, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("sets hasSeenOnboarding=true on the user", async () => {
    const m = mockContext();
    m.context.user = {
      ...m.context.user,
      firstName: "Jake",
      preferredName: null,
      hasSeenOnboarding: false,
    };
    m.entities.User.update.mockResolvedValue({});

    const result = await completeOnboarding(undefined as never, m.context);

    expect(result).toEqual({ hasSeenOnboarding: true });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { hasSeenOnboarding: true },
    });
    // The email path ran (auth queried for the address) even though the
    // default mock returns no identity, so nothing was sent.
    expect(authFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { identities: true },
    });
  });

  it("does not update or resend when onboarding is already complete", async () => {
    const m = mockContext();
    m.context.user = {
      ...m.context.user,
      firstName: "Jake",
      hasSeenOnboarding: true,
    };

    const result = await completeOnboarding(undefined as never, m.context);

    expect(result).toEqual({ hasSeenOnboarding: true });
    expect(m.entities.User.update).not.toHaveBeenCalled();
    // Early-return short-circuits before the email path too.
    expect(authFindFirst).not.toHaveBeenCalled();
  });
});

describe("setPreferredName — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      setPreferredName({ preferredName: "Z" }, m.context),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws on empty name", async () => {
    const m = mockContext();
    await expect(
      setPreferredName({ preferredName: "" }, m.context),
    ).rejects.toThrow(/Preferred name is required/);
  });
});

describe("setPreferredName — happy path", () => {
  it("updates the user and returns the trimmed name", async () => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({});

    const result = await setPreferredName(
      { preferredName: "  Jake  " },
      m.context,
    );

    expect(result).toEqual({ preferredName: "Jake" });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { preferredName: "Jake" },
    });
  });
});

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
    // spies then run in the Promise.all.
    m.entities.Lens.findMany.mockResolvedValue(lenses);
    m.entities.InboxItem.count.mockResolvedValue(5);
    m.entities.Task.count.mockResolvedValue(3);
    m.entities.Project.count.mockResolvedValue(7);
    m.entities.Goal.count.mockResolvedValue(2);

    const result = await getAppData({ lensName: "Work" }, m.context);

    expect(result).toEqual({
      lenses,
      counts: { inbox: 5, today: 3, projects: 7, goals: 2 },
    });

    // Inbox is global (no lens). Today/Projects/Goals are lens-scoped to match
    // the list pages — this is the fix for the badge-vs-list mismatch.
    expect(m.entities.InboxItem.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ lensId: expect.anything() }) }),
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
    // Lenses carry their identity color so the shell can paint per-lens.
    expect(m.entities.Lens.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, color: true },
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
