/**
 * Pure project-operation cores — the shared DB layer for both the Wasp server
 * ops (`./operations.ts`) and future `/api/cli/*` PAT routes.
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
 *
 * Where a write resolves a lens from a parent record and must guard that
 * resolved lens (e.g. createTask resolves the project's lens), the core accepts
 * an optional `assertLens` callback the wrapper injects. The callback carries
 * the entitlement decision; the core stays free of `wasp/server`.
 */

import { taskPermalinkSource, uniquePermalink } from "../shared/permalinks";
import type { Prisma } from "@prisma/client";

/**
 * The entities slice these cores read. Loosely typed (same approach as
 * `entitlements.ts`): callers pass Wasp's Prisma delegate, a test mock, or a
 * PAT route's Prisma client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

// ----------------------------------------------------------------
// Read: projects list for the Projects page (with progress + nextAction)
// ----------------------------------------------------------------
// Two queries: the list with includes (open task counts + the top open task),
// then a done-totals rollup merged into a per-project progress fraction.
export async function getProjectsData(
  entities: Entities,
  {
    userId,
    lensId,
    includeCompleted = false,
    includeArchived = false,
  }: {
    userId: string;
    lensId: string;
    includeCompleted?: boolean;
    includeArchived?: boolean;
  },
) {
  const where: Prisma.ProjectWhereInput = { userId, lensId };
  if (!includeArchived) where.archivedAt = null;
  if (!includeCompleted) where.isDone = false;
  const projects = await entities.Project.findMany({
    where,
    orderBy: [{ name: "asc" }],
    include: {
      goal: { select: { id: true, name: true } },
      tasks: {
        // Open work only — a declined (WONT_DO) task is not a next action.
        where: { isDone: false, status: { not: "WONT_DO" } },
        select: {
          id: true,
          permalink: true,
          description: true,
          priority: true,
          size: true,
          status: true,
          isDone: true,
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take: 1,
      },
      resources: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          url: true,
          notes: true,
          createdAt: true,
        },
      },
      // Open count excludes declined tasks — they live in the Logbook, not in
      // the project's momentum.
      _count: {
        select: {
          tasks: { where: { isDone: false, status: { not: "WONT_DO" } } },
        },
      },
    },
  });

  // Total task count (done + open) for the progress fraction.
  const where2: Prisma.ProjectWhereInput = { userId, lensId };
  if (!includeArchived) where2.archivedAt = null;
  if (!includeCompleted) where2.isDone = false;
  const totals = await entities.Project.findMany({
    where: where2,
    select: {
      id: true,
      _count: { select: { tasks: { where: { isDone: true } } } },
    },
  });
  const doneCount = new Map(
    totals.map((p: { id: string; _count: { tasks: number } }) => [
      p.id,
      p._count.tasks,
    ]),
  );

  return projects.map(
    (p: {
      id: string;
      permalink: string;
      name: string;
      description: string | null;
      dueDate: Date | null;
      isDone: boolean;
      completedAt: Date | null;
      archivedAt: Date | null;
      goal: { id: string; name: string } | null;
      tasks: unknown[];
      resources: {
        id: string;
        title: string;
        url: string | null;
        notes: string | null;
        createdAt: Date;
      }[];
      _count: { tasks: number };
    }) => ({
      id: p.id,
      permalink: p.permalink,
      name: p.name,
      description: p.description,
      dueDate: p.dueDate,
      isDone: p.isDone,
      completedAt: p.completedAt,
      archivedAt: p.archivedAt,
      goal: p.goal,
      openCount: p._count.tasks, // open (non-done) tasks
      doneCount: doneCount.get(p.id) ?? 0,
      nextAction: p.tasks[0] ?? null, // top-priority open task
      resources: p.resources,
    }),
  );
}

// ----------------------------------------------------------------
// Read: single project for the detail page, with its tasks
// ----------------------------------------------------------------
// Tenancy-safe (findFirst by id + userId). Returns the project fields plus its
// full task list (open first by priority, then done) so the page can group by
// horizon. lensId is included so callers can scope new tasks to the project's
// lens — NOT the active sidebar lens, which may differ.
export async function getProjectData(
  entities: Entities,
  { userId, id }: { userId: string; id: string },
) {
  const project = await entities.Project.findFirst({
    where: {
      userId,
      OR: [{ id }, { permalink: id }],
    },
    include: {
      goal: { select: { id: true, permalink: true, name: true } },
      tasks: {
        orderBy: [
          { isDone: "asc" },
          { priority: "desc" },
          { createdAt: "asc" },
        ],
        select: {
          id: true,
          permalink: true,
          description: true,
          content: true,
          isDone: true,
          priority: true,
          size: true,
          status: true,
          dueDate: true,
          completedAt: true,
        },
      },
      resources: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          url: true,
          notes: true,
          createdAt: true,
        },
      },
      attachments: { select: { id: true, filename: true, mimeType: true } },
    },
  });
  if (!project) return null;
  // Entitlement: a FREE user may have an existing Work-lens project (seeded
  // before the cap, or created on a lapsed plan). They can still open and use
  // it (no data loss — spec invariant), so we do NOT block reads of existing
  // projects. The lens guard applies to list/create, not to detail reads.
  return {
    id: project.id,
    permalink: project.permalink,
    name: project.name,
    description: project.description,
    dueDate: project.dueDate,
    isDone: project.isDone,
    archivedAt: project.archivedAt,
    order: project.order,
    lensId: project.lensId,
    goal: project.goal,
    tasks: project.tasks,
    resources: project.resources,
    attachments: project.attachments,
  };
}

// ----------------------------------------------------------------
// Write: create a project (triage-to-project + a create UI)
// ----------------------------------------------------------------
// Trims + validates the name, seeds `order` under the goal (goal-planning spec
// §E; standalone projects keep order=0), mints a unique permalink, and creates
// the row. The FREE-lens rule (assertLensAllowed) and the per-lens cap
// (assertUnderCap) are entitlement decisions that live in the Wasp wrapper /
// CLI route — the wrapper runs those BEFORE calling here, so by the time this
// runs the caller has already authorized the lens and the count.
export async function createProjectCore(
  entities: Entities,
  {
    userId,
    name,
    lensId,
    goalId,
    description,
  }: {
    userId: string;
    name: string;
    lensId: string;
    goalId?: string;
    description?: string;
  },
) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Project name is required.");
  }

  // Seed `order` so a new project lands at the end of its goal's sequence
  // (goal-planning spec §E). Standalone projects (no goal) keep order=0;
  // they sort by name. We count existing projects under the goal — including
  // done ones, since sequence order spans both.
  let order = 0;
  if (goalId) {
    order = await entities.Project.count({
      where: { userId, goalId },
    });
  }

  const permalink = await uniquePermalink(trimmed, async (candidate) => {
    const existing = await entities.Project.findFirst({
      where: { userId, permalink: candidate },
      select: { id: true },
    });
    return !!existing;
  });

  return await entities.Project.create({
    data: {
      name: trimmed,
      permalink,
      userId,
      lensId,
      goalId,
      description,
      order,
    },
    select: { id: true, permalink: true, name: true },
  });
}

// ----------------------------------------------------------------
// Write: create a task directly in a project / goal / standalone
// ----------------------------------------------------------------
// Mirrors createProject. A task added here is actionable on landing: it gets
// status UPCOMING (the triage default since 2026-06-25 — surfaces on Next,
// doesn't clutter Today) and the M / NORMAL defaults. lensId comes from the
// project/goal parent (not the active lens) so a task always joins its
// parent's lens.
//
// Lens resolution + the entitlement guard happen in order: the parent's lens
// is resolved first (projectId → its lens, else goalId → its lens, else the
// passed lensId), then `assertLens` (the injected entitlement callback) runs
// against the RESOLVED lens, then the task is created. `assertLens` is
// injected by the Wasp wrapper / CLI route so this core stays free of
// `wasp/server`; pass `undefined` to skip the guard.
export async function createTaskCore(
  entities: Entities,
  {
    userId,
    description,
    lensId,
    projectId,
    goalId,
    assertLens,
  }: {
    userId: string;
    description: string;
    lensId: string;
    projectId?: string;
    goalId?: string;
    assertLens?: (resolvedLensId: string) => Promise<void>;
  },
) {
  const desc = description.trim();
  if (!desc) {
    throw new Error("Task description is required.");
  }
  if (projectId && goalId) {
    throw new Error("Task can only be attached to one parent.");
  }

  let resolvedLensId = lensId;
  let projectPermalink: string | null = null;
  if (projectId) {
    const project = await entities.Project.findUnique({
      where: { id: projectId, userId },
      select: { id: true, lensId: true, permalink: true },
    });
    if (!project) {
      throw new Error("Project not found.");
    }
    resolvedLensId = project.lensId;
    projectPermalink = project.permalink;
  } else if (goalId) {
    const goal = await entities.Goal.findUnique({
      where: { id: goalId, userId },
      select: { id: true, lensId: true },
    });
    if (!goal) {
      throw new Error("Goal not found.");
    }
    resolvedLensId = goal.lensId;
  }

  if (assertLens) {
    await assertLens(resolvedLensId);
  }

  const permalink = await uniquePermalink(
    taskPermalinkSource(desc, projectPermalink),
    async (candidate) => {
      const existing = await entities.Task.findFirst({
        where: { userId, permalink: candidate },
        select: { id: true },
      });
      return !!existing;
    },
  );

  const task = await entities.Task.create({
    data: {
      description: desc,
      permalink,
      content: null,
      userId,
      lensId: resolvedLensId,
      // A task is filed under a Project OR a Goal (or neither — standalone in
      // the lens). Exactly one of projectId/goalId is typically set; both are
      // nullable at the DB layer to support either parent.
      projectId: projectId ?? null,
      goalId: goalId ?? null,
      status: "UPCOMING",
      priority: "NORMAL",
      size: "M",
    },
    select: { id: true, permalink: true },
  });
  return { id: task.id, permalink: task.permalink };
}
