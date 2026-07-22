/**
 * Pure goal-operation cores — the shared DB layer for both the Wasp server ops
 * (`./operations.ts`) and future `/api/cli/*` PAT routes.
 *
 * Pattern (mirrors `tasks/operationsCore.ts`): every core takes `entities` as
 * its first arg (loosely typed — any Prisma-client-shaped object works) plus
 * plain args, does the DB work, and returns data. **No `wasp/server` import
 * lives here.** Wasp's detectServerImports plugin blocks `wasp/server` under
 * `src/` in the client build Vitest uses, so keeping this pure keeps it unit-
 * testable and importable from both worlds.
 *
 * The Wasp ops in `operations.ts` become thin wrappers: auth check
 * (`if (!context.user) throw`) + entitlement guards (`assertLensAllowed` /
 * `assertUnderCap`) + delegate here. Tenancy + the entitlement decision stay in
 * the wrapper; the pure DB shape stays here.
 */

import { uniquePermalink } from "../shared/permalinks";

/**
 * The entities slice these cores read. Loosely typed (same approach as
 * `entitlements.ts`): callers pass Wasp's Prisma delegate, a test mock, or a
 * PAT route's Prisma client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

// ----------------------------------------------------------------
// Read: goals list for the Goals page (progress + nextProject rollup)
// ----------------------------------------------------------------
// Each goal rolls up linked project count + aggregate completion progress
// across its projects. Also returns the focus project (first non-done in
// `order`) so the goal card can surface a single muted "Focus: <name>" line
// (goal-planning spec §E). The "never lies" rule: when a goal has no projects
// or all are done, nextProject is null (no fabricated content).
export async function getGoalsData(
  entities: Entities,
  { userId, lensId }: { userId: string; lensId: string },
) {
  const goals = await entities.Goal.findMany({
    where: {
      userId,
      lensId,
      isDone: false,
    },
    orderBy: [{ name: "asc" }],
    include: {
      // Projects carry `order` so we can pick the first non-done one as "next".
      projects: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, permalink: true, name: true, isDone: true, order: true },
      },
    },
  });

  return goals.map((g: {
    id: string;
    permalink: string;
    name: string;
    description: string | null;
    projects: { id: string; permalink: string; name: string; isDone: boolean; order: number }[];
  }) => {
    const projectsDone = g.projects.filter((p) => p.isDone).length;
    const projectsTotal = g.projects.length;
    // Focus = first non-done project in sequence order. Absent when the goal
    // has no projects or all are done (the "never lies" rule). goal-planning
    // spec §E.
    const nextProject = g.projects.find((p) => !p.isDone) ?? null;
    return {
      id: g.id,
      permalink: g.permalink,
      name: g.name,
      description: g.description,
      projectCount: projectsTotal,
      progress: projectsTotal === 0 ? 0 : Math.round((projectsDone / projectsTotal) * 100),
      nextProject: nextProject ? { id: nextProject.id, permalink: nextProject.permalink, name: nextProject.name } : null,
    };
  });
}

// ----------------------------------------------------------------
// Read: single goal (for the Goal detail page)
// ----------------------------------------------------------------
// Returns the goal + its linked projects (name + progress, for the "linked
// projects" list). Scoped by userId for tenancy. Legacy direct goal tasks may
// still exist in old data, but the goal surface no longer treats Tasks as goal
// children; Projects are the unit that supports a Goal.
export async function getGoalData(
  entities: Entities,
  { userId, id }: { userId: string; id: string },
) {
  return await entities.Goal.findFirst({
    where: {
      userId,
      OR: [{ id }, { permalink: id }],
    },
    include: {
      // Linked projects: name + done/total for a per-project progress read.
      // Ordered by `order` then name — the goal-scoped sequence (spec §E).
      projects: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: {
          id: true,
          permalink: true,
          name: true,
          isDone: true,
          order: true,
          dueDate: true,
          tasks: { select: { id: true, isDone: true } },
        },
      },
    },
  });
}

// ----------------------------------------------------------------
// Write: create a goal (with permalink uniqueness)
// ----------------------------------------------------------------
// Trims + validates the name, mints a unique permalink, and creates the row.
// The FREE-lens rule (assertLensAllowed) and the per-lens cap
// (assertUnderCap) are entitlement decisions that live in the Wasp wrapper /
// CLI route — the core does only the pure DB work. The wrapper runs those
// guards BEFORE calling here, so by the time this runs the caller has already
// authorized the lens and the count.
export async function createGoalCore(
  entities: Entities,
  {
    userId,
    name,
    lensId,
    description,
  }: { userId: string; name: string; lensId: string; description?: string },
) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Goal name is required.");
  }

  const permalink = await uniquePermalink(trimmed, async (candidate) => {
    const existing = await entities.Goal.findFirst({
      where: { userId, permalink: candidate },
      select: { id: true },
    });
    return !!existing;
  });

  return await entities.Goal.create({
    data: {
      name: trimmed,
      permalink,
      userId,
      lensId,
      description,
    },
    select: { id: true, permalink: true, name: true },
  });
}
