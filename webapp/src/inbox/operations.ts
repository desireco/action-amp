import type { CreateInboxItem, GetInboxItems, TriageInboxItem } from "wasp/server/operations";
import { parseCapture } from "./parseCapture";

/**
 * Inbox operations — the capture destination + the triage transformation.
 *
 * The heart of the model (DATA-MODEL.md §2-3): every capture lands here as a
 * raw InboxItem; triage transforms each into its concrete type (Task / Project)
 * and DELETES the original. The transformed entity IS the record.
 */

// ----------------------------------------------------------------
// Capture — create a raw InboxItem (used by the ⌘K popover).
// Parses the text for date/tag/priority/size tokens (F2) and stores them
// as parsed-* guesses; triage carries them onto the created Task.
// ----------------------------------------------------------------
export const createInboxItem = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const raw = args.text?.trim();
  if (!raw) {
    throw new Error("Capture text is required.");
  }
  const parsed = parseCapture(raw);
  return await context.entities.InboxItem.create({
    data: {
      text: parsed.cleanText,
      userId: context.user.id,
      parsedDate: parsed.parsedDate,
      parsedPriority: parsed.parsedPriority,
      parsedSize: parsed.parsedSize,
      parsedTags: parsed.parsedTags,
    },
    select: { id: true, text: true, createdAt: true },
  });
}) satisfies CreateInboxItem<{ text: string }, { id: string; text: string; createdAt: Date }>;

// ----------------------------------------------------------------
// Read — the inbox list (newest first)
// ----------------------------------------------------------------
export const getInboxItems = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await context.entities.InboxItem.findMany({
    where: { userId: context.user.id, status: "UNPROCESSED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      text: true,
      createdAt: true,
      parsedDate: true,
      parsedPriority: true,
      parsedSize: true,
      parsedTags: true,
    },
  });
}) satisfies GetInboxItems<never>;

// ----------------------------------------------------------------
// Transform — triage an InboxItem into its concrete type, then delete it.
// ----------------------------------------------------------------
// Decisions (DATA-MODEL.md §3):
//   task-today → Task(status=TODAY)   · upcoming → Task(status=UPCOMING)
//   someday    → Task(status=SOMEDAY) · project  → new Project (text = name)
//   trash      → delete only
// Carries the InboxItem's parsed-* guesses onto the created entity. Resource
// filing needs a parent picker (not yet built) — it throws a helpful error.
export const triageInboxItem = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const item = await context.entities.InboxItem.findUnique({
    where: { id: args.inboxItemId },
  });
  if (!item || item.userId !== context.user.id) {
    throw new Error("Inbox item not found.");
  }

  const lensId = args.lensId;
  // InboxItem.parsed* may already be set by the capture parser (F2); fall
  // back to defaults only when the user didn't specify a token.
  const priority = item.parsedPriority ?? "NORMAL";
  const size = item.parsedSize ?? "M";

  let result: { kind: "task" | "project" | "trash"; id: string };

  switch (args.decision) {
    case "task-today":
    case "upcoming":
    case "someday": {
      const status =
        args.decision === "task-today" ? "TODAY" : args.decision === "upcoming" ? "UPCOMING" : "SOMEDAY";
      const task = await context.entities.Task.create({
        data: {
          description: item.text,
          content: null,
          userId: context.user.id,
          lensId,
          status,
          priority,
          size,
          dueDate: item.parsedDate,
          goalId: args.goalId,
          projectId: args.projectId,
        },
        select: { id: true },
      });
      result = { kind: "task", id: task.id };
      break;
    }
    case "project": {
      const project = await context.entities.Project.create({
        data: {
          name: args.name?.trim() || item.text,
          userId: context.user.id,
          lensId,
          goalId: args.goalId,
        },
        select: { id: true },
      });
      result = { kind: "project", id: project.id };
      break;
    }
    case "resource": {
      // Resources require a parent (Project or Goal). A picker isn't built yet;
      // surface a clear error so the UI can guide the user.
      if (!args.projectId && !args.goalId) {
        throw new Error("Resources must be filed under a project or goal.");
      }
      const resource = await context.entities.Resource.create({
        data: {
          title: item.text,
          userId: context.user.id,
          projectId: args.projectId ?? null,
          goalId: args.goalId ?? null,
        },
        select: { id: true },
      });
      result = { kind: "project", id: resource.id }; // reuse for now
      break;
    }
    case "trash": {
      result = { kind: "trash", id: item.id };
      break;
    }
    default:
      throw new Error(`Unknown triage decision: ${args.decision}`);
  }

  // The transformation is committed — delete the seed InboxItem.
  await context.entities.InboxItem.delete({ where: { id: item.id } });

  return result;
}) satisfies TriageInboxItem<{
  inboxItemId: string;
  decision: "task-today" | "upcoming" | "someday" | "project" | "resource" | "trash";
  lensId: string;
  goalId?: string;
  projectId?: string;
  name?: string; // override the project name (defaults to the item text)
}>;
