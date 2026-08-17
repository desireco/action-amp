/**
 * Pure inbox-operation cores — the shared DB layer for both the Wasp server
 * ops (`./operations.ts`) and future `/api/cli/*` PAT routes.
 *
 * Pattern (mirrors `tasks/operationsCore.ts`): every core takes `entities` as
 * its first arg (loosely typed — any Prisma-client-shaped object works) plus
 * plain args, does the DB work, and returns data. **No `wasp/server` import
 * lives here.** Wasp's detectServerImports plugin blocks `wasp/server` under
 * `src/` in the client build Vitest uses, so keeping this pure keeps it unit-
 * testable and importable from both worlds.
 *
 * The Wasp ops in `operations.ts` become thin wrappers: auth check
 * (`if (!context.user) throw`) + entitlement guards (`assertLensAllowed` /
 * `assertUnderCap`) + delegate here. Tenancy + the entitlement decision stay in
 * the wrapper; the pure DB shape stays here.
 *
 * `triageInboxItemCore` is the orchestrator that transforms an InboxItem into
 * its concrete type (Task / Project / Resource) and DELETES the seed (archive
 * keeps it). Its triage-only helpers (resolveTagRecords, resolveEffectiveProject,
 * createTaskFromTriage, createProjectFromTriage) live here — they were only ever
 * used by triage. The two entitlement decisions the orchestrator needs (the
 * FREE-lens filing guard + the per-lens project cap) arrive as injected
 * callbacks so the core stays free of `wasp/server`; the Wasp wrapper / CLI
 * route supplies them.
 */

import {
  parseCapture,
  type ParsedPriority,
  type ParsedSize,
} from "./parseCapture";
import { taskPermalinkSource, uniquePermalink } from "../shared/permalinks";
import { createListItemCore } from "../simpleLists/operationsCore";
import {
  prepareImageAttachments,
  type ImageAttachmentInput,
  type PreparedImageAttachment,
} from "../shared/imageAttachments";

/**
 * The entities slice these cores read. Loosely typed (same approach as
 * `entitlements.ts`): callers pass Wasp's Prisma delegate, a test mock, or a
 * PAT route's Prisma client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

/** The triage decisions (DATA-MODEL.md §3). */
export type TriageDecision =
  | "task-today"
  | "upcoming"
  | "someday"
  | "project"
  | "resource"
  | "list-item"
  | "archive"
  | "delete";

// ----------------------------------------------------------------
// Capture — create a raw InboxItem (used by the ⌘K popover)
// ----------------------------------------------------------------
// Parses the text for date/tag/priority/size tokens (F2) and stores them as
// parsed-* guesses; triage carries them onto the created Task. Pulls the user's
// custom lens names first so `[[studio]]` is recognized at parse time (seeded
// lenses are always known; custom names are user-defined).
export async function createInboxItemCore(
  entities: Entities,
  {
    userId,
    text,
    projectName,
    projectId,
    lensId,
    title,
    content,
    sourceUrl,
    attachments,
  }: {
    userId: string;
    text: string;
    projectName?: string;
    projectId?: string;
    lensId?: string;
    title?: string;
    content?: string;
    sourceUrl?: string;
    attachments?: ImageAttachmentInput[];
  },
) {
  const raw = text?.trim();
  if (!raw) {
    throw new Error("Capture text is required.");
  }
  // Pull the user's custom lens names so `[[studio]]` is recognized at parse
  // time. Seeded lenses (work/personal/me) are always known to the parser;
  // custom names are user-defined and must be supplied per-call. (Grammar v2:
  // unknown [[ ]] tokens stay literal — see parseCapture.ts.)
  const customLenses = await entities.Lens.findMany({
    where: { userId },
    select: { name: true },
  });
  const parsed = parseCapture(
    raw,
    new Date(),
    customLenses.map((l: { name: string }) => l.name),
  );
  const preparedAttachments = prepareImageAttachments(attachments);
  const selectedProject = projectId
    ? await entities.Project.findFirst({
        where: { id: projectId, userId },
        select: { id: true, lensId: true },
      })
    : null;
  if (projectId && !selectedProject) throw new Error("Project not found.");

  const selectedLensId = selectedProject?.lensId ?? lensId;
  const selectedLens = selectedLensId
    ? await entities.Lens.findFirst({
        where: { id: selectedLensId, userId },
        select: { id: true },
      })
    : null;
  if (selectedLensId && !selectedLens)
    throw new Error("List or area not found.");
  if (projectId && lensId && selectedProject?.lensId !== lensId) {
    throw new Error("Project and list must belong to the same area.");
  }

  return await entities.InboxItem.create({
    data: {
      text: parsed.cleanText,
      title: title?.trim() || null,
      content: content?.trim() || null,
      sourceUrl: sourceUrl?.trim() || null,
      attachments: preparedAttachments
        ? { create: preparedAttachments }
        : undefined,
      userId,
      parsedDate: parsed.parsedDate,
      parsedPriority: parsed.parsedPriority,
      parsedSize: parsed.parsedSize,
      parsedTags: parsed.parsedTags,
      // Explicit typeahead pick overrides anything the parser might extract
      // from the first # token. The picker and parser both feed the same
      // persisted project hint for triage resolution.
      parsedProject: projectName?.trim().toLowerCase() || parsed.parsedProject,
      parsedLens: parsed.parsedLens,
      parsedProjectId: selectedProject?.id ?? null,
      parsedLensId: selectedLens?.id ?? null,
    },
    select: { id: true, text: true, createdAt: true },
  });
}

// ----------------------------------------------------------------
// Read — the inbox list (newest first)
// ----------------------------------------------------------------
export async function getInboxItemsCore(
  entities: Entities,
  { userId }: { userId: string },
) {
  return await entities.InboxItem.findMany({
    where: { userId, status: "UNPROCESSED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      text: true,
      title: true,
      content: true,
      sourceUrl: true,
      attachments: { select: { id: true, filename: true, mimeType: true } },
      createdAt: true,
      parsedDate: true,
      parsedPriority: true,
      parsedSize: true,
      parsedTags: true,
      parsedProject: true,
      parsedLens: true,
      parsedProjectId: true,
      parsedLensId: true,
    },
  });
}

// ----------------------------------------------------------------
// triageInboxItemCore helpers — each arm of the transformation extracted so the
// orchestrator reads as a flat sequence. Pure behavior-preserving splits; the
// operations.test.ts suite pins the exact Prisma payloads each one emits.
// ----------------------------------------------------------------

/** Resolve captured #/@ tokens into per-user Tag records (prefix stripped, lower-cased). */
async function resolveTagRecords(
  entities: Entities,
  userId: string,
  parsedTags: string[] | null,
) {
  const names = (parsedTags ?? [])
    .map((t) => t.replace(/^[@#]/, "").toLowerCase())
    .filter((t) => t.length > 0);
  if (names.length === 0) {
    // SAFETY: empty array satisfies the { id: string }[] return type.
    return [] as { id: string }[];
  }
  return Promise.all(
    names.map((name) =>
      entities.Tag.upsert({
        where: { userId_name: { userId, name } },
        create: { name, color: "teal", userId },
        update: {},
        select: { id: true },
      }),
    ),
  );
}

/** Resolve the filing project: an explicit triage pick wins, else the lens's "General". */
async function resolveEffectiveProject(
  entities: Entities,
  userId: string,
  lensId: string,
  projectId: string | null,
): Promise<{ id: string | null; permalink: string | null }> {
  if (projectId) {
    const project = await entities.Project.findFirst({
      where: { id: projectId, userId, lensId },
      select: { id: true, permalink: true },
    });
    if (!project) {
      throw new Error("Project not found.");
    }
    return { id: project.id, permalink: project.permalink };
  }
  const general = await entities.Project.findFirst({
    where: { userId, lensId, name: "General" },
    select: { id: true, permalink: true },
  });
  return { id: general?.id ?? null, permalink: general?.permalink ?? null };
}

/** Fetch the seed item's attachment blobs for a branch that moves them.
 *  The orchestrator's main read selects metadata only, so branches that carry
 *  images onto the created entity (task / project / resource / list-item)
 *  pull the bytes lazily here. Returns undefined when the item has none, so
 *  callers skip the attachments key entirely — no `create: []` writes. */
async function fetchSeedAttachmentBlobs(
  entities: Entities,
  item: { id: string; attachments: unknown[] },
): Promise<PreparedImageAttachment[] | undefined> {
  if (!item.attachments.length) return undefined;
  return entities.InboxAttachment.findMany({
    where: { inboxItemId: item.id },
    select: { filename: true, mimeType: true, size: true, data: true },
  });
}

/** task-today / upcoming / someday → a Task with the mapped status. */
/** The Task.create payload a triage "task" decision builds (tags attached
 *  inline when parsed tags resolved, keeping the create a single write). */
interface TaskTriageCreateData {
  description: string;
  permalink: string;
  content: string | null;
  userId: string;
  lensId: string;
  status: string;
  priority: string;
  size: string;
  dueDate: Date | null;
  projectId: string | null;
  tags?: { connect: { id: string }[] };
  attachments?: { create: PreparedImageAttachment[] };
}

async function createTaskFromTriage(
  entities: Entities,
  userId: string,
  opts: {
    decision: "task-today" | "upcoming" | "someday";
    title: string;
    content: string | null;
    lensId: string;
    priority: ParsedPriority;
    size: ParsedSize;
    dueDate: Date | null;
    projectId: string | null;
    projectPermalink: string | null;
    tagRecords: { id: string }[];
    preparedAttachments?: PreparedImageAttachment[];
  },
): Promise<{ kind: "task"; id: string }> {
  const status =
    opts.decision === "task-today"
      ? "TODAY"
      : opts.decision === "upcoming"
        ? "UPCOMING"
        : "SOMEDAY";
  const permalink = await uniquePermalink(
    taskPermalinkSource(opts.title, opts.projectPermalink),
    async (candidate) => {
      const existing = await entities.Task.findFirst({
        where: { userId, permalink: candidate },
        select: { id: true },
      });
      return !!existing;
    },
  );
  // When=Today must never produce a future-dated Today task: the Next pool's
  // due-guard treats any future dueDate as "snoozed until its time" and hides
  // the task from the chooser — a Today task invisible on What Now (seen in
  // the wild: a capture carrying a parsed "tomorrow" token + a manual When→
  // Today flip created exactly that). The capture's parsedDate stays meaningful
  // for Upcoming (surfaces when due); for Today the status IS the horizon.
  const dueDate = opts.decision === "task-today" ? null : opts.dueDate;
  // Built then conditionally extended (B5 convention) so the create stays a
  // single atomic write — tags inline when present, no conditional spread.
  // Tags carry onto tasks only (projects/goals drop them).
  const taskData: TaskTriageCreateData = {
    description: opts.title,
    permalink,
    content: opts.content,
    userId,
    lensId: opts.lensId,
    status,
    priority: opts.priority,
    size: opts.size,
    dueDate,
    projectId: opts.projectId,
  };
  if (opts.tagRecords.length > 0) {
    taskData.tags = {
      connect: opts.tagRecords.map((t) => ({ id: t.id })),
    };
  }
  // Captured images move with the item: nested-create the TaskAttachment
  // rows in the same atomic write (same convention as tags above).
  if (opts.preparedAttachments?.length) {
    taskData.attachments = { create: opts.preparedAttachments };
  }
  const task = await entities.Task.create({
    data: taskData,
    select: { id: true },
  });
  return { kind: "task", id: task.id };
}

/**
 * project → a new Project. The per-lens FREE cap is an entitlement decision —
 * it arrives as the injected `assertProjectCap` callback (the Wasp wrapper /
 * CLI route supplies it). The cap check reads the current non-done project
 * count for the lens, so this helper computes that count and hands it to the
 * callback before creating.
 */
async function createProjectFromTriage(
  entities: Entities,
  userId: string,
  opts: {
    name: string;
    lensId: string;
    goalId?: string;
    preparedAttachments?: PreparedImageAttachment[];
  },
  assertProjectCap?: (lensId: string, currentCount: number) => Promise<void>,
): Promise<{ kind: "project"; id: string }> {
  const projectCount = await entities.Project.count({
    where: { userId, lensId: opts.lensId, isDone: false },
  });
  if (assertProjectCap) {
    await assertProjectCap(opts.lensId, projectCount);
  }
  const permalink = await uniquePermalink(opts.name, async (candidate) => {
    const existing = await entities.Project.findFirst({
      where: { userId, permalink: candidate },
      select: { id: true },
    });
    return !!existing;
  });
  // Built then conditionally extended (B5 convention — same as the Task
  // create) so images ride on the single atomic write.
  const projectData: {
    name: string;
    permalink: string;
    userId: string;
    lensId: string;
    goalId?: string;
    attachments?: { create: PreparedImageAttachment[] };
  } = {
    name: opts.name,
    permalink,
    userId,
    lensId: opts.lensId,
    goalId: opts.goalId,
  };
  if (opts.preparedAttachments?.length) {
    projectData.attachments = { create: opts.preparedAttachments };
  }
  const project = await entities.Project.create({
    data: projectData,
    select: { id: true },
  });
  return { kind: "project", id: project.id };
}

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
// Entitlement decisions are injected (`assertLens` for the FREE-lens filing
// guard, `assertProjectCap` for the per-lens project cap) so this core stays
// free of `wasp/server`. The Wasp wrapper / CLI route supplies them; pass
// `undefined` to skip either.
export async function triageInboxItemCore(
  entities: Entities,
  {
    userId,
    inboxItemId,
    decision,
    lensId,
    goalId,
    projectId,
    name,
    priority,
    size,
    content,
    assertLens,
    assertProjectCap,
  }: {
    userId: string;
    inboxItemId: string;
    decision: TriageDecision;
    lensId: string;
    goalId?: string;
    projectId?: string;
    name?: string; // override the created Task/Project/Resource title (defaults to item text)
    priority?: ParsedPriority; // override parsed priority (set deliberately in the triage spec step)
    size?: ParsedSize; // override parsed size (set deliberately in the triage spec step)
    content?: string; // durable task notes/body captured during triage
    assertLens?: (lensId: string) => Promise<void>;
    assertProjectCap?: (lensId: string, currentCount: number) => Promise<void>;
  },
) {
  const item = await entities.InboxItem.findUnique({
    where: { id: inboxItemId },
    // Metadata only — the blobs are fetched solely in the branches that
    // move attachments (task + project + resource + list-item). Loading
    // `data` here would pull up to 20 MB of images into memory on every
    // triage click.
    include: {
      attachments: { select: { id: true, filename: true, mimeType: true, size: true } },
    },
  });
  if (!item || item.userId !== userId) {
    throw new Error("Inbox item not found.");
  }

  // Entitlement: triage files entities into a lens. FREE users may only file
  // into Me (the Work lens is visible-but-locked). Guards every decision that
  // creates a lens-scoped entity (task/project). Archive + delete don't file
  // anything — they discard — so neither needs a lens and neither runs the
  // guard (the route still receives a lensId for API symmetry, but it's
  // unused on these branches).
  const filesIntoLens = decision !== "archive" && decision !== "delete";
  if (assertLens && filesIntoLens) await assertLens(lensId);

  const destinationLens = filesIntoLens
    ? await entities.Lens.findFirst({
        where: { id: lensId, userId },
        select: { type: true },
      })
    : null;
  if (filesIntoLens && !destinationLens) throw new Error("Lens not found.");
  if (decision === "list-item" && destinationLens?.type !== "SIMPLE_LIST") {
    throw new Error("List items require a Simple-list Lens.");
  }
  if (
    filesIntoLens &&
    decision !== "list-item" &&
    destinationLens?.type !== "LIFE_AREA"
  ) {
    throw new Error("Tasks, Projects, and Resources require a Life-area Lens.");
  }

  // Precedence: explicit triage choice > the capture parser's guess > default.
  // The triage wizard lets the user set Priority/Size deliberately (the spec
  // step); when they do, that wins over whatever `~XL` / `!3` token they may
  // have typed at capture time.
  const resolvedPriority = priority ?? item.parsedPriority ?? "NORMAL";
  const resolvedSize = size ?? item.parsedSize ?? "M";
  const resolvedContent = content?.trim() || null;
  const title = name?.trim() || item.title || item.text;
  const itemNotes =
    [item.content, item.sourceUrl].filter(Boolean).join("\n\n") || null;

  let result: {
    kind: "task" | "project" | "list-item" | "archive" | "delete";
    id: string;
  };

  switch (decision) {
    case "task-today":
    case "upcoming":
    case "someday": {
      const tagRecords = await resolveTagRecords(
        entities,
        userId,
        item.parsedTags,
      );
      const effectiveProject = await resolveEffectiveProject(
        entities,
        userId,
        lensId,
        projectId ?? null,
      );
      // Images move with the item — fetch the blobs only when the seed
      // actually has some (the main read selected metadata only).
      const preparedAttachments = await fetchSeedAttachmentBlobs(entities, item);
      result = await createTaskFromTriage(entities, userId, {
        decision,
        title,
        content: resolvedContent ?? itemNotes,
        lensId,
        priority: resolvedPriority,
        size: resolvedSize,
        dueDate: item.parsedDate,
        projectId: effectiveProject.id,
        projectPermalink: effectiveProject.permalink,
        tagRecords,
        preparedAttachments,
      });
      break;
    }
    case "project": {
      // Images move with the item here too — a captured mockup triaged into
      // "Website redesign" becomes the project's own media.
      const preparedAttachments = await fetchSeedAttachmentBlobs(entities, item);
      result = await createProjectFromTriage(
        entities,
        userId,
        {
          name: title,
          lensId,
          goalId,
          preparedAttachments,
        },
        assertProjectCap,
      );
      break;
    }
    case "resource": {
      // Resources are shared project context. No loose or Goal-owned resources.
      if (!projectId) {
        throw new Error("Resources must be filed under a project.");
      }
      // Images move with the item here too — a screenshot filed as project
      // reference material stays attached to the resource.
      const preparedAttachments = await fetchSeedAttachmentBlobs(entities, item);
      // Built then conditionally extended (B5 convention — same as the
      // Task/Project creates) so images ride on the single atomic write.
      const resourceData: {
        title: string;
        url: string | null;
        notes: string | null;
        userId: string;
        projectId: string;
        attachments?: { create: PreparedImageAttachment[] };
      } = {
        title,
        url: item.sourceUrl,
        notes: resolvedContent ?? item.content,
        userId,
        projectId,
      };
      if (preparedAttachments?.length) {
        resourceData.attachments = { create: preparedAttachments };
      }
      const resource = await entities.Resource.create({
        data: resourceData,
        select: { id: true },
      });
      result = { kind: "project", id: resource.id }; // reuse for now
      break;
    }
    case "list-item": {
      // The other decision that keeps the images — fetch the blobs now (the
      // main read selects metadata only).
      const attachments = await fetchSeedAttachmentBlobs(entities, item);
      const listItem = await createListItemCore(entities, {
        userId,
        lensId,
        text: title,
        content: resolvedContent ?? item.content,
        sourceUrl: item.sourceUrl,
        preparedAttachments: attachments,
      });
      result = { kind: "list-item", id: listItem.id };
      break;
    }
    case "archive": {
      // "Archive" = I will not do now. Unlike the other decisions, this does
      // NOT delete the InboxItem — it keeps the note, recoverable from the
      // Logbook's Archived section. Capture is lossless; declining to act
      // shouldn't cost the user their note.
      await entities.InboxItem.update({
        where: { id: item.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      result = { kind: "archive", id: item.id };
      break;
    }
    case "delete": {
      // "Delete" = captured by mistake. Hard-removes the InboxItem — the row
      // is gone, not recoverable. This is distinct from Archive (kept) on
      // purpose: capture-mistakes should be cleanable at the inbox before
      // they become tasks/projects, and a destructive option honors the
      // user's explicit "I don't want this stored" intent. Hard-delete
      // matches every create-type branch (which already destroy the seed).
      await entities.InboxItem.delete({ where: { id: item.id } });
      result = { kind: "delete", id: item.id };
      break;
    }
    default:
      // SAFETY: type assertion is safe — value is validated or from a trusted source.
      throw new Error(`Unknown triage decision: ${decision as string}`);
  }

  // The transformation is committed — delete the seed InboxItem. Archive is
  // the exception (it marks the item ARCHIVED above); delete already removed
  // the row in its own case. So this trailing delete only runs for the
  // create-type decisions (task/project/resource/list-item).
  if (decision !== "archive" && decision !== "delete") {
    await entities.InboxItem.delete({ where: { id: item.id } });
  }

  return result;
}
