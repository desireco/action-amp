import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  completeOnboardingCore,
  ensureOnboardedCore,
  setPreferredNameCore,
  type OnboardingCompletionDeps,
} from "./operationsCore.js";
import { mockContext } from "../test/mockContext.js";

/**
 * Onboarding cores — ported from webapp/src/onboarding/operations.test.ts
 * (S13 parity: packages/contract/src/s13-onboarding/README.md §3/§6). The op →
 * core reshaping is mechanical: `context.user.id` arrives as `args.userId`
 * (null keeps the "Not authenticated." guard testable), `context.user.
 * hasSeenOnboarding` arrives as `args.hasSeenOnboarding`, and the welcome
 * email / analytics side channels are the injected deps (the webapp reached
 * AuthIdentity through a direct PrismaClient; the new stack's acting user
 * carries the address, so the transport belongs to the email seam).
 */

/** Default deps: neither side channel fires unless a test provides it. */
function noDeps(): OnboardingCompletionDeps {
  return {};
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureOnboardedCore — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      ensureOnboardedCore(m.context.entities, { userId: null }),
    ).rejects.toThrow(/Not authenticated/);
  });
});

describe("ensureOnboardedCore — idempotency", () => {
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
      .mockResolvedValueOnce({
        id: "lens-work",
        name: "Work",
        isDefault: true,
        isIncluded: false,
        color: "indigo",
        purpose: null,
      })
      .mockResolvedValueOnce({
        id: "lens-me",
        name: "Me",
        isDefault: true,
        isIncluded: true,
        color: "emerald",
        purpose: null,
      });
    m.entities.Project.findFirst.mockResolvedValue(null); // General missing in both
    m.entities.Project.create.mockResolvedValue({ id: "gen" });
    // Existing user already has tasks → seed guard skips.
    m.entities.Task.count.mockResolvedValue(3);

    const result = await ensureOnboardedCore(m.context.entities, {
      userId: "user-1",
    });

    expect(result.createdLenses).toEqual([
      { id: "lens-work", name: "Work" },
      { id: "lens-me", name: "Me" },
    ]);
    // Each lens is created with its identity color + the seeded/entitlement
    // flags (Work=indigo/excluded, Me=emerald/included).
    expect(m.entities.Lens.create).toHaveBeenCalledTimes(2);
    expect(m.entities.Lens.create).toHaveBeenNthCalledWith(1, {
      data: {
        name: "Work",
        isDefault: true,
        isIncluded: false,
        color: "indigo",
        purpose: null,
        userId: "user-1",
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        color: true,
        purpose: true,
      },
    });
    expect(m.entities.Lens.create).toHaveBeenNthCalledWith(2, {
      data: {
        name: "Me",
        isDefault: true,
        isIncluded: true,
        color: "emerald",
        purpose: null,
        userId: "user-1",
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        color: true,
        purpose: true,
      },
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
    m.entities.Lens.create.mockResolvedValueOnce({
      id: "lens-me",
      name: "Me",
      isDefault: true,
      isIncluded: true,
      color: "emerald",
      purpose: null,
    });
    // Project-seeding lookups: Work's General exists, Me's doesn't.
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" });
    m.entities.Project.findFirst
      .mockResolvedValueOnce({ id: "gen-work" })
      .mockResolvedValueOnce(null);
    m.entities.Project.create.mockResolvedValueOnce({ id: "gen-me" });
    m.entities.Task.count.mockResolvedValue(1);

    const result = await ensureOnboardedCore(m.context.entities, {
      userId: "user-1",
    });

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

    const result = await ensureOnboardedCore(m.context.entities, {
      userId: "user-1",
    });

    expect(result.createdLenses).toEqual([]);
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
    expect(m.entities.Project.create).not.toHaveBeenCalled();
    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });

  // Backfill: lenses created before the color column existed have color=null.
  // ensureOnboardedCore patches the color up to the default (idempotent), so
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

    await ensureOnboardedCore(m.context.entities, { userId: "user-1" });

    // No new lenses created; both patched to their default color. The seed
    // flags are NOT touched (they were the lookup key — already correct).
    // Name is NOT touched (user-editable).
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
    expect(m.entities.Lens.update).toHaveBeenCalledTimes(2);
    expect(m.entities.Lens.update).toHaveBeenNthCalledWith(1, {
      where: { id: "lens-work" },
      data: { color: "indigo" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        color: true,
        purpose: true,
      },
    });
    expect(m.entities.Lens.update).toHaveBeenNthCalledWith(2, {
      where: { id: "lens-me" },
      data: { color: "emerald" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        isIncluded: true,
        color: true,
        purpose: true,
      },
    });
  });

  it("rename-safe: a renamed seeded lens is still found by seed flags, never re-seeded", async () => {
    // The user renamed "Me" → "Life" (allowed). ensureOnboardedCore looks up
    // by seed flags, finds the renamed lens, and does NOT create a second one.
    const m = mockContext();
    m.entities.Lens.findFirst
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({
        id: "lens-life",
        name: "Life",
        color: "emerald",
      }) // renamed!
      .mockResolvedValueOnce({ id: "lens-work", name: "Work", color: "indigo" })
      .mockResolvedValueOnce({
        id: "lens-life",
        name: "Life",
        color: "emerald",
      });
    m.entities.Project.findFirst.mockResolvedValue({ id: "gen" });
    m.entities.Task.count.mockResolvedValue(5);

    await ensureOnboardedCore(m.context.entities, { userId: "user-1" });

    // Colors already match → no updates. Critically: no new lens created (the
    // renamed "Life" lens was found by seed flags, not re-seeded as a new "Me").
    expect(m.entities.Lens.create).not.toHaveBeenCalled();
    expect(m.entities.Lens.update).not.toHaveBeenCalled();
  });

  it("adopts (never 500s on) a user lens that owns a default's name but not its flags", async () => {
    // The user renamed the seeded "Work" → "Deep Work", then created their OWN
    // lens named "Work" (isDefault=false). The flags lookup misses it, the
    // create hits Lens_userId_name_key (23505), and the bootstrap must adopt
    // the row and carry on — not fail the whole app load (webapp core 500'd
    // here; port correction, live-reached on the dev fixture user).
    const m = mockContext();
    const nameClash = Object.assign(new Error('duplicate key value violates unique constraint "Lens_userId_name_key"'), {
      code: "23505",
    });
    m.entities.Lens.findFirst
      .mockResolvedValueOnce(null) // lens loop: no DEFAULT Work by flags…
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" }) // …Me exists
      .mockResolvedValueOnce(null) // project loop: no default Work
      .mockResolvedValueOnce({ id: "lens-me", name: "Me", color: "emerald" });
    m.entities.Lens.create
      .mockRejectedValueOnce(nameClash) // "Work" create → unique violation
      .mockResolvedValue({ id: "lens-me", name: "Me" });
    m.entities.Lens.update.mockResolvedValue({
      id: "lens-me",
      name: "Me",
      isDefault: true,
      isIncluded: true,
      color: "emerald",
      purpose: null,
    });
    m.entities.Project.findFirst.mockResolvedValue({ id: "gen-me" });
    m.entities.Task.count.mockResolvedValue(1);

    const result = await ensureOnboardedCore(m.context.entities, {
      userId: "user-1",
    });

    // Me still seeds; the clashing Work was adopted (no throw, no update to
    // the user's own row).
    expect(result.createdLenses).toEqual([]);
    expect(m.entities.Lens.update).not.toHaveBeenCalled();
    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });
});

describe("ensureOnboardedCore — first-run seed", () => {
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
    m.entities.User.findUnique.mockResolvedValue({
      onboardingStage: "SAMPLE_TASK",
    });
    m.entities.Task.count.mockResolvedValue(0); // ← zero-task guard triggers
    m.entities.Task.create.mockResolvedValue({ id: "seed-task" });

    await ensureOnboardedCore(m.context.entities, { userId: "user-1" });

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
    m.entities.User.findUnique.mockResolvedValue({
      onboardingStage: "COMPLETE",
    });
    m.entities.Task.count.mockResolvedValue(0);

    await ensureOnboardedCore(m.context.entities, { userId: "user-1" });

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
    m.entities.User.findUnique.mockResolvedValue({
      onboardingStage: "SAMPLE_TASK",
    });
    m.entities.Task.count.mockResolvedValue(2); // ← non-zero → no seed

    await ensureOnboardedCore(m.context.entities, { userId: "user-1" });

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
    // The core projects { id, name } off the created row (the webapp op pushed
    // the raw select row); give the mock a row to project.
    m.entities.Lens.create.mockResolvedValue({
      id: "lens-me",
      name: "Me",
      isDefault: true,
      isIncluded: true,
      color: "emerald",
      purpose: null,
    });
    m.entities.Project.findFirst.mockResolvedValue({ id: "gen-work" });
    m.entities.Task.count.mockResolvedValue(0);

    await ensureOnboardedCore(m.context.entities, { userId: "user-1" });

    // meLensId stays null → seed skipped, even though taskCount is 0.
    expect(m.entities.Task.create).not.toHaveBeenCalled();
  });
});

describe("completeOnboardingCore — guards + behavior", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      completeOnboardingCore(m.context.entities, {
        userId: null,
        hasSeenOnboarding: false,
      }, noDeps()),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("starts the sample-task guidance when onboarding finishes", async () => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({});
    const sendWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    const recordOnboardingCompleted = vi.fn().mockResolvedValue(undefined);

    const result = await completeOnboardingCore(
      m.context.entities,
      {
        userId: "user-1",
        hasSeenOnboarding: false,
        firstName: "Jake",
        preferredName: null,
      },
      { sendWelcomeEmail, recordOnboardingCompleted },
    );

    expect(result).toEqual({ hasSeenOnboarding: true });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { hasSeenOnboarding: true, onboardingStage: "SAMPLE_TASK" },
    });
    // The email path ran with the user's identity fields (name fallback chain
    // lives with the transport); the analytics fire carries the same
    // visitor id + route the webapp recorded.
    expect(sendWelcomeEmail).toHaveBeenCalledWith({
      id: "user-1",
      firstName: "Jake",
      preferredName: null,
    });
    expect(recordOnboardingCompleted).toHaveBeenCalledWith("user-1");
  });

  it("lets a returning member skip guided practice", async () => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({});

    await completeOnboardingCore(
      m.context.entities,
      {
        userId: "user-1",
        hasSeenOnboarding: false,
        firstName: "Jake",
        preferredName: null,
        skipGuidance: true,
      },
      noDeps(),
    );

    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { hasSeenOnboarding: true, onboardingStage: "COMPLETE" },
    });
  });

  it("does not update or resend when onboarding is already complete", async () => {
    const m = mockContext();
    const sendWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    const recordOnboardingCompleted = vi.fn().mockResolvedValue(undefined);

    const result = await completeOnboardingCore(
      m.context.entities,
      {
        userId: "user-1",
        hasSeenOnboarding: true,
        firstName: "Jake",
      },
      { sendWelcomeEmail, recordOnboardingCompleted },
    );

    expect(result).toEqual({ hasSeenOnboarding: true });
    expect(m.entities.User.update).not.toHaveBeenCalled();
    // Early-return short-circuits before the email path too.
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
    expect(recordOnboardingCompleted).not.toHaveBeenCalled();
  });

  it("swallows a failing welcome email — completion never blocks on transport", async () => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({});

    const result = await completeOnboardingCore(
      m.context.entities,
      { userId: "user-1", hasSeenOnboarding: false, firstName: "Jake" },
      {
        sendWelcomeEmail: vi.fn().mockRejectedValue(new Error("SMTP down")),
      },
    );

    expect(result).toEqual({ hasSeenOnboarding: true });
    expect(m.entities.User.update).toHaveBeenCalledTimes(1);
  });

  it("swallows a failing analytics fire (fire-and-forget)", async () => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({});

    const result = await completeOnboardingCore(
      m.context.entities,
      { userId: "user-1", hasSeenOnboarding: false },
      {
        recordOnboardingCompleted: vi
          .fn()
          .mockRejectedValue(new Error("analytics down")),
      },
    );

    expect(result).toEqual({ hasSeenOnboarding: true });
    expect(m.entities.User.update).toHaveBeenCalledTimes(1);
  });
});

describe("setPreferredNameCore — guards", () => {
  it("throws if not authenticated", async () => {
    const m = mockContext(null);
    await expect(
      setPreferredNameCore(m.context.entities, {
        userId: null,
        preferredName: "Z",
      }),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("throws on empty name", async () => {
    const m = mockContext();
    await expect(
      setPreferredNameCore(m.context.entities, {
        userId: "user-1",
        preferredName: "",
      }),
    ).rejects.toThrow(/Preferred name is required/);
  });
});

describe("setPreferredNameCore — happy path", () => {
  it("updates the user and returns the trimmed name", async () => {
    const m = mockContext();
    m.entities.User.update.mockResolvedValue({});

    const result = await setPreferredNameCore(m.context.entities, {
      userId: "user-1",
      preferredName: "  Jake  ",
    });

    expect(result).toEqual({ preferredName: "Jake" });
    expect(m.entities.User.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { preferredName: "Jake" },
    });
  });
});
