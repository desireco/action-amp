/**
 * Pure logbook-operation cores — the shared DB layer for both the Wasp server
 * op (`./operations.ts`) and future `/api/cli/*` PAT routes.
 *
 * Pattern (mirrors `tasks/operationsCore.ts`): the core takes `entities` as
 * its first arg (loosely typed — any Prisma-client-shaped object works) plus
 * plain args, does the DB work, and returns data. **No `wasp/server` import
 * lives here** (Wasp's detectServerImports plugin blocks it under `src/` in the
 * client build Vitest uses, so keeping this pure keeps it unit-testable and
 * importable from both worlds).
 *
 * The Wasp op becomes a thin wrapper: auth check + entitlement guard
 * (assertLensAllowed) + delegate here. Note: getLogbook currently lacks
 * assertLensAllowed in the Wasp op; a CLI route should add it. The core itself
 * takes the args and does the queries; the caller decides entitlement.
 */

/**
 * The entities slice this core reads. Loosely typed (same approach as
 * `entitlements.ts` / `tasks/operationsCore.ts`): callers pass Wasp's Prisma
 * delegate, a test mock, or a PAT route's Prisma client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

// ----------------------------------------------------------------
// Read: the Logbook — things no longer active, scoped to a Lens
// ----------------------------------------------------------------
// Five categories, all read-only except the wont-do restore (which lives in
// the Wasp op layer — `updateTaskStatus`):
//  - completed Tasks  (isDone, completedAt)
//  - wont-do Tasks    (status=WONT_DO — "I considered this and chose not to")
//  - completed Projects
//  - completed Goals  (goal-planning spec §D — same shape as projects, with
//                      goal: null since a goal has no parent goal)
//  - archived InboxItems ("I will not do now") — status ARCHIVED, archivedAt.
//
// Scoping note: Tasks, Projects, and Goals carry a lensId; archived InboxItems
// do NOT (the inbox is universal). Archived notes are returned regardless of
// the active lens — they belong to the user, not a context.
export async function getLogbookData(
  entities: Entities,
  { userId, lensId }: { userId: string; lensId: string },
) {
  const [tasks, wontDo, projects, goals, archived] = await Promise.all([
    entities.Task.findMany({
      where: {
        userId,
        lensId,
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        description: true,
        completedAt: true,
        size: true,
        outcome: true,
        project: { select: { id: true, name: true } },
      },
    }),
    // Won't-do tasks — status=WONT_DO. The "I considered and chose not to do
    // this" bucket. Restorable to a horizon via updateTaskStatus (the Logbook
    // UI is the only place reactivation lives; the task detail view is one-way).
    entities.Task.findMany({
      where: {
        userId,
        lensId,
        status: "WONT_DO",
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        description: true,
        updatedAt: true,
        size: true,
        project: { select: { id: true, name: true } },
      },
    }),
    entities.Project.findMany({
      where: {
        userId,
        lensId,
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        name: true,
        completedAt: true,
        goal: { select: { id: true, name: true } },
      },
    }),
    // Completed Goals — lens-scoped like tasks/projects (goal-planning spec §D).
    entities.Goal.findMany({
      where: {
        userId,
        lensId,
        isDone: true,
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        name: true,
        completedAt: true,
      },
    }),
    // Archived notes — universal (no lens filter).
    entities.InboxItem.findMany({
      where: {
        userId,
        status: "ARCHIVED",
      },
      orderBy: { archivedAt: "desc" },
      select: {
        id: true,
        text: true,
        archivedAt: true,
      },
    }),
  ]);

  return {
    tasks: tasks.map((t: { id: string; description: string; completedAt: Date | null; size: unknown; outcome: unknown; project: unknown }) => ({
      id: t.id,
      title: t.description,
      completedAt: t.completedAt!,
      size: t.size,
      outcome: t.outcome,
      project: t.project,
      kind: "task" as const,
    })),
    wontDo: wontDo.map((t: { id: string; description: string; updatedAt: Date | null; size: unknown; project: unknown }) => ({
      id: t.id,
      title: t.description,
      completedAt: t.updatedAt!,
      size: t.size,
      project: t.project,
      kind: "wont-do" as const,
    })),
    projects: projects.map((p: { id: string; name: string; completedAt: Date | null; goal: unknown }) => ({
      id: p.id,
      title: p.name,
      completedAt: p.completedAt!,
      goal: p.goal,
      kind: "project" as const,
    })),
    goals: goals.map((g: { id: string; name: string; completedAt: Date | null }) => ({
      id: g.id,
      title: g.name,
      completedAt: g.completedAt!,
      goal: null,
      kind: "goal" as const,
    })),
    archived: archived.map((a: { id: string; text: string; archivedAt: Date | null }) => ({
      id: a.id,
      title: a.text,
      archivedAt: a.archivedAt!,
      kind: "archived" as const,
    })),
  };
}
