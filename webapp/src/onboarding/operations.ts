import type { EnsureOnboarded, GetAppData } from "wasp/server/operations";

/**
 * Onboarding + app bootstrap data.
 *
 * `ensureOnboarded` — idempotent: creates the default Work + Me lenses for the
 * logged-in user if they don't yet have them. Covers BOTH:
 *   - existing users who predate the Lens feature (first login after deploy)
 *   - brand-new signups
 * Safe to call on every app load.
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

  return { createdLenses: created };
}) satisfies EnsureOnboarded<never, { createdLenses: { name: string; id: string }[] }>;

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
