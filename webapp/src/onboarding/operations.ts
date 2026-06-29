import type { EnsureOnboarded, GetAppData, SetPreferredName, CompleteOnboarding } from "wasp/server/operations";

/**
 * Onboarding + app bootstrap data.
 *
 * `ensureOnboarded` — idempotent: creates the default Work + Me lenses for the
 * logged-in user if they don't yet have them. Covers BOTH:
 *   - existing users who predate the Lens feature (first login after deploy)
 *   - brand-new signups
 * Safe to call on every app load.
 *
 * `setPreferredName` — persists the onboarding preferred-name choice.
 *
 * `getAppData` — returns the user's lenses (and, later, the rest of the shell
 * data) so the client can populate the sidebar + scope the focus engine.
 */

const DEFAULT_LENSES = [
  { name: "Work" },
  { name: "Me" },
] as const;

export const ensureOnboarded = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const userId = context.user.id;
  const created: { name: string; id: string }[] = [];

  for (const lens of DEFAULT_LENSES) {
    // findOrCreate per lens — idempotent across logins
    const existing = await context.entities.Lens.findFirst({
      where: { userId, name: lens.name },
      select: { id: true, name: true },
    });
    if (!existing) {
      const row = await context.entities.Lens.create({
        data: { name: lens.name, userId },
        select: { id: true, name: true },
      });
      created.push(row);
    }
  }

  // Seed a "General" project per lens — the default target for triage's P key
  // (file-in-project). Gives every triaged task a visible home so none are
  // orphaned. Idempotent, like the lens loop above.
  // ponytail: queries all lenses (existing + just-created) via findFirst by name;
  // a dedicated "all lenses" query would be cleaner but this reuses the loop.
  let meLensId: string | null = null;
  for (const lens of DEFAULT_LENSES) {
    const existingLens = await context.entities.Lens.findFirst({
      where: { userId, name: lens.name },
      select: { id: true },
    });
    if (!existingLens) continue;
    if (lens.name === "Me") meLensId = existingLens.id;
    const existingProject = await context.entities.Project.findFirst({
      where: { userId, lensId: existingLens.id, name: "General" },
      select: { id: true },
    });
    if (!existingProject) {
      await context.entities.Project.create({
        data: { name: "General", userId, lensId: existingLens.id },
        select: { id: true },
      });
    }
  }

  // Seed exactly ONE example task for brand-new users so Next is non-empty
  // on first paint. Guarded by "user has zero tasks" so existing users get
  // nothing new (idempotent across logins). Placed in the Me lens, status=TODAY
  // so getTopTask surfaces it immediately.
  if (meLensId) {
    const taskCount = await context.entities.Task.count({ where: { userId } });
    if (taskCount === 0) {
      await context.entities.Task.create({
        data: {
          description: "Try it: complete this task",
          userId,
          lensId: meLensId,
          status: "TODAY",
          priority: "NORMAL",
          size: "M",
        },
        select: { id: true },
      });
    }
  }

  return { createdLenses: created };
}) satisfies EnsureOnboarded<never, { createdLenses: { name: string; id: string }[] }>;

/**
 * Sets the user's preferred name (the onboarding "what should we call you?"
 * step). Independent of `ensureOnboarded` so it can be called once and skipped.
 */
export const setPreferredName = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const name = args.preferredName?.trim();
  if (!name) {
    throw new Error("Preferred name is required.");
  }
  await context.entities.User.update({
    where: { id: context.user.id },
    data: { preferredName: name },
  });
  return { preferredName: name };
}) satisfies SetPreferredName<{ preferredName: string }, { preferredName: string }>;

/**
 * Marks onboarding complete server-side. Persists `User.hasSeenOnboarding=true`
 * so the client can route returning users straight to /app and show new users
 * /welcome exactly once. Idempotent: re-calling on an already-complete user is
 * a no-op. Replaces the old localStorage gate (which didn't survive a browser
 * switch or a clear).
 */
export const completeOnboarding = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  await context.entities.User.update({
    where: { id: context.user.id },
    data: { hasSeenOnboarding: true },
  });
  return { hasSeenOnboarding: true };
}) satisfies CompleteOnboarding<never, { hasSeenOnboarding: boolean }>;

/**
 * Everything the app shell needs on first paint: lenses (for the sidebar's
 * Work/Me switch and to scope queries), plus counts for nav badges.
 */
export const getAppData = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const userId = context.user.id;

  const [lenses, inboxCount, todayCount, projectCount, goalCount] =
    await Promise.all([
      context.entities.Lens.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      }),
      context.entities.InboxItem.count({ where: { userId } }),
      context.entities.Task.count({
        where: { userId, status: "TODAY", isDone: false },
      }),
      context.entities.Project.count({ where: { userId, isDone: false } }),
      context.entities.Goal.count({ where: { userId, isDone: false } }),
    ]);

  return { lenses, counts: { inbox: inboxCount, today: todayCount, projects: projectCount, goals: goalCount } };
}) satisfies GetAppData<
  never,
  {
    lenses: { id: string; name: string }[];
    counts: { inbox: number; today: number; projects: number; goals: number };
  }
>;
