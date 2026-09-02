/**
 * Pure project-operation cores — ported verbatim from
 * `webapp/src/projects/operationsCore.ts` (S5; bodies unchanged — signatures
 * unchanged is the point).
 *
 * Pattern (mirrors `tasks/operationsCore.ts`): every core takes `entities` as
 * its first arg (the Prisma-client-shaped seam object) plus plain args, does
 * the DB work, and returns data. **No server framework import lives here.**
 * The API ops (`api`) are thin wrappers: auth check + entitlement guards
 * (`../projects/guards.js`) + delegate here. Tenancy + the entitlement
 * decision stay in the wrapper; the pure DB shape stays here.
 *
 * Where a write resolves a lens from a parent record and must guard that
 * resolved lens (e.g. createTask resolves the project's lens), the core
 * accepts an optional `assertLens` callback the wrapper injects. The callback
 * carries the entitlement decision; the core stays framework-free.
 *
 * Differences from the webapp original are type-level only: the Prisma
 * client types became the seam's (`../db`), the loose `Entities = Record<string,
 * any>` became named delegate slices, and relative imports use `.js`.
 */

import { taskPermalinkSource, uniquePermalink } from "../shared/permalinks.js";
import type {
  GoalDelegate,
  ProjectCreateArgs,
  ProjectDelegate,
  ProjectDetailRow,
  ProjectListRow,
  ProjectWhereInput,
  TaskCreateArgs,
  TaskDelegate,
} from "../db/index.js";

// Row interfaces the seam's delegates reference — re-exported so callers
// import payloads from the core (one definition, unchanged shapes).
export type { ProjectListRow, ProjectDetailRow };

/** getProjectsData's projection: the pruned summary the Projects cards render
 *  (progress counts + nextAction) — NOT the full row (webapp parity). */
export interface ProjectSummaryRow {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  dueDate: Date | null;
  isDone: boolean;
  type: "STANDARD" | "SIMPLE_LIST";
  completedAt: Date | null;
  archivedAt: Date | null;
  goal: { id: string; name: string } | null;
  openCount: number;
  doneCount: number;
  openItems: number;
  checkedItems: number;
  nextAction: ProjectListRow["tasks"][number] | null;
  resources: ProjectListRow["resources"];
}

/** getProjectData's projection: the detail payload the work surface renders
 *  (lensId included so new tasks scope to the PROJECT's lens). */
export type ProjectDetailResult = {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  dueDate: Date | null;
  isDone: boolean;
  type: "STANDARD" | "SIMPLE_LIST";
  archivedAt: Date | null;
  order: number;
  lensId: string;
  goal: { id: string; permalink: string; name: string } | null;
  tasks: ProjectDetailRow["tasks"];
  resources: ProjectDetailRow["resources"];
  attachments: ProjectDetailRow["attachments"];
} | null;

/**
 * The entities slice these cores read — the seam's delegates (named, not a
 * loose map). `createEntities(db)` satisfies it; Vitest mocks cast with
 * `as Parameters<typeof core>[0]` + a SAFETY comment.
 */
export interface ProjectEntities {
  Project: ProjectDelegate;
  Goal: GoalDelegate;
  Task: TaskDelegate;
  Lens: import("../db/index.js").LensDelegate;
  ListItem: import("../db/index.js").ListItemDelegate;
  InboxItem: import("../db/index.js").InboxItemDelegate;
  Resource: import("../db/index.js").ResourceDelegate;
}

// ----------------------------------------------------------------
// Read: projects list for the Projects page (with progress + nextAction)
// ----------------------------------------------------------------
// Two queries: the list with includes (open task counts + the top open task),
// then a done-totals rollup merged into a per-project progress fraction.
export async function getProjectsData(
  entities: Pick<ProjectEntities, "Project">,
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
): Promise<ProjectSummaryRow[]> {
  const where: ProjectWhereInput = { userId, lensId };
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
      // the project's momentum. List-item counts feed SIMPLE_LIST rows.
      _count: {
        select: {
          tasks: { where: { isDone: false, status: { not: "WONT_DO" } } },
          listItems: { where: { isDone: false } },
        },
      },
    },
  });

  // Total task count (done + open) for the progress fraction.
  const where2: ProjectWhereInput = { userId, lensId };
  if (!includeArchived) where2.archivedAt = null;
  if (!includeCompleted) where2.isDone = false;
  const totals = await entities.Project.findMany({
    where: where2,
    select: {
      id: true,
      _count: {
        select: {
          tasks: { where: { isDone: true } },
          listItems: { where: { isDone: true } },
        },
      },
    },
  });
  const doneCount = new Map(
    totals.map((p) => [p.id, p._count.tasks]),
  );
  const checkedCount = new Map(
    totals.map((p) => [p.id, p._count.listItems]),
  );

  return projects.map((p) => ({
    id: p.id,
    permalink: p.permalink,
    name: p.name,
    description: p.description,
    dueDate: p.dueDate,
    isDone: p.isDone,
    type: p.type,
    completedAt: p.completedAt,
    archivedAt: p.archivedAt,
    goal: p.goal,
    openCount: p._count.tasks, // open (non-done) tasks
    doneCount: doneCount.get(p.id) ?? 0,
    openItems: p._count.listItems, // open list items (SIMPLE_LIST rows)
    checkedItems: checkedCount.get(p.id) ?? 0,
    nextAction: p.tasks[0] ?? null, // top-priority open task
    resources: p.resources,
  }));
}

// ----------------------------------------------------------------
// Read: single project for the detail page, with its tasks
// ----------------------------------------------------------------
// Tenancy-safe (findFirst by id/permalink + userId). Returns the project
// fields plus its full task list (open first by priority, then done) so the
// page can group by horizon. lensId is included so callers can scope new
// tasks to the project's lens — NOT the active sidebar lens, which may differ.
export async function getProjectData(
  entities: Pick<ProjectEntities, "Project">,
  { userId, id }: { userId: string; id: string },
): Promise<ProjectDetailResult> {
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
          scheduledDate: true,
          snoozedUntil: true,
          completedAt: true,
          attachments: { select: { id: true, filename: true, mimeType: true } },
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
          attachments: { select: { id: true, filename: true, mimeType: true } },
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
    type: project.type,
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
// (assertUnderCap) are entitlement decisions that live in the API wrapper /
// CLI route — the wrapper runs those BEFORE calling here, so by the time this
// runs the caller has already authorized the lens and the count.
export async function createProjectCore(
  entities: Pick<ProjectEntities, "Project">,
  {
    userId,
    name,
    lensId,
    goalId,
    description,
    type = "STANDARD",
  }: {
    userId: string;
    name: string;
    lensId: string;
    goalId?: string;
    description?: string;
    type?: "STANDARD" | "SIMPLE_LIST";
  },
): Promise<Awaited<ReturnType<ProjectDelegate["create"]>>> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Project name is required.");
  }
  if (type === "SIMPLE_LIST" && goalId) {
    throw new Error("A Simple-list Project cannot sit under a Goal.");
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

  const createArgs: ProjectCreateArgs = {
    data: {
      name: trimmed,
      permalink,
      userId,
      lensId,
      goalId,
      description,
      order,
      type,
    },
    select: { id: true, permalink: true, name: true },
  };
  return await entities.Project.create(createArgs);
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
// injected by the API wrapper / CLI route so this core stays framework-free;
// pass `undefined` to skip the guard.
export async function createTaskCore(
  entities: Pick<ProjectEntities, "Project" | "Goal" | "Task">,
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
): Promise<{ id: string; permalink: string }> {
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

  const createArgs: TaskCreateArgs = {
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
  };
  const task = await entities.Task.create(createArgs);
  return { id: task.id, permalink: task.permalink };
}
