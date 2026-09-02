/**
 * Pure lens-operation cores — ported from
 * `webapp/src/lenses/operationsCore.ts` (S7), which serves the Settings
 * Lenses tab and the `/api/cli/lens/*` PAT routes (S18). Signatures
 * unchanged: every core takes `entities` as its first argument plus plain
 * args, does the DB work, and returns data. No framework import.
 *
 * Only the *read* cores lived in the webapp core — the lens config actions
 * (create/update/delete) were Pro-only Wasp ops; their DB bodies port to
 * `./lifecycleCore.js` the same way the goals ops became lifecycle cores.
 */

import type {
  LensFindFirstArgs,
  LensFindManyArgs,
  LensSummaryInclude,
  LensSummaryRow,
} from "../db/index.js";

/**
 * The entities slice these cores read. The delegates carry the webapp ops'
 * exact query shapes (see the seam's `LensSummaryInclude`).
 */
export interface LensReadEntities {
  Lens: {
    findMany(
      args: {
        where: { userId: string };
        orderBy: { createdAt: "asc" };
        include: LensSummaryInclude;
      } & Omit<LensFindManyArgs, "where" | "orderBy" | "select">,
    ): Promise<LensSummaryRow[]>;
    findFirst(
      args: {
        where: { userId: string; OR: [{ id: string }, { name: string }] };
        include: LensSummaryInclude;
      } & Omit<LensFindFirstArgs, "where" | "select">,
    ): Promise<LensSummaryRow | null>;
  };
}

export type LensSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  isIncluded: boolean;
  color: string | null;
  purpose: string | null;
  hasAnyContent: boolean;
  blockingProjects: { id: string; name: string }[];
  counts: {
    goals: number;
    projects: number;
    tasks: number;
  };
};

export type LensDetail = LensSummary & { createdAt: Date | string };

// ----------------------------------------------------------------
// Read: all lenses for one user (Settings tab + CLI `lens list`)
// ----------------------------------------------------------------
// Returns every owned lens with per-lens counts (non-done goals/projects/
// tasks). Sorted seeded-first then by createdAt — the stable display order
// (no reorder feature yet; that's a non-goal per the spec). No entitlement
// gate: listing every owned lens is always allowed; gating fires on *use*
// (create/edit/lens-scoped reads), not on the listing itself. Mirrors the
// web Settings Lenses tab behavior.
export async function getLensesCore(
  entities: LensReadEntities,
  { userId }: { userId: string },
): Promise<LensSummary[]> {
  const lenses = await entities.Lens.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: {
          goals: { where: { isDone: false } },
          projects: { where: { isDone: false } },
          tasks: { where: { isDone: false } },
        },
      },
      goals: { select: { id: true }, take: 1 },
      projects: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
      tasks: { select: { id: true }, take: 1 },
    },
  });
  lenses.sort(
    (
      a: { isIncluded: boolean; isDefault: boolean; createdAt: Date | string },
      b: { isIncluded: boolean; isDefault: boolean; createdAt: Date | string },
    ) => {
      if (a.isIncluded !== b.isIncluded) return a.isIncluded ? -1 : 1;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    },
  );
  return lenses.map(
    (l: LensSummaryRow): LensSummary => ({
      id: l.id,
      name: l.name,
      isDefault: l.isDefault,
      isIncluded: l.isIncluded,
      color: l.color,
      purpose: l.purpose,
      hasAnyContent:
        l.goals.length > 0 ||
        l.projects.length > 0 ||
        l.tasks.length > 0,
      blockingProjects: l.projects,
      counts: {
        goals: l._count.goals,
        projects: l._count.projects,
        tasks: l._count.tasks,
      },
    }),
  );
}

// ----------------------------------------------------------------
// Read: single lens, resolved by id OR name (CLI `lens show` / `lens switch`)
// ----------------------------------------------------------------
// Tenancy-safe (findFirst by userId + (id OR name)). Returns null for unknown
// ids and for lenses owned by other users. Resolving by name (not just id)
// lets the CLI take `switch Work` / `show Personal` rather than forcing the
// user to copy a uuid — matches how a person actually thinks about lenses.
//
// No entitlement gate: detail reads are unguarded (same rule as
// `getProjectData` — a FREE user may have an existing Work-lens lens from
// before a downgrade, and we never block reads of owned data).
export async function getLensCore(
  entities: LensReadEntities,
  { userId, idOrName }: { userId: string; idOrName: string },
): Promise<LensDetail | null> {
  const lens = await entities.Lens.findFirst({
    where: { userId, OR: [{ id: idOrName }, { name: idOrName }] },
    include: {
      _count: {
        select: {
          goals: { where: { isDone: false } },
          projects: { where: { isDone: false } },
          tasks: { where: { isDone: false } },
        },
      },
      goals: { select: { id: true }, take: 1 },
      projects: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
      tasks: { select: { id: true }, take: 1 },
    },
  });
  if (!lens) return null;
  return {
    id: lens.id,
    name: lens.name,
    isDefault: lens.isDefault,
    isIncluded: lens.isIncluded,
    color: lens.color,
    purpose: lens.purpose,
    hasAnyContent:
      lens.goals.length > 0 ||
      lens.projects.length > 0 ||
      lens.tasks.length > 0,
    blockingProjects: lens.projects,
    createdAt: lens.createdAt,
    counts: {
      goals: lens._count.goals,
      projects: lens._count.projects,
      tasks: lens._count.tasks,
    },
  };
}
