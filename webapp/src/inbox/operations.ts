import type { CreateInboxItem, GetInboxItems, TriageInboxItem, RestoreArchivedItem, GetProjectsForResolver } from "wasp/server/operations";
import { parseCapture, type ParsedPriority, type ParsedSize } from "./parseCapture";
import { FREE_LIMITS } from "../billing/config";
import { assertLensAllowed, assertUnderCap } from "../billing/entitlementHttp";
import { uniquePermalink } from "../shared/permalinks";

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
  // Pull the user's custom lens names so `[[studio]]` is recognized at parse
  // time. Seeded lenses (work/personal/me) are always known to the parser;
  // custom names are user-defined and must be supplied per-call. (Grammar v2:
  // unknown [[ ]] tokens stay literal — see parseCapture.ts.)
  const customLenses = await context.entities.Lens.findMany({
    where: { userId: context.user.id, kind: "CUSTOM" },
    select: { name: true },
  });
  const parsed = parseCapture(raw, new Date(), customLenses.map((l) => l.name));
  return await context.entities.InboxItem.create({
    data: {
      text: parsed.cleanText,
      userId: context.user.id,
      parsedDate: parsed.parsedDate,
      parsedPriority: parsed.parsedPriority,
      parsedSize: parsed.parsedSize,
      parsedTags: parsed.parsedTags,
      // Explicit typeahead pick overrides anything the parser might extract
      // from the first # token. The picker and parser both feed the same
      // persisted project hint for triage resolution.
      parsedProject: args.projectName?.trim().toLowerCase() || parsed.parsedProject,
      parsedLens: parsed.parsedLens,
    },
    select: { id: true, text: true, createdAt: true },
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
      parsedProject: true,
      parsedLens: true,
    },
  });
}) satisfies GetInboxItems<never>;

// ----------------------------------------------------------------
// Transform — triage an InboxItem into its concrete type, then delete it.
// ----------------------------------------------------------------
// Decisions (DATA-MODEL.md §3):
//   task-today → Task(status=TODAY)   · upcoming → Task(status=UPCOMING)
//   someday    → Task(status=SOMEDAY) · project  → new Project (text = name)
//   archive    → mark InboxItem ARCHIVED (kept; recoverable from the Logbook)
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
  // Entitlement: triage files entities into a lens. FREE users may only file
  // into Me (the Work lens is visible-but-locked). Guards every decision that
  // creates a lens-scoped entity (task/project). Archive + restore don't.
  await assertLensAllowed(context, lensId);
  // Precedence: explicit triage choice > the capture parser's guess > default.
  // The triage wizard lets the user set Priority/Size deliberately (the spec
  // step); when they do, that wins over whatever `~XL` / `!3` token they may
  // have typed at capture time.
  const priority = args.priority ?? item.parsedPriority ?? "NORMAL";
  const size = args.size ?? item.parsedSize ?? "M";
  const content = args.content?.trim() || null;

  // Resolve captured extra #tokens into real Tag records (per-user unique by
  // name). Tags carry onto Tasks only — Projects and Goals drop them (their
  // scope is the whole collection, not a single actionable item). The parser
  // stores tags WITH their prefix (#phone, #mvp); strip it so the Tag name is
  // the clean word. resolve-or-create: a typo makes a new tag, never a crash.
  const tagNames = (item.parsedTags ?? [])
    .map((t) => t.replace(/^[@#]/, "").toLowerCase())
    .filter((t) => t.length > 0);
  const tagRecords =
    tagNames.length > 0
      ? await Promise.all(
          tagNames.map((name) =>
            context.entities.Tag.upsert({
              where: { userId_name: { userId: context.user!.id, name } },
              create: { name, color: "teal", userId: context.user!.id },
              update: {},
              select: { id: true },
            }),
          ),
        )
      : [];

  // Default-filing: if no project was chosen at triage and the capture
  // typeahead didn't set parsedProject (or it didn't resolve in the inferred
  // lens), file under the lens's "General" project so the task is never
  // projectless. Project resolution happens client-side (TriagePage) and
  // arrives as args.projectId; this is the fallback when nothing matched.
  let effectiveProjectId = args.projectId ?? null;
  if (!effectiveProjectId) {
    const general = await context.entities.Project.findFirst({
      where: { userId: context.user.id, lensId, name: "General" },
      select: { id: true },
    });
    effectiveProjectId = general?.id ?? null;
  }

  let result: { kind: "task" | "project" | "archive"; id: string };

  switch (args.decision) {
    case "task-today":
    case "upcoming":
    case "someday": {
      const status =
        args.decision === "task-today" ? "TODAY" : args.decision === "upcoming" ? "UPCOMING" : "SOMEDAY";
      const task = await context.entities.Task.create({
        data: {
          description: item.text,
          content,
          userId: context.user.id,
          lensId,
          status,
          priority,
          size,
          dueDate: item.parsedDate,
          projectId: effectiveProjectId,
          // Tags carry onto tasks only (projects/goals drop them).
          ...(tagRecords.length > 0
            ? { tags: { connect: tagRecords.map((t) => ({ id: t.id })) } }
            : {}),
        },
        select: { id: true },
      });
      result = { kind: "task", id: task.id };
      break;
    }
    case "project": {
      // Entitlement cap: a FREE user can convert an inbox item into a project
      // only under the per-lens cap (lens already guarded above).
      const projectCount = await context.entities.Project.count({
        where: { userId: context.user.id, lensId, isDone: false },
      });
      await assertUnderCap(context, lensId, projectCount, FREE_LIMITS.projects, {
        feature: "a 4th project",
        reason: "organize more than 3 projects with Pro",
      });
      const name = args.name?.trim() || item.text;
      const permalink = await uniquePermalink(name, async (candidate) => {
        const existing = await context.entities.Project.findFirst({
          where: { userId: context.user!.id, permalink: candidate },
          select: { id: true },
        });
        return !!existing;
      });
      const project = await context.entities.Project.create({
        data: {
          name,
          permalink,
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
    case "archive": {
      // "Archive" = I will not do now. Unlike the other decisions, this does
      // NOT delete the InboxItem — it keeps the note, recoverable from the
      // Logbook's Archived section. Capture is lossless; declining to act
      // shouldn't cost the user their note.
      await context.entities.InboxItem.update({
        where: { id: item.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      result = { kind: "archive", id: item.id };
      break;
    }
    default:
      throw new Error(`Unknown triage decision: ${args.decision}`);
  }

  // The transformation is committed — delete the seed InboxItem. (Archive is
  // the exception: it marks the item ARCHIVED above and returns early-ish, so
  // this delete only runs for the create-type decisions.)
  if (args.decision !== "archive") {
    await context.entities.InboxItem.delete({ where: { id: item.id } });
  }

  return result;
}) satisfies TriageInboxItem<{
  inboxItemId: string;
  decision: "task-today" | "upcoming" | "someday" | "project" | "resource" | "archive";
  lensId: string;
  goalId?: string;
  projectId?: string;
  name?: string; // override the project name (defaults to the item text)
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
