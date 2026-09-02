// S1+S4 — the Drizzle-backed delegates for the simpleLists core
// (`createSimpleListEntities`), shipped beside the core that needs them.
//
// WHY A SECOND FACTORY: the seam's `createEntities` (../db/client.ts) carries
// exactly the delegates the F4b tasks core inventoried (Task, TaskSession,
// Lens). Extending it is the integrator's call — this batch ships its extra
// delegates beside the cores that need them, over the SAME `DomainDb` handle,
// following client.ts's conventions:
//   - uuid PKs minted on create (`mintId()`), `updatedAt` re-stamped on
//     updates (ListItem carries the column; TaskUpdate/User do not),
//   - `undefined` leaves a column untouched, `null` writes NULL,
//   - missing rows on update/delete throw the P2025 analogue.
// Tests fake these slices with vi.fn() spies (mockContext pattern) and never
// see the client-side defaults — same rule as the seam.
// (The task-lifecycle delegates — TaskUpdate/User/Project/Goal — live beside
// their cores: ../tasks/extrasEntities.ts.)
import { and, asc, desc, eq } from "drizzle-orm";
import { listItem, listItemAttachment, project } from "../db/schema/index.js";
import { mintId } from "../db/client.js";
import type { DomainDb } from "../db/client.js";
import type { ProjectType } from "../db/types.js";
import type {
  ListItemCreateData,
  ListItemRow,
  SimpleListEntities,
} from "./operationsCore.js";

function assertFound(row: unknown | undefined, model: string): void {
  if (row === undefined || row === null) {
    throw new Error(`${model} not found.`);
  }
}

// ================================================================
// Simple-list delegates (Project guard-reads + ListItem CRUD)
// ================================================================

export function createSimpleListEntities(db: DomainDb): Pick<SimpleListEntities, "Project" | "ListItem"> {
  return {
    Project: {
      findFirst: async (args) => {
        const rows = await db
          .select({ id: project.id, type: project.type })
          .from(project)
          .where(and(eq(project.id, args.where.id), eq(project.userId, args.where.userId)))
          .limit(1);
        return rows[0] ?? null;
      },
      findLens: async (args) => {
        const rows = await db
          .select({ lensId: project.lensId })
          .from(project)
          .where(and(eq(project.id, args.where.id), eq(project.userId, args.where.userId)))
          .limit(1);
        return rows[0] ?? null;
      },
      findLensByItem: async (args) => {
        const rows = await db
          .select({ projectId: listItem.projectId })
          .from(listItem)
          .where(and(eq(listItem.id, args.where.id), eq(listItem.userId, args.where.userId)))
          .limit(1);
        const projectId = rows[0]?.projectId;
        if (!projectId) return null;
        const lensRows = await db
          .select({ lensId: project.lensId })
          .from(project)
          .where(eq(project.id, projectId))
          .limit(1);
        return lensRows[0] ?? null;
      },
    },
    ListItem: {
      findFirst: async (args) => {
        if ("include" in args) {
          const rows = await db
            .select()
            .from(listItem)
            .where(and(eq(listItem.id, args.where.id), eq(listItem.userId, args.where.userId)))
            .limit(1);
          const row = rows[0];
          if (!row) return null;
          const projectRows = await db
            .select({ type: project.type })
            .from(project)
            .where(eq(project.id, row.projectId))
            .limit(1);
          return {
            ...row,
            project: { type: projectRows[0]?.type ?? "STANDARD" },
          } as ListItemRow & { project: { type: ProjectType } };
        }
        const rows = await db
          .select({ order: listItem.order })
          .from(listItem)
          .where(
            and(eq(listItem.userId, args.where.userId), eq(listItem.projectId, args.where.projectId)),
          )
          .orderBy(desc(listItem.order))
          .limit(1);
        return rows[0] ?? null;
      },
      findMany: async (args) => {
        const rows = await db
          .select()
          .from(listItem)
          .where(and(eq(listItem.userId, args.where.userId), eq(listItem.projectId, args.where.projectId)))
          .orderBy(asc(listItem.isDone), asc(listItem.order), asc(listItem.createdAt));
        if (rows.length === 0) return [];
        const attachments = await db
          .select({
            listItemId: listItemAttachment.listItemId,
            id: listItemAttachment.id,
            filename: listItemAttachment.filename,
            mimeType: listItemAttachment.mimeType,
          })
          .from(listItemAttachment)
          .orderBy(asc(listItemAttachment.id));
        const byItem = new Map<string, { id: string; filename: string; mimeType: string }[]>();
        for (const attachment of attachments) {
          const list = byItem.get(attachment.listItemId) ?? [];
          list.push({ id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType });
          byItem.set(attachment.listItemId, list);
        }
        return rows.map((row) => ({
          ...row,
          attachments: byItem.get(row.id) ?? [],
        }));
      },
      create: async (args) => {
        const data: ListItemCreateData = args.data;
        const now = new Date();
        const inserted = await db
          .insert(listItem)
          .values({
            id: mintId(),
            userId: data.userId,
            projectId: data.projectId,
            text: data.text,
            content: data.content,
            sourceUrl: data.sourceUrl,
            order: data.order,
            isDone: false,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const row = inserted[0];
        assertFound(row, "ListItem");
        if (data.attachments?.create?.length) {
          await db.insert(listItemAttachment).values(
            data.attachments.create.map((attachment) => ({
              id: mintId(),
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              size: attachment.size,
              data: attachment.data,
              listItemId: row.id,
            })),
          );
        }
        return row;
      },
      update: async (args) => {
        const rows = await db
          .update(listItem)
          .set({ ...args.data, updatedAt: new Date() })
          .where(eq(listItem.id, args.where.id))
          .returning();
        const row = rows[0];
        assertFound(row, "ListItem");
        return row;
      },
      delete: async (args) => {
        const rows = await db.delete(listItem).where(eq(listItem.id, args.where.id)).returning();
        const row = rows[0];
        assertFound(row, "ListItem");
        return row;
      },
      deleteMany: async (args) => {
        const rows = await db
          .delete(listItem)
          .where(
            and(
              eq(listItem.userId, args.where.userId),
              eq(listItem.projectId, args.where.projectId),
              eq(listItem.isDone, args.where.isDone),
            ),
          )
          .returning({ id: listItem.id });
        return { count: rows.length };
      },
    },
  };
}

