// Rituals — the Drizzle-backed delegates (`createRitualEntities`), shipped
// beside the core that needs them (the simpleLists precedent: the seam's
// `createEntities` stays frozen; feature delegates bind over the SAME
// `DomainDb` handle following client.ts's conventions — uuid PKs minted on
// create (`mintId()`), `updatedAt` re-stamped on updates, `undefined` leaves
// a column untouched / `null` writes NULL, missing rows on update throw the
// P2025 analogue). Tests fake these slices with vi.fn() spies.
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { lens, ritual, ritualEntry } from "../db/schema/index.js";
import { mintId } from "../db/client.js";
import type { DomainDb } from "../db/client.js";
import type { RitualEntities } from "./operationsCore.js";

function assertFound(row: unknown | undefined, model: string): void {
  if (row === undefined || row === null) {
    throw new Error(`${model} not found.`);
  }
}

export function createRitualEntities(db: DomainDb): RitualEntities {
  return {
    Ritual: {
      findFirst: async (args) => {
        const rows = await db
          .select()
          .from(ritual)
          .where(and(eq(ritual.id, args.where.id), eq(ritual.userId, args.where.userId)))
          .limit(1);
        return rows[0] ?? null;
      },
      findMany: async (args) => {
        // Archived rows never list (history stays queryable via entries).
        // Paused rows stay on the Planning list (`includePaused`) and are
        // hidden from the Today due set otherwise.
        const conditions = [eq(ritual.userId, args.where.userId), isNull(ritual.archivedAt)];
        if (args.where.lensId !== undefined) {
          conditions.push(eq(ritual.lensId, args.where.lensId));
        }
        if (!args.where.includePaused) conditions.push(isNull(ritual.pausedAt));
        return db
          .select()
          .from(ritual)
          .where(and(...conditions))
          .orderBy(asc(ritual.order), asc(ritual.createdAt));
      },
      findMaxOrder: async (args) => {
        const rows = await db
          .select({ order: ritual.order })
          .from(ritual)
          .where(and(eq(ritual.userId, args.where.userId), eq(ritual.lensId, args.where.lensId)))
          .orderBy(desc(ritual.order))
          .limit(1);
        return rows[0]?.order ?? null;
      },
      create: async (args) => {
        const now = new Date();
        const inserted = await db
          .insert(ritual)
          .values({
            id: mintId(),
            userId: args.data.userId,
            lensId: args.data.lensId,
            name: args.data.name,
            interval: args.data.interval,
            cadence: args.data.cadence,
            weekday: args.data.weekday,
            intervalDays: args.data.intervalDays,
            guidance: args.data.guidance,
            benefit: args.data.benefit,
            goalId: args.data.goalId,
            order: args.data.order,
            pausedAt: null,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const row = inserted[0];
        assertFound(row, "Ritual");
        return row;
      },
      update: async (args) => {
        const rows = await db
          .update(ritual)
          .set({ ...args.data, updatedAt: new Date() })
          .where(eq(ritual.id, args.where.id))
          .returning();
        const row = rows[0];
        assertFound(row, "Ritual");
        return row;
      },
    },
    RitualEntry: {
      findFirst: async (args) => {
        const rows = await db
          .select()
          .from(ritualEntry)
          .where(
            and(
              eq(ritualEntry.ritualId, args.where.ritualId),
              eq(ritualEntry.localDate, args.where.localDate),
            ),
          )
          .limit(1);
        return rows[0] ?? null;
      },
      findMany: async (args) => {
        if (args.where.ritualIds.length === 0) return [];
        return db
          .select()
          .from(ritualEntry)
          .where(
            and(
              inArray(ritualEntry.ritualId, args.where.ritualIds),
              eq(ritualEntry.localDate, args.where.localDate),
            ),
          );
      },
      create: async (args) => {
        const inserted = await db
          .insert(ritualEntry)
          .values({
            id: mintId(),
            ritualId: args.data.ritualId,
            userId: args.data.userId,
            localDate: args.data.localDate,
            mood: args.data.mood,
            note: args.data.note,
            createdAt: new Date(),
          })
          .returning();
        const row = inserted[0];
        assertFound(row, "RitualEntry");
        return row;
      },
      update: async (args) => {
        const rows = await db
          .update(ritualEntry)
          .set(args.data)
          .where(eq(ritualEntry.id, args.where.id))
          .returning();
        const row = rows[0];
        assertFound(row, "RitualEntry");
        return row;
      },
      delete: async (args) => {
        await db
          .delete(ritualEntry)
          .where(
            and(
              eq(ritualEntry.ritualId, args.where.ritualId),
              eq(ritualEntry.localDate, args.where.localDate),
            ),
          );
      },
    },
    Lens: {
      findNames: async (args) => {
        return db
          .select({ id: lens.id, name: lens.name })
          .from(lens)
          .where(eq(lens.userId, args.where.userId));
      },
    },
  };
}
