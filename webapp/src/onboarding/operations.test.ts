import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureOnboarded,
  setPreferredName,
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
 * Onboarding operations — the one-time first-run ops:
 *   - ensureOnboarded: loop-based find-or-create (idempotency)
 *   - setPreferredName: simple update + validation
 *   - completeOnboarding: marks onboarding seen server-side
 *
 * getAppData (app-shell bootstrap) moved to src/app/operations.test.ts — it's
 * per-load shell data, not onboarding.
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
    // Each lens is created with its identity color + the seeded/entitlement
    // flags (Work=indigo/excluded, Me=emerald/included).
    expect(m.entities.Lens.create).toHaveBeenCalledTimes(2);
    expect(m.entities.Lens.create).toHaveBeenNthCalledWith(1, {
      data: { name: "Work", isDefault: true, isIncluded: false, color: "indigo", userId: "user-1" },
      select: { id: true, name: true },
    });
    expect(m.entities.Lens.create).toHaveBeenNthCalledWith(2, {
      data: { name: "Me", isDefault: true, isIncluded: true, color: "emerald", userId: "user-1" },
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
  // ensureOnboarded patches the color up to the default (idempotent), so
  // existing users get lens identity on next load. Looked up by the seed
  // flags (rename-safe): a renamed seeded lens is still found, and only its
  // color is touched.
  it("backfills the identity color onto pre-existing lenses missing it (looked up by seed flags)", async () => {
    const m = mockContext();
    // Both seeded lenses exist (found by seed flags), color null → needs the default.
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: null }) // lens loop, Work/excluded
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: null }) // lens loop, Me/included
      // project-seeding lookups (by seed flags; General already exists for both):
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: null })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: null });
    m.entities.Project.findFirst
      .mockResolvedValueOnce({ id: "gen-work" })
      .mockResolvedValueOnce({ id: "gen-me" });
    m.entities.Task.count.mockResolvedValue(5);

    await ensureOnboarded(undefined as never, m.context);

    // No new lenses created; both patched to their default color. The seed
    // flags are NOT touched (they were the lookup key — already correct).
    // Name is NOT touched (user-editable).
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

  it("rename-safe: a renamed seeded lens is still found by seed flags, never re-seeded", async () => {
    // The user renamed "Me" → "Life" (allowed). ensureOnboarded looks up by
    // seed flags, finds the renamed lens, and does NOT create a second one.
    const m = mockContext();
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-life", name: "Life", color: "emerald" }) // renamed!
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-life", name: "Life", color: "emerald" });
    m.entities.Project.findFirst.mockResolvedValue({ id: "gen" });
    m.entities.Task.count.mockResolvedValue(5);

    await ensureOnboarded(undefined as never, m.context);

    // Colors already match → no updates. Critically: no new lens created (the
    // renamed "Life" lens was found by seed flags, not re-seeded as a new "Me").
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
    expect(m.entities.Lens.update).not.toHaveBeenCalled();
  });
});

describe("ensureOnboarded — first-run seed", () => {
  it("seeds one sample TODAY task for the SAMPLE_TASK stage when the user has zero tasks", async () => {
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
    m.entities.User.findUnique.mockResolvedValue({ onboardingStage: "SAMPLE_TASK" });
    m.entities.Task.count.mockResolvedValue(0); // ← zero-task guard triggers
    m.entities.Task.create.mockResolvedValue({ id: "seed-task" });

    await ensureOnboarded(undefined as never, m.context);

    // One harmless Task teaches focus. Capture + triage are real stage-backed
    // actions, never instruction tasks the user must manually clear.
    expect(m.entities.Task.create).toHaveBeenCalledTimes(1);
    expect(m.entities.Task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        lensId: "lens-me",
        status: "TODAY",
        priority: "NORMAL",
        size: "S",
        description: "Practice: complete this task",
        isOnboardingSample: true,
      }),
      select: { id: true },
    });
  });

  it("does not seed an existing member with no tasks", async () => {
    const m = mockContext();
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" })
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" });
    m.entities.Project.findFirst.mockResolvedValue({ id: "general" });
    m.entities.User.findUnique.mockResolvedValue({ onboardingStage: "COMPLETE" });
    m.entities.Task.count.mockResolvedValue(0);

    await ensureOnboarded(undefined as never, m.context);

    expect(m.entities.Task.create).not.toHaveBeenCalled();
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

  it("starts the sample-task guidance when onboarding finishes", async () => {
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
      data: { hasSeenOnboarding: true, onboardingStage: "SAMPLE_TASK" },
    });
    // The email path ran (auth queried for the address) even though the
    // default mock returns no identity, so nothing was sent.
    expect(authFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { identities: true },
    });
  });

  it("lets a returning member skip guided practice", async () => {
    const m = mockContext();
    m.context.user = {
      ...m.context.user,
      firstName: "Jake",
      preferredName: null,
      hasSeenOnboarding: false,
    };
    m.entities.User.update.mockResolvedValue({});

    await completeOnboarding({ skipGuidance: true }, m.context);

    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { hasSeenOnboarding: true, onboardingStage: "COMPLETE" },
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
