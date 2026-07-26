/**
 * Pure lens-operation cores — the shared DB layer for both the Wasp server ops
 * (`./operations.ts`) and the `/api/cli/lens/*` PAT routes.
 *
 * Pattern (mirrors `projects/operationsCore.ts`): every core takes `entities`
 * as its first arg (loosely typed — any Prisma-client-shaped object works)
 * plus plain args, does the DB work, and returns data. **No `wasp/server`
 * import lives here.** Wasp's detectServerImports plugin blocks `wasp/server`
 * under `src/` in the client build Vitest uses, so keeping this pure keeps it
 * unit-testable and importable from both worlds.
 *
 * Only the *read* cores live here — the lens config actions (create/update/
 * delete) are Pro-only and stay in the Wasp op layer for now (the CLI surface
 * is list + show + switch; create/delete belong to the desktop UI per the
 * lens-management spec). If a CLI route ever needs to mutate lenses, extract
 * those into pure cores here first, the same way `createProjectCore` was.
 */

/**
 * The entities slice these cores read. Loosely typed (same approach as
 * `entitlements.ts` + `projects/operationsCore.ts`): callers pass Wasp's
 * Prisma delegate, a test mock, or a PAT route's Prisma client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

// Seeded-first display order: PERSONAL, then WORK, then CUSTOM by createdAt.
// Mirrors the sort in `getLenses` (operations.ts) — Prisma can't express
// "seeded first" cleanly (kind is an enum, alphabetical order is
// CUSTOM < PERSONAL < WORK — the opposite of what we want), so sort in JS.
const KIND_ORDER: Record<string, number> = { PERSONAL: 0, WORK: 1, CUSTOM: 2 };

export type LensSummary = {
  id: string;
  name: string;
  kind: "PERSONAL" | "WORK" | "CUSTOM";
  color: string | null;
  purpose: string | null;
  counts: { goals: number; projects: number; tasks: number };
};

export type LensDetail = LensSummary & { createdAt: string };

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
  entities: Entities,
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
    },
  });
  lenses.sort(
    (
      a: { kind: string; createdAt: string },
      b: { kind: string; createdAt: string },
    ) => {
      const byKind = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
      if (byKind !== 0) return byKind;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    },
  );
  return lenses.map(
    (l: {
      id: string;
      name: string;
      kind: "PERSONAL" | "WORK" | "CUSTOM";
      color: string | null;
      purpose: string | null;
      createdAt: string;
      _count: { goals: number; projects: number; tasks: number };
    }): LensSummary => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      color: l.color,
      purpose: l.purpose,
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
  entities: Entities,
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
    },
  });
  if (!lens) return null;
  return {
    id: lens.id,
    name: lens.name,
    kind: lens.kind,
    color: lens.color,
    purpose: lens.purpose,
    createdAt: lens.createdAt,
    counts: {
      goals: lens._count.goals,
      projects: lens._count.projects,
      tasks: lens._count.tasks,
    },
  };
}
