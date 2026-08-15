import type {
  ClearCompletedListItems,
  CreateListItem,
  DeleteListItem,
  GetSimpleList,
  RenameListItem,
  SetListItemDone,
} from "wasp/server/operations";
import {
  clearCompletedListItemsCore,
  createListItemCore,
  deleteListItemCore,
  getSimpleListCore,
  renameListItemCore,
  setListItemDoneCore,
} from "./operationsCore";
import { assertLensAllowed } from "../billing/entitlementHttp";

function userId(context: { user?: { id: string } | null }): string {
  if (!context.user) throw new Error("Not authenticated.");
  return context.user.id;
}

async function assertItemLensAllowed(
  context: {
    user?: { id: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entities: any;
  },
  id: string,
) {
  const ownerId = userId(context);
  const item = await context.entities.ListItem.findFirst({
    where: { id, userId: ownerId },
    select: { lensId: true },
  });
  if (item) await assertLensAllowed(context, item.lensId);
}

export const getSimpleList = (async (args, context) => {
  await assertLensAllowed(context, args.lensId);
  return getSimpleListCore(context.entities, {
    userId: userId(context),
    lensId: args.lensId,
  });
}) satisfies GetSimpleList<{ lensId: string }, Awaited<ReturnType<typeof getSimpleListCore>>>;

export const createListItem = (async (args, context) => {
  await assertLensAllowed(context, args.lensId);
  return createListItemCore(context.entities, {
    userId: userId(context),
    lensId: args.lensId,
    text: args.text,
    content: args.content,
    sourceUrl: args.sourceUrl,
    attachments: args.attachments,
  });
}) satisfies CreateListItem<
  { lensId: string; text: string; content?: string; sourceUrl?: string; attachments?: { filename: string; mimeType: string; dataBase64: string }[] },
  Awaited<ReturnType<typeof createListItemCore>>
>;

export const renameListItem = (async (args, context) => {
  await assertItemLensAllowed(context, args.id);
  return renameListItemCore(context.entities, {
    userId: userId(context),
    id: args.id,
    text: args.text,
  });
}) satisfies RenameListItem<
  { id: string; text: string },
  Awaited<ReturnType<typeof renameListItemCore>>
>;

export const setListItemDone = (async (args, context) => {
  await assertItemLensAllowed(context, args.id);
  return setListItemDoneCore(context.entities, {
    userId: userId(context),
    id: args.id,
    isDone: args.isDone,
  });
}) satisfies SetListItemDone<
  { id: string; isDone: boolean },
  Awaited<ReturnType<typeof setListItemDoneCore>>
>;

export const deleteListItem = (async (args, context) => {
  await assertItemLensAllowed(context, args.id);
  return deleteListItemCore(context.entities, {
    userId: userId(context),
    id: args.id,
  });
}) satisfies DeleteListItem<
  { id: string },
  Awaited<ReturnType<typeof deleteListItemCore>>
>;

export const clearCompletedListItems = (async (args, context) => {
  await assertLensAllowed(context, args.lensId);
  return clearCompletedListItemsCore(context.entities, {
    userId: userId(context),
    lensId: args.lensId,
  });
}) satisfies ClearCompletedListItems<
  { lensId: string },
  Awaited<ReturnType<typeof clearCompletedListItemsCore>>
>;
