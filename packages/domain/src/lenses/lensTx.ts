// S7/S11 — the real transaction runner for deleteLensCore's reassign mode,
// built over drizzle's `db.transaction` (the same beside-the-core delegate
// pattern as ../tasks/extrasEntities.js: the seam's Entities carry no
// transaction, so the one cross-entity write gets its own runner over the
// SAME DomainDb handle).
import { eq } from "drizzle-orm";
import { goal, lens, project, task } from "../db/schema/index.js";
import type { DomainDb } from "../db/client.js";
import type { LensTxClient, LensTxRunner } from "./lifecycleCore.js";

function assertFound(row: unknown | undefined): void {
  if (row === undefined || row === null) {
    // Prisma's P2025 analogue — deleteLensCore pre-checks existence, so this
    // fires only on a race between the read and the transactional delete.
    throw new Error("Lens not found.");
  }
}

/** Build a LensTxRunner over an open database handle. */
export function createLensTxRunner(db: DomainDb): LensTxRunner {
  return <T>(fn: (tx: LensTxClient) => Promise<T>): Promise<T> =>
    db.transaction(async (tx): Promise<T> => {
      const client: LensTxClient = {
        goal: {
          updateMany: async (args) => {
            const rows = await tx
              .update(goal)
              .set(args.data)
              .where(eq(goal.lensId, args.where.lensId))
              .returning({ id: goal.id });
            return { count: rows.length };
          },
        },
        task: {
          updateMany: async (args) => {
            const rows = await tx
              .update(task)
              .set(args.data)
              .where(eq(task.lensId, args.where.lensId))
              .returning({ id: task.id });
            return { count: rows.length };
          },
        },
        project: {
          updateMany: async (args) => {
            const rows = await tx
              .update(project)
              .set(args.data)
              .where(eq(project.lensId, args.where.lensId))
              .returning({ id: project.id });
            return { count: rows.length };
          },
        },
        lens: {
          delete: async (args) => {
            const rows = await tx
              .delete(lens)
              .where(eq(lens.id, args.where.id))
              .returning({ id: lens.id });
            assertFound(rows[0]);
            return { id: rows[0].id };
          },
        },
      };
      return fn(client);
    });
}
