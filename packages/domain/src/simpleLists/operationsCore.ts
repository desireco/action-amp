/** Pure, tenant-scoped data operations for Simple-list Projects.
 *
 *  Ported from webapp/src/simpleLists/operationsCore.ts (S1+S4 batch) —
 *  bodies verbatim, type positions swapped: the webapp original spoke the
 *  Prisma client through a loose `Record<string, any>` entities map; this
 *  port names the delegate slices the cores actually call (the seam's own
 *  dialect), so tests can fake them EntitySpy-style without `any`. The
 *  runtime delegates over Drizzle live in `./entities.ts`
 *  (`createSimpleListEntities`), buildable over the same `DomainDb` the seam
 *  uses. */
import {
  prepareImageAttachments,
  type ImageAttachmentInput,
  type PreparedImageAttachment,
} from "../shared/imageAttachments.js";

// ----------------------------------------------------------------
// Row + delegate slices (the shapes this core reads/writes)
// ----------------------------------------------------------------

/** Prisma `ListItem` row equivalent (mirrors the `ListItem` table). */
export interface ListItemRow {
  id: string;
  text: string;
  isDone: boolean;
  order: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  content: string | null;
  sourceUrl: string | null;
  projectId: string;
}

/** A checklist row as the page renders it: item + display-only attachments. */
export interface ListItemWithAttachments extends ListItemRow {
  attachments: { id: string; filename: string; mimeType: string }[];
}

/** Nested-attachments create payload (Prisma's unchecked-create shape). */
export interface ListItemCreateData {
  userId: string;
  projectId: string;
  text: string;
  content: string | null;
  sourceUrl: string | null;
  order: number;
  attachments?: { create: PreparedImageAttachment[] };
}

/** The delegates this core calls — fakeable with vi.fn() spies. */
export interface SimpleListEntities {
  Project: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { id: true; type: true };
    }): Promise<{ id: string; type: "STANDARD" | "SIMPLE_LIST" } | null>;
    /** The owning lens of a project — the entitlement guard's lookup. */
    findLens(args: {
      where: { id: string; userId: string };
    }): Promise<{ lensId: string } | null>;
    /** The owning lens of an item's project — the item-guard's lookup. */
    findLensByItem(args: {
      where: { id: string; userId: string };
    }): Promise<{ lensId: string } | null>;
  };
  ListItem: {
    findFirst(args:
      | {
          where: { id: string; userId: string };
          include: { project: { select: { type: true } } };
        }
      | {
          where: { userId: string; projectId: string };
          orderBy: { order: "desc" };
          select: { order: true };
        }
    ): Promise<
      | (ListItemRow & { project: { type: "STANDARD" | "SIMPLE_LIST" } })
      | (Pick<ListItemRow, "order">)
      | null
    >;
    findMany(args: {
      where: { userId: string; projectId: string };
      orderBy: Array<Partial<Record<"isDone" | "order" | "createdAt", "asc" | "desc">>>;
      include: { attachments: { select: { id: true; filename: true; mimeType: true } } };
    }): Promise<ListItemWithAttachments[]>;
    create(args: { data: ListItemCreateData }): Promise<ListItemRow>;
    update(args: {
      where: { id: string };
      data: { text?: string; isDone?: boolean; completedAt?: Date | null };
    }): Promise<ListItemRow>;
    delete(args: { where: { id: string } }): Promise<ListItemRow>;
    deleteMany(args: {
      where: { userId: string; projectId: string; isDone: true };
    }): Promise<{ count: number }>;
  };
}

export const MAX_LIST_ITEM_TEXT_LENGTH = 500;

function normalizedText(text: string): string {
  const value = text.trim();
  if (!value) throw new Error("List item text is required.");
  if (value.length > MAX_LIST_ITEM_TEXT_LENGTH) {
    throw new Error(
      `List item text must be ${MAX_LIST_ITEM_TEXT_LENGTH} characters or fewer.`,
    );
  }
  return value;
}

async function requireSimpleListProject(
  entities: SimpleListEntities,
  { userId, projectId }: { userId: string; projectId: string },
) {
  const project = await entities.Project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, type: true },
  });
  if (!project) throw new Error("Project not found.");
  if (project.type !== "SIMPLE_LIST") {
    throw new Error("This operation requires a Simple-list Project.");
  }
  return project;
}

async function requireOwnedSimpleListItem(
  entities: SimpleListEntities,
  { userId, id }: { userId: string; id: string },
) {
  const item = (await entities.ListItem.findFirst({
    where: { id, userId },
    include: { project: { select: { type: true } } },
    // SAFETY: the include branch of the delegate returns the project-typed row.
  })) as (ListItemRow & { project: { type: "STANDARD" | "SIMPLE_LIST" } }) | null;
  if (!item) throw new Error("List item not found.");
  if (item.project.type !== "SIMPLE_LIST") {
    throw new Error("This operation requires a Simple-list Project.");
  }
  return item;
}

export async function getSimpleListCore(
  entities: SimpleListEntities,
  { userId, projectId }: { userId: string; projectId: string },
) {
  await requireSimpleListProject(entities, { userId, projectId });
  return entities.ListItem.findMany({
    where: { userId, projectId },
    orderBy: [{ isDone: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    include: {
      attachments: { select: { id: true, filename: true, mimeType: true } },
    },
  });
}

export async function createListItemCore(
  entities: SimpleListEntities,
  {
    userId,
    projectId,
    text,
    content,
    sourceUrl,
    attachments,
    preparedAttachments,
  }: {
    userId: string;
    projectId: string;
    text: string;
    content?: string | null;
    sourceUrl?: string | null;
    attachments?: ImageAttachmentInput[];
    preparedAttachments?: PreparedImageAttachment[];
  },
) {
  await requireSimpleListProject(entities, { userId, projectId });
  const imageAttachments =
    preparedAttachments ?? prepareImageAttachments(attachments);
  const previous = await entities.ListItem.findFirst({
    where: { userId, projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const data: ListItemCreateData = {
    userId,
    projectId,
    text: normalizedText(text),
    content: content?.trim() || null,
    sourceUrl: sourceUrl?.trim() || null,
    order: (previous?.order ?? -1) + 1,
  };
  if (imageAttachments) data.attachments = { create: imageAttachments };
  return entities.ListItem.create({ data });
}

export async function renameListItemCore(
  entities: SimpleListEntities,
  { userId, id, text }: { userId: string; id: string; text: string },
) {
  await requireOwnedSimpleListItem(entities, { userId, id });
  return entities.ListItem.update({
    where: { id },
    data: { text: normalizedText(text) },
  });
}

export async function setListItemDoneCore(
  entities: SimpleListEntities,
  { userId, id, isDone }: { userId: string; id: string; isDone: boolean },
) {
  await requireOwnedSimpleListItem(entities, { userId, id });
  return entities.ListItem.update({
    where: { id },
    data: { isDone, completedAt: isDone ? new Date() : null },
  });
}

export async function deleteListItemCore(
  entities: SimpleListEntities,
  { userId, id }: { userId: string; id: string },
) {
  await requireOwnedSimpleListItem(entities, { userId, id });
  return entities.ListItem.delete({ where: { id } });
}

export async function clearCompletedListItemsCore(
  entities: SimpleListEntities,
  { userId, projectId }: { userId: string; projectId: string },
) {
  await requireSimpleListProject(entities, { userId, projectId });
  return entities.ListItem.deleteMany({
    where: { userId, projectId, isDone: true },
  });
}
