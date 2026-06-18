import type { CreateInboxItem } from "wasp/server/operations";

/**
 * Capture — create a raw InboxItem from the ⌘K quick-capture popover.
 *
 * The text lands in the universal Inbox (status: UNPROCESSED). NL parsing of
 * dates/tags happens later (Phase 2 refinement); for now we store the raw text
 * and leave the parsed-* fields null until triage assigns them.
 */
export const createInboxItem = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const text = args.text?.trim();
  if (!text) {
    throw new Error("Capture text is required.");
  }
  return await context.entities.InboxItem.create({
    data: {
      text,
      userId: context.user.id,
    },
    select: { id: true, text: true, createdAt: true },
  });
}) satisfies CreateInboxItem<{ text: string }, { id: string; text: string; createdAt: Date }>;
