/**
 * Pure goal-operation cores — ported verbatim from
 * `webapp/src/goals/operationsCore.ts` (S6; bodies unchanged). Same pattern as
 * `../projects/operationsCore.ts`: every core takes the seam `entities` as its
 * first arg plus plain args; no server framework import. The API ops are thin
 * wrappers: auth check + entitlement guards (`../projects/guards.js`) +
 * delegate here.
 */

import { uniquePermalink } from "../shared/permalinks.js";
import type {
  GoalCreateArgs,
  GoalDelegate,
  GoalDetailRow,
  GoalListRow,
  GoalWhereInput,
  ProjectDelegate,
} from "../db/index.js";

// Row interfaces the seam's delegates reference — re-exported (one definition).
export type { GoalListRow, GoalDetailRow };

/**
 * The entities slice these cores read — the seam's delegates. `createEntities`
 * satisfies it; Vitest mocks cast with a SAFETY comment.
 */
export interface GoalEntities {
  Goal: GoalDelegate;
  Project: ProjectDelegate;
}

// ----------------------------------------------------------------
// Read: goals list for the Goals page (progress + nextProject rollup)
// ----------------------------------------------------------------
// Each goal rolls up linked project count + aggregate completion progress
// across its projects. Also returns the focus project (first non-done in
// `order`) so the goal card can surface a single muted "Focus: <name>" line
// (goal-planning spec §E). The "never lies" rule: when a goal has no projects
// or all are done, nextProject is null (no fabricated content).
export interface GoalSummaryRow {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  projectCount: number;
  progress: number;
  nextProject: { id: string; permalink: string; name: string } | null;
}

export async function getGoalsData(
  entities: Pick<GoalEntities, "Goal">,
  { userId, lensId }: { userId: string; lensId: string },
): Promise<GoalSummaryRow[]> {
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

  return goals.map((g) => {
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
  entities: Pick<GoalEntities, "Goal">,
  { userId, id }: { userId: string; id: string },
): Promise<GoalDetailRow | null> {
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
// (assertUnderCap) are entitlement decisions that live in the API wrapper /
// CLI route — the core does only the pure DB work.
export async function createGoalCore(
  entities: Pick<GoalEntities, "Goal">,
  {
    userId,
    name,
    lensId,
    description,
  }: { userId: string; name: string; lensId: string; description?: string },
): Promise<Awaited<ReturnType<GoalDelegate["create"]>>> {
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

  const createArgs: GoalCreateArgs = {
    data: {
      name: trimmed,
      permalink,
      userId,
      lensId,
      description,
    },
    select: { id: true, permalink: true, name: true },
  };
  return await entities.Goal.create(createArgs);
}

export type { GoalWhereInput };
