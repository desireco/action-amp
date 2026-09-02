/**
 * Lens CRUD cores — the DB bodies of `webapp/src/lenses/operations.ts`'s
 * createLens / updateLens / deleteLens Wasp ops (S11 Lenses tab), ported to
 * pure `(entities, args)` functions the same way the goals ops became
 * lifecycle cores. The entitlement guards (`assertLensConfigAllowed` +
 * `assertUnderCap`) stay at the API wrapper — their placement (before the
 * count/create) is parity-critical and lives in api's lens fragment.
 *
 * Error surface unchanged: validation failures throw plain `Error`s (the
 * webapp 400 messages), tenancy/404/409 go through `throwHttpStatus` from
 * ../projects/httpError.js, and Prisma P2002 unique violations (postgres 23505
 * at the seam) are rewritten to the webapp's exact 409 strings.
 */

import { throwHttpStatus } from "../projects/httpError.js";
import { isUniqueViolation } from "../goals/lifecycleCore.js";
import type { LensCountArgs, LensCreateArgs, LensCreated, LensDeleteArgs, LensUpdateArgs } from "../db/index.js";

/** The write slice: tenancy lookups + the CRUD writes + the content counts. */
export interface LensWriteEntities {
  Lens: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { id: true; name: true; isDefault: true };
    }): Promise<{ id: string; name: string; isDefault: boolean } | null>;
    count(args: LensCountArgs): Promise<number>;
    create(args: LensCreateArgs): Promise<LensCreated>;
    update(args: LensUpdateArgs): Promise<LensCreated>;
    delete(args: LensDeleteArgs): Promise<{ id: string }>;
  };
  Goal: { count(args: { where: { lensId: string } }): Promise<number> };
  Project: { count(args: { where: { lensId: string } }): Promise<number> };
  Task: { count(args: { where: { lensId: string } }): Promise<number> };
}

/** The tx-client slice the lens reassignment transaction uses (webapp's
 *  `LensTxClient` — the transaction runner is injected, see LensTxRunner). */
export interface LensTxClient {
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
 * Injectable transaction runner — the seam for the ONE place lens deletion
 * needs a real transaction (the cross-entity reassignment). The webapp op
 * swapped a module-level `lensDb.transaction`; the port passes it explicitly
 * (the API builds one over drizzle's `db.transaction`, see lensTx.js; tests
 * hand a fake).
 */
export type LensTxRunner = <T>(fn: (tx: LensTxClient) => Promise<T>) => Promise<T>;

/** The curated color palette keys (styles/tokens.css `--aa-lens-*`).
 * Free-form hex is a non-goal per the spec; the picker renders these only. */
export const LENS_COLORS = [
  "indigo",
  "emerald",
  "slate",
  "cyan",
  "coral",
  "honey",
  "lime",
  "magenta",
] as const;
export type LensColor = (typeof LENS_COLORS)[number];

export function isLensColor(s: unknown): s is LensColor {
  // SAFETY: narrowing readonly string array for .includes() call.
  return (
    typeof s === "string" && (LENS_COLORS as readonly string[]).includes(s)
  );
}

type LensContentEntities = Pick<LensWriteEntities, "Goal" | "Project" | "Task">;

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

type LensUpdateArgsInput = {
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

function buildLensUpdateData(args: LensUpdateArgsInput): LensUpdateData {
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

/**
 * Create an ordinary (non-default, not-included) lens. Validation matches
 * the webapp op byte-for-byte; the Pro gate + soft cap run in the wrapper.
 */
export async function createLensCore(
  entities: LensWriteEntities,
  {
    userId,
    name,
    color,
    purpose,
  }: { userId: string; name: string; color?: string | null; purpose?: string },
): Promise<LensCreated> {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new Error("Lens name is required.");
  }
  if (color !== undefined && color !== null && !isLensColor(color)) {
    throwHttpStatus(400, "Unknown lens color.");
  }
  const trimmedPurpose = purpose?.trim() || null;

  try {
    return await entities.Lens.create({
      data: {
        name: trimmed,
        isDefault: false,
        isIncluded: false,
        color: color ?? null,
        purpose: trimmedPurpose,
        userId,
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
    if (isUniqueViolation(e)) {
      throwHttpStatus(409, `You already have a lens named "${trimmed}".`);
    }
    throw e;
  }
}

/**
 * Edit name / purpose / color of an owned lens. Seeded lenses are editable
 * (rename + recolor; delete is refused in deleteLensCore). Rename collisions
 * on the [userId, name] unique become 409s.
 */
export async function updateLensCore(
  entities: LensWriteEntities,
  args: LensUpdateArgsInput & { userId: string },
): Promise<LensCreated> {
  const { userId, ...rest } = args;
  // Tenancy-scoped lookup (Lens has no compound id+userId index → findFirst).
  const existing = await entities.Lens.findFirst({
    where: { id: rest.id, userId },
    select: { id: true, name: true, isDefault: true },
  });
  if (!existing) {
    throwHttpStatus(404, "Lens not found.");
  }

  const data = buildLensUpdateData(rest);

  if (rest.name !== undefined && rest.name.trim() !== existing.name) {
    // Rename: enforce [userId, name] uniqueness. A collision throws P2002 on
    // update — catch and rethrow as a 409 so the UI can show a clean message.
    try {
      return await entities.Lens.update({
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
      if (isUniqueViolation(e)) {
        throwHttpStatus(409, `You already have a lens named "${data.name}".`);
      }
      throw e;
    }
  }

  return await entities.Lens.update({
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
}

/**
 * Delete with an explicit content disposition:
 * - `reassign`: move every Goal/Task/Project to `targetLensId` inside a real
 *   transaction, then drop the now-empty lens. A same-named Goal in the
 *   target (Goal has @@unique([userId, name]) globally) rewrites to a 409
 *   with guidance — nothing moves.
 * - `delete`: hard delete, EMPTY lenses only. "No silent cascade delete" —
 *   a lens with content must be reassigned, so nothing is lost by accident.
 *   The UI enforces this too (the dialog defaults to reassign when content
 *   exists), but the server is the boundary.
 */
export async function deleteLensCore(
  entities: LensWriteEntities,
  {
    userId,
    id,
    mode,
    targetLensId,
  }: { userId: string; id: string; mode: "delete" | "reassign"; targetLensId?: string },
  transaction: LensTxRunner,
): Promise<{ id: string }> {
  const existing = await entities.Lens.findFirst({
    where: { id, userId },
    select: { id: true, name: true, isDefault: true },
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

  if (mode === "reassign") {
    if (!targetLensId || targetLensId === id) {
      throwHttpStatus(400, "Choose a different lens to move content into.");
    }
    // Tenancy-check the target.
    const target = await entities.Lens.findFirst({
      where: { id: targetLensId, userId },
      select: { id: true, name: true, isDefault: true },
    });
    if (!target) {
      throwHttpStatus(404, "Target lens not found.");
    }
    // Move all content to the target lens, then drop the now-empty lens. Keep
    // the multi-entity move transactional so a later failure rolls back
    // earlier updates.
    const moveWhere = { lensId: existing.id };
    const moveData = { lensId: targetLensId };
    try {
      return await transaction(async (tx) => {
        await tx.goal.updateMany({ where: moveWhere, data: moveData });
        await tx.task.updateMany({ where: moveWhere, data: moveData });
        await tx.project.updateMany({ where: moveWhere, data: moveData });
        return await tx.lens.delete({
          where: { id: existing.id },
          select: { id: true },
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throwHttpStatus(
          409,
          "A goal in this lens shares a name with one in the target lens. Rename it first, then retry.",
        );
      }
      throw e;
    }
  }

  // mode === "delete" (hard) — only allowed when the lens is EMPTY. Cascade
  // via the Goal/Project/Task FKs (ON DELETE CASCADE in schema.prisma)
  // removes any stragglers an empty lens wouldn't have anyway.
  if (await lensHasContent(entities, existing.id)) {
    throwHttpStatus(
      409,
      "This lens still has content. Move it to another lens first, then delete.",
    );
  }
  return await entities.Lens.delete({
    where: { id: existing.id },
    select: { id: true },
  });
}
