import type {
  CreateInboxItem,
  GetInboxItem,
  GetInboxItems,
  TriageInboxItem,
  RestoreArchivedItem,
  GetProjectsForResolver,
} from "wasp/server/operations";
import { type ParsedPriority, type ParsedSize } from "./parseCapture";
import { FREE_LIMITS } from "../billing/config";
import { assertLensAllowed, assertUnderCap } from "../billing/entitlementHttp";
// Pure cores shared with /api/cli/* routes — auth + entitlement guards stay
// here (the wrapper), the DB shape lives in the core. See operationsCore.ts.
import {
  createInboxItemCore,
  getInboxItemsCore,
  triageInboxItemCore,
} from "./operationsCore";

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
  return await createInboxItemCore(context.entities, {
    userId: context.user.id,
    text: args.text,
    projectName: args.projectName,
  });
}) satisfies CreateInboxItem<
  { text: string; projectName?: string },
  { id: string; text: string; createdAt: Date }
>;

// ----------------------------------------------------------------
// Read — the inbox list (newest first)
// ----------------------------------------------------------------
export const getInboxItems = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await getInboxItemsCore(context.entities, {
    userId: context.user.id,
  });
}) satisfies GetInboxItems<never>;

// ----------------------------------------------------------------
// Read — a single InboxItem by id, gated to the requesting user.
// Used by the /share confirmation page to render the just-captured item.
// Returns null for an unknown id, a deleted item, or another user's item —
// callers render the "missing" error state. Mirrors restoreArchivedItem's
// findUnique + userId guard, but is a read query and returns the full row.
// ----------------------------------------------------------------
export const getInboxItem = (async (
  args: { id: string },
  context,
) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const item = await context.entities.InboxItem.findUnique({
    where: { id: args.id },
  });
  if (!item || item.userId !== context.user.id) return null;
  return item;
}) satisfies GetInboxItem<{ id: string }>;

// ----------------------------------------------------------------
// Transform — triage an InboxItem into its concrete type, then delete it.
// ----------------------------------------------------------------
// Decisions (DATA-MODEL.md §3):
//   task-today → Task(status=TODAY)   · upcoming → Task(status=UPCOMING)
//   someday    → Task(status=SOMEDAY) · project  → new Project (text = name)
//   archive    → mark InboxItem ARCHIVED (kept; recoverable from the Logbook)
// Carries the InboxItem's parsed-* guesses onto the created entity. Resource
// filing needs a parent picker (not yet built) — it throws a helpful error.
//
// The orchestrator (triageInboxItemCore) lives in operationsCore.ts. The two
// entitlement decisions it needs arrive as injected callbacks so the core
// stays free of `wasp/server`: `assertLens` (FREE-lens filing guard) and
// `assertProjectCap` (the per-lens project cap). Archive + resource-without-
// parent are decided inside the core.
export const triageInboxItem = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await triageInboxItemCore(context.entities, {
    userId: context.user.id,
    inboxItemId: args.inboxItemId,
    decision: args.decision,
    lensId: args.lensId,
    goalId: args.goalId,
    projectId: args.projectId,
    name: args.name,
    priority: args.priority,
    size: args.size,
    content: args.content,
    assertLens: (lensId) => assertLensAllowed(context, lensId),
    assertProjectCap: (lensId, currentCount) =>
      assertUnderCap(context, lensId, currentCount, FREE_LIMITS.projects, {
        feature: "a 4th project",
        reason: "organize more than 3 projects with Pro",
      }),
  });
}) satisfies TriageInboxItem<{
  inboxItemId: string;
  decision:
    | "task-today"
    | "upcoming"
    | "someday"
    | "project"
    | "resource"
    | "archive"
    | "delete";
  lensId: string;
  goalId?: string;
  projectId?: string;
  name?: string; // override the created Task/Project/Resource title (defaults to item text)
  priority?: ParsedPriority; // override parsed priority (set deliberately in the triage spec step)
  size?: ParsedSize; // override parsed size (set deliberately in the triage spec step)
  content?: string; // durable task notes/body captured during triage
}>;

// ----------------------------------------------------------------
// Restore — bring an archived InboxItem back into the inbox.
// ----------------------------------------------------------------
// The reverse of the "archive" decision: an item the user declined ("I will
// not do now") can be re-triaged later. Clears the archived state so it
// re-enters the unprocessed inbox.
export const restoreArchivedItem = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const item = await context.entities.InboxItem.findUnique({
    where: { id: args.inboxItemId },
  });
  if (!item || item.userId !== context.user.id) {
    throw new Error("Inbox item not found.");
  }
  await context.entities.InboxItem.update({
    where: { id: item.id },
    data: { status: "UNPROCESSED", archivedAt: null },
  });
  return { id: item.id };
}) satisfies RestoreArchivedItem<{ inboxItemId: string }, { id: string }>;

// ----------------------------------------------------------------
// Project resolver source — lightweight project tuples across ALL the user's
// lenses, for capture typeahead + triage project-bridged lens inference
// (docs/specs/capture-grammar.md). Lens-agnostic by design: at capture the
// user is typing free text and may not know which lens a project lives in;
// the dropdown shows all matches, and the chosen project's lens flows into
// triage as the project-bridged inference. Returns just {id, name, lensId,
// lensName} — no task counts or goal includes; the heavy `getProjects` is
// still the per-lens page source.
//
// Note: visibility ≠ write access. The `assertLensAllowed` filing guard in
// `triageInboxItem` still rejects a FREE user's attempt to file into a
// WORK/CUSTOM lens at commit time (402). Surfacing those projects here lets
// the user see and pick them; if they're not entitled, triage surfaces the
// entitlement error rather than silently hiding the project.
// ----------------------------------------------------------------
export const getProjectsForResolver = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const user = context.user;
  const lenses = await context.entities.Lens.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
  });
  const lensNameById = new Map(lenses.map((l) => [l.id, l.name]));
  const projects = await context.entities.Project.findMany({
    where: { userId: user.id, isDone: false },
    select: { id: true, name: true, lensId: true },
    orderBy: [{ name: "asc" }],
  });
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    lensId: p.lensId,
    lensName: lensNameById.get(p.lensId) ?? null,
  }));
}) satisfies GetProjectsForResolver<
  never,
  { id: string; name: string; lensId: string; lensName: string | null }[]
>;
