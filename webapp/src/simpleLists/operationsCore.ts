/** Pure, tenant-scoped data operations for Simple-list Lenses. */
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
    throw new Error(`List item text must be ${MAX_LIST_ITEM_TEXT_LENGTH} characters or fewer.`);
  }
  return value;
}

async function requireSimpleListLens(
  entities: Entities,
  { userId, lensId }: { userId: string; lensId: string },
) {
  const lens = await entities.Lens.findFirst({
    where: { id: lensId, userId },
    select: { id: true, type: true },
  });
  if (!lens) throw new Error("Lens not found.");
  if (lens.type !== "SIMPLE_LIST") {
    throw new Error("This operation requires a Simple-list Lens.");
  }
  return lens;
}

async function requireOwnedSimpleListItem(
  entities: Entities,
  { userId, id }: { userId: string; id: string },
) {
  const item = await entities.ListItem.findFirst({
    where: { id, userId },
    include: { lens: { select: { type: true } } },
  });
  if (!item) throw new Error("List item not found.");
  if (item.lens.type !== "SIMPLE_LIST") {
    throw new Error("This operation requires a Simple-list Lens.");
  }
  return item;
}

export async function getSimpleListCore(
  entities: Entities,
  { userId, lensId }: { userId: string; lensId: string },
) {
  await requireSimpleListLens(entities, { userId, lensId });
  return entities.ListItem.findMany({
    where: { userId, lensId },
    orderBy: [{ isDone: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    include: { attachments: { select: { id: true, filename: true, mimeType: true } } },
  });
}

export async function createListItemCore(
  entities: Entities,
  {
    userId,
    lensId,
    text,
    content,
    sourceUrl,
    attachments,
    preparedAttachments,
  }: {
    userId: string;
    lensId: string;
    text: string;
    content?: string | null;
    sourceUrl?: string | null;
    attachments?: ImageAttachmentInput[];
    preparedAttachments?: PreparedImageAttachment[];
  },
) {
  await requireSimpleListLens(entities, { userId, lensId });
  const imageAttachments = preparedAttachments ?? prepareImageAttachments(attachments);
  const previous = await entities.ListItem.findFirst({
    where: { userId, lensId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const data: Prisma.ListItemCreateInput = {
    userId,
    lensId,
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
  { userId, lensId }: { userId: string; lensId: string },
) {
  await requireSimpleListLens(entities, { userId, lensId });
  return entities.ListItem.deleteMany({ where: { userId, lensId, isDone: true } });
}
