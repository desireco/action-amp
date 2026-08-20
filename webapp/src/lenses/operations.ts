import type {
  CreateLens,
  UpdateLens,
  DeleteLens,
  GetLenses,
} from "wasp/server/operations";
import { PrismaClient } from "@prisma/client";
import { PRO_LIMITS } from "../billing/config";
import {
  assertLensConfigAllowed,
  assertUnderCap,
  throwHttpStatus,
} from "../billing/entitlementHttp";
import { getLensesCore, type LensSummary } from "./operationsCore";

const prisma = new PrismaClient();

/** The tx-client slice the lens reassignment transaction uses. */
interface LensTxClient {
  goal: {
    updateMany(args: {
      where: { lensId: string };
      data: { lensId: string };
    }): Promise<{ count: number }>;
  };
  task: {
    updateMany(args: {
      where: { lensId: string };
      data: { lensId: string };
    }): Promise<{ count: number }>;
  };
  project: {
    updateMany(args: {
      where: { lensId: string };
      data: { lensId: string };
    }): Promise<{ count: number }>;
  };
  lens: {
    delete(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
}

/**
 * Injectable transaction runner — the seam for the ONE place this module
 * needs its direct Prisma client (the cross-entity lens reassignment needs a
 * real $transaction, which Wasp's per-op entities can't provide). Tests swap
 * the property (see operations.test.ts); production always uses the client.
 */
export const lensDb = {
  transaction: <T>(fn: (tx: LensTxClient) => Promise<T>): Promise<T> =>
    prisma.$transaction(fn),
};

/**
 * Lens CRUD + list — user-defined life contexts (Pro only).
 *
 * getLenses returns every lens with per-lens counts (goals/projects/tasks) for
 * the Settings Lenses tab. The three actions (create/update/delete) are
 * tenancy-scoped and enforce entitlements: `assertLensConfigAllowed` gates the
 * whole surface to Pro (FREE configures nothing — they get the seeded two and
 * that's it), and `assertUnderCap` soft-caps Pro at `PRO_LIMITS.lenses`.
 *
 * Default lenses are renameable + recolorable but NOT deletable or
 * type-convertible. Their names are ordinary user-facing names.
 *
 * HTTP errors (404/409/400) go through `throwHttpStatus` from entitlementHttp
 * (the one src/ file licensed to import wasp/server), so this file never
 * imports wasp/server directly and stays unit-testable via the standard mock.
 */

/**
 * All lenses for the Settings Lenses tab, with per-lens counts. Sorted seeded
 * first (PERSONAL, then WORK) then by createdAt — the stable display order
 * (no reorder feature yet; that's a non-goal per the spec).
 */
export const getLenses = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return getLensesCore(context.entities, { userId: context.user.id });
}) satisfies GetLenses<Record<string, never>, LensSummary[]>;

/** The curated color palette keys (see styles/tokens.css `--aa-lens-*`).
 * Free-form hex is a non-goal per the spec; the picker renders these only. */
const LENS_COLORS = [
  "indigo",
  "emerald",
  "slate",
  "cyan",
  "coral",
  "honey",
  "lime",
  "magenta",
] as const;
type LensColor = (typeof LENS_COLORS)[number];

function isLensColor(s: unknown): s is LensColor {
  // SAFETY: narrowing readonly string array for .includes() call.
  return (
    typeof s === "string" && (LENS_COLORS as readonly string[]).includes(s)
  );
}

type LensContentEntities = {
  Goal: { count: (args: { where: { lensId: string } }) => Promise<number> };
  Project: { count: (args: { where: { lensId: string } }) => Promise<number> };
  Task: { count: (args: { where: { lensId: string } }) => Promise<number> };
};

type LensUpdateArgs = {
  id: string;
  name?: string;
  purpose?: string;
  color?: string | null;
};
type LensUpdateData = {
  name?: string;
  purpose?: string | null;
  color?: string | null;
};

async function lensHasContent(
  entities: LensContentEntities,
  lensId: string,
): Promise<boolean> {
  const counts = await Promise.all([
    entities.Goal.count({ where: { lensId } }),
    entities.Project.count({ where: { lensId } }),
    entities.Task.count({ where: { lensId } }),
  ]);
  return counts.some((count) => count > 0);
}

function buildLensUpdateData(args: LensUpdateArgs): LensUpdateData {
  const data: LensUpdateData = {};
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw new Error("Lens name cannot be empty.");
    data.name = name;
  }
  if (args.purpose !== undefined) data.purpose = args.purpose.trim() || null;
  if (args.color !== undefined) {
    if (args.color !== null && !isLensColor(args.color)) {
      throwHttpStatus(400, "Unknown lens color.");
    }
    data.color = args.color;
  }
  return data;
}

export const createLens = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const name = args.name?.trim();
  if (!name) {
    throw new Error("Lens name is required.");
  }
  if (
    args.color !== undefined &&
    args.color !== null &&
    !isLensColor(args.color)
  ) {
    throwHttpStatus(400, "Unknown lens color.");
  }
  const purpose = args.purpose?.trim() || null;

  // Entitlement: lens configuration is Pro-only. Cap check uses Pro because
  // FREE never reaches here (the config gate above throws first).
  assertLensConfigAllowed(context);
  const lensCount = await context.entities.Lens.count({
    where: { userId: context.user.id },
  });
  await assertUnderCap(context, "", lensCount, PRO_LIMITS.lenses, {
    feature: `a ${PRO_LIMITS.lenses + 1}th lens`,
    reason: "more life contexts unlock with Pro",
  });

  try {
    return await context.entities.Lens.create({
      data: {
        name,
        isDefault: false,
        isIncluded: false,
        color: args.color ?? null,
        purpose,
        userId: context.user.id,
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
  } catch (e) {
    // Prisma P2002 = unique constraint violation on [userId, name].
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      throwHttpStatus(409, `You already have a lens named "${name}".`);
    }
    throw e;
  }
}) satisfies CreateLens<
  {
    name: string;
    color?: string | null;
    purpose?: string;
  },
  {
    id: string;
    name: string;
    isDefault: boolean;
    isIncluded: boolean;
    color: string | null;
    purpose: string | null;
  }
>;

export const updateLens = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  assertLensConfigAllowed(context);

  // Tenancy-scoped lookup (Lens has no compound id+userId index → findFirst).
  const existing = await context.entities.Lens.findFirst({
    where: { id: args.id, userId: context.user.id },
    select: { id: true, name: true, isDefault: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Lens not found.");
  }

  const data = buildLensUpdateData(args);

  if (args.name !== undefined && args.name.trim() !== existing.name) {
    // Rename: enforce [userId, name] uniqueness. A collision throws P2002 on
    // update — catch and rethrow as a 409 so the UI can show a clean message.
    try {
      return await context.entities.Lens.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          name: true,
          isDefault: true,
          isIncluded: true,
          color: true,
          purpose: true,
        },
      });
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        throwHttpStatus(409, `You already have a lens named "${data.name}".`);
      }
      throw e;
    }
  }

  return await context.entities.Lens.update({
    where: { id: existing.id },
    data,
    select: {
      id: true,
      name: true,
      isDefault: true,
      isIncluded: true,
      color: true,
      purpose: true,
    },
  });
}) satisfies UpdateLens<
  LensUpdateArgs,
  {
    id: string;
    name: string;
    isDefault: boolean;
    isIncluded: boolean;
    color: string | null;
    purpose: string | null;
  }
>;

export const deleteLens = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  assertLensConfigAllowed(context);

  const existing = await context.entities.Lens.findFirst({
    where: { id: args.id, userId: context.user.id },
    select: { id: true, isDefault: true, name: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Lens not found.");
  }
  // The seeded lenses are the stable handles — never deletable.
  if (existing.isDefault) {
    throwHttpStatus(
      409,
      `The "${existing.name}" lens can't be deleted — it's one of your defaults.`,
    );
  }

  if (args.mode === "reassign") {
    if (!args.targetLensId || args.targetLensId === args.id) {
      throwHttpStatus(400, "Choose a different lens to move content into.");
    }
    // Tenancy-check the target.
    const target = await context.entities.Lens.findFirst({
      where: { id: args.targetLensId, userId: context.user.id },
      select: { id: true },
    });
    if (!target) {
      throwHttpStatus(404, "Target lens not found.");
    }
    // Move all content to the target lens, then drop the now-empty lens. Keep
    // the multi-entity move transactional so a later failure rolls back earlier
    // updates. Goal has @@unique([userId, name]) (global, not per-lens), so a
    // same-named goal in the target lens can collide on updateMany; rewrite that
    // Prisma P2002 into guidance the UI can show.
    const moveWhere = { lensId: existing.id };
    const moveData = { lensId: args.targetLensId };
    try {
      return await lensDb.transaction(async (tx) => {
        await tx.goal.updateMany({ where: moveWhere, data: moveData });
        await tx.task.updateMany({ where: moveWhere, data: moveData });
        await tx.project.updateMany({ where: moveWhere, data: moveData });
        return await tx.lens.delete({
          where: { id: existing.id },
          select: { id: true },
        });
      });
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        throwHttpStatus(
          409,
          "A goal in this lens shares a name with one in the target lens. Rename it first, then retry.",
        );
      }
      throw e;
    }
  }

  // mode === "delete" (hard) — only allowed when the lens is EMPTY. The spec's
  // "no silent cascade delete" rule: a lens with content must be reassigned
  // (mode: "reassign"), not hard-deleted, so nothing is lost by accident. The
  // UI enforces this too (the dialog defaults to reassign when content exists),
  // but the server is the boundary. Cascade via the Goal/Project/Task FKs
  // (ON DELETE CASCADE in schema.prisma) removes any stragglers an empty lens
  // wouldn't have anyway.
  if (await lensHasContent(context.entities, existing.id)) {
    return throwHttpStatus(
      409,
      "This lens still has content. Move it to another lens first, then delete.",
    );
  }
  return await context.entities.Lens.delete({
    where: { id: existing.id },
    select: { id: true },
  });
}) satisfies DeleteLens<
  { id: string; mode: "delete" | "reassign"; targetLensId?: string },
  { id: string }
>;
