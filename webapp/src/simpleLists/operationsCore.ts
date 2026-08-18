/** Pure, tenant-scoped data operations for Simple-list Projects. */
import type { Prisma } from "@prisma/client";
import {
  prepareImageAttachments,
  type ImageAttachmentInput,
  type PreparedImageAttachment,
} from "../shared/imageAttachments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

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
  entities: Entities,
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
  entities: Entities,
  { userId, id }: { userId: string; id: string },
) {
  const item = await entities.ListItem.findFirst({
    where: { id, userId },
    include: { project: { select: { type: true } } },
  });
  if (!item) throw new Error("List item not found.");
  if (item.project.type !== "SIMPLE_LIST") {
    throw new Error("This operation requires a Simple-list Project.");
  }
  return item;
}

export async function getSimpleListCore(
  entities: Entities,
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
  entities: Entities,
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
  const data: Prisma.ListItemUncheckedCreateInput = {
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
  entities: Entities,
  { userId, id, text }: { userId: string; id: string; text: string },
) {
  await requireOwnedSimpleListItem(entities, { userId, id });
  return entities.ListItem.update({
    where: { id },
    data: { text: normalizedText(text) },
  });
}

export async function setListItemDoneCore(
  entities: Entities,
  { userId, id, isDone }: { userId: string; id: string; isDone: boolean },
) {
  await requireOwnedSimpleListItem(entities, { userId, id });
  return entities.ListItem.update({
    where: { id },
    data: { isDone, completedAt: isDone ? new Date() : null },
  });
}

export async function deleteListItemCore(
  entities: Entities,
  { userId, id }: { userId: string; id: string },
) {
  await requireOwnedSimpleListItem(entities, { userId, id });
  return entities.ListItem.delete({ where: { id } });
}

export async function clearCompletedListItemsCore(
  entities: Entities,
  { userId, projectId }: { userId: string; projectId: string },
) {
  await requireSimpleListProject(entities, { userId, projectId });
  return entities.ListItem.deleteMany({
    where: { userId, projectId, isDone: true },
  });
}
