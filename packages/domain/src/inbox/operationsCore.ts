/**
 * Pure inbox-operation cores — ported from webapp/src/inbox/operationsCore.ts
 * (S2 capture + S3 triage; see the P0 notes in
 * packages/contract/src/s2-capture/README.md and s3-inbox-triage/README.md).
 *
 * Pattern (mirrors `tasks/operationsCore.ts`): every core takes `entities` as
 * its first arg (the Prisma-client-shaped seam object —
 * `createEntities(createDb(url))` at the API layer, or a Vitest mock in tests)
 * plus plain args, does the DB work, and returns data. **No server framework
 * import lives here.** The API layer's procedures become thin wrappers: auth
 * check + entitlement guards (injected as `assertLens` / `assertProjectCap`
 * callbacks so this core stays free of the server) + delegate here.
 *
 * `triageInboxItemCore` is the orchestrator that transforms an InboxItem into
 * its concrete type (Task / Project / Resource / ListItem) and DELETES the
 * seed (archive keeps it). Bodies are verbatim against the webapp original;
 * the differences are type-level only (seam types instead of `@prisma/client`,
 * `.js` import specifiers, Temporal types via the local interface).
 */

import {
  parseCapture,
  type ParsedPriority,
  type ParsedSize,
} from "../shared/capture/parse.js";
import { taskPermalinkSource, uniquePermalink } from "../shared/permalinks.js";
import { createListItemCore } from "../simpleLists/operationsCore.js";
import {
  prepareImageAttachments,
  type ImageAttachmentInput,
  type PreparedImageAttachment,
} from "../shared/imageAttachments.js";
import type {
  InboxAttachmentBlobRow,
  InboxItemCreateInput,
  InboxItemFindManyArgs,
  InboxItemFindUniqueArgs,
  InboxItemListRow,
  InboxItemUpdateArgs,
  LensFindFirstArgs,
  LensFindManyArgs,
  ProjectCreateInput,
  ProjectFindFirstArgs,
  ProjectWhereInput,
  TaskCreateIdArgs,

  TaskWhereInput,
} from "../db/index.js";
import type { InboxItem, Lens, Project, Resource } from "../db/index.js";

// ----------------------------------------------------------------
// Entities slices — the delegates each core calls. The seam `Entities`
// (`../db`) satisfies every one of these; see src/db/seam.checks.ts.
// ----------------------------------------------------------------

/** The delegates createInboxItemCore calls. */
interface CaptureEntities {
  Lens: {
    findMany(args: LensFindManyArgs): Promise<Lens[]>;
    findFirst(args: LensFindFirstArgs): Promise<Lens | null>;
  };
  Project: {
    findFirst(args: ProjectFindFirstArgs): Promise<Project | null>;
  };
  InboxItem: {
    create(args: {
      data: InboxItemCreateInput;
      select: { id: true; text: true; createdAt: true };
    }): Promise<{ id: string; text: string; createdAt: Date }>;
  };
}

/** The delegates getInboxItemsCore calls. */
interface InboxListEntities {
  InboxItem: {
    findMany(args: InboxItemFindManyArgs): Promise<InboxItemListRow[]>;
  };
}

/** The delegates triageInboxItemCore calls (the whole orchestrator surface). */
interface TriageEntities {
  InboxItem: {
    findUnique(
      args: InboxItemFindUniqueArgs,
    ): Promise<InboxItemWithAttachmentMeta | null>;
    update(args: InboxItemUpdateArgs): Promise<InboxItem>;
    delete(args: { where: { id: string } }): Promise<InboxItem>;
  };
  InboxAttachment: {
    findMany(args: {
      where: { inboxItemId: string };
      select: { filename: true; mimeType: true; size: true; data: true };
    }): Promise<InboxAttachmentBlobRow[]>;
  };
  Lens: {
    findFirst(args: LensFindFirstArgs): Promise<Lens | null>;
  };
  Project: {
    findFirst(args: ProjectFindFirstArgs): Promise<Project | null>;
    count(args: { where: ProjectWhereInput }): Promise<number>;
    create(args: {
      data: ProjectCreateInput;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  Task: {
    findFirst(args: {
      where: TaskWhereInput;
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: TaskCreateIdArgs): Promise<{ id: string }>;
  };
  Resource: {
    create(args: {
      data: {
        title: string;
        url: string | null;
        notes: string | null;
        userId: string;
        projectId: string;
        attachments?: { create: InboxAttachmentBlobRow[] };
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  Tag: {
    upsert(args: {
      where: { userId_name: { userId: string; name: string } };
      create: { name: string; color: string; userId: string };
      update: Record<string, never>;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
}

/** A triage-read row: the item plus its attachment metadata (no blobs). */
type InboxItemWithAttachmentMeta = InboxItem & {
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number }>;
};

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
  entities: CaptureEntities,
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
    timeZone = "UTC",
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
    timeZone?: string;
  },
): Promise<{ id: string; text: string; createdAt: Date }> {
  const raw = text?.trim();
  if (!raw) {
    throw new Error("Capture text is required.");
  }
  // Pull the user's custom lens names so `[[studio]]` is recognized at parse
  // time. Seeded lenses (work/personal/me) are always known to the parser;
  // custom names are user-defined and must be supplied per-call. (Grammar v2:
  // unknown [[ ]] tokens stay literal — see parse.ts.)
  const customLenses = await entities.Lens.findMany({
    where: { userId },
    select: { name: true },
  });
  const parsed = parseCapture(
    raw,
    new Date(),
    customLenses.map((l: { name: string }) => l.name),
    timeZone,
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

  const createData: InboxItemCreateInput = {
    text: parsed.cleanText,
    title: title?.trim() || null,
    content: content?.trim() || null,
    sourceUrl: sourceUrl?.trim() || null,
    userId,
    parsedScheduledDate: parsed.parsedScheduledDate,
    parsedSnoozedUntil: parsed.parsedSnoozedUntil,
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
  };
  if (preparedAttachments) {
    createData.attachments = { create: preparedAttachments };
  }
  return await entities.InboxItem.create({
    data: createData,
    select: { id: true, text: true, createdAt: true },
  });
}

// ----------------------------------------------------------------
// Read — the inbox list (newest first)
// ----------------------------------------------------------------
export async function getInboxItemsCore(
  entities: InboxListEntities,
  { userId }: { userId: string },
): Promise<InboxItemListRow[]> {
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
      parsedScheduledDate: true,
      parsedSnoozedUntil: true,
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
// ported test suites pin the exact payloads each one emits.
// ----------------------------------------------------------------

/** Resolve captured #/@ tokens into per-user Tag records (prefix stripped, lower-cased). */
async function resolveTagRecords(
  entities: TriageEntities,
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
  entities: TriageEntities,
  userId: string,
  lensId: string,
  projectId: string | null,
): Promise<{ id: string | null; permalink: string | null }> {
  if (projectId) {
    const project = await entities.Project.findFirst({
      where: { id: projectId, userId, lensId },
      select: { id: true, permalink: true, type: true },
    });
    if (!project) {
      throw new Error("Project not found.");
    }
    if (project.type === "SIMPLE_LIST") {
      throw new Error("A task cannot be filed into a Simple-list Project.");
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
  entities: TriageEntities,
  item: { id: string; attachments: unknown[] },
): Promise<InboxAttachmentBlobRow[] | undefined> {
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
  scheduledDate: Date | null;
  snoozedUntil: Date | null;
  projectId: string | null;
  tags?: { connect: { id: string }[] };
  attachments?: { create: InboxAttachmentBlobRow[] };
}

async function createTaskFromTriage(
  entities: TriageEntities,
  userId: string,
  opts: {
    decision: "task-today" | "upcoming" | "someday";
    title: string;
    content: string | null;
    lensId: string;
    priority: ParsedPriority;
    size: ParsedSize;
    scheduledDate: Date | null;
    snoozedUntil: Date | null;
    projectId: string | null;
    projectPermalink: string | null;
    tagRecords: { id: string }[];
    preparedAttachments?: InboxAttachmentBlobRow[];
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
  const scheduledDate =
    opts.decision === "task-today" ? null : opts.scheduledDate;
  const snoozedUntil =
    opts.decision === "task-today" ? null : opts.snoozedUntil;
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
    scheduledDate,
    snoozedUntil,
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
    // SAFETY: the enum/string fields narrow to the seam's TaskCreateInput at
    // the delegate boundary; the payload shape is pinned by the ported tests.
    data: taskData as unknown as TaskCreateIdArgs["data"],
    select: { id: true },
  });
  return { kind: "task", id: task.id };
}

/**
 * project → a new Project. The per-lens FREE cap is an entitlement decision —
 * it arrives as the injected `assertProjectCap` callback (the API layer /
 * CLI route supplies it). The cap check reads the current non-done project
 * count for the lens, so this helper computes that count and hands it to the
 * callback before creating.
 */
async function createProjectFromTriage(
  entities: TriageEntities,
  userId: string,
  opts: {
    name: string;
    lensId: string;
    goalId?: string;
    preparedAttachments?: InboxAttachmentBlobRow[];
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
  const projectData: ProjectCreateInput = {
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
// Carries the InboxItem's parsed-* guesses onto the created entity.
//
// Entitlement decisions are injected (`assertLens` for the FREE-lens filing
// guard, `assertProjectCap` for the per-lens project cap) so this core stays
// free of server-framework imports. The API layer / CLI route supplies them;
// pass `undefined` to skip either.
export async function triageInboxItemCore(
  entities: TriageEntities,
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
    lensId?: string; // required for task/project/resource; list-item files into projectId
    goalId?: string;
    projectId?: string;
    name?: string; // override the created Task/Project/Resource title (defaults to item text)
    priority?: ParsedPriority; // override parsed priority (set deliberately in the triage spec step)
    size?: ParsedSize; // override parsed size (set deliberately in the triage spec step)
    content?: string; // durable task notes/body captured during triage
    assertLens?: (lensId: string) => Promise<void>;
    assertProjectCap?: (lensId: string, currentCount: number) => Promise<void>;
  },
): Promise<{ kind: "task" | "project" | "list-item" | "archive" | "delete"; id: string }> {
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
  // creates a lens-scoped entity (task/project — and list-item, via its
  // project's lens). Archive + delete don't file anything — they discard — so
  // neither needs a lens and neither runs the guard.
  const filesSomewhere = decision !== "archive" && decision !== "delete";
  let filingLensId: string | null = null;
  if (decision === "list-item") {
    // A list item files into a Simple-list PROJECT (the checklist is the
    // whole destination); its lens feeds the entitlement check.
    if (!projectId) {
      throw new Error("List items require a Simple-list Project.");
    }
    const destinationProject = await entities.Project.findFirst({
      where: { id: projectId, userId },
      select: { id: true, type: true, lensId: true },
    });
    if (!destinationProject) throw new Error("Project not found.");
    if (destinationProject.type !== "SIMPLE_LIST") {
      throw new Error("List items require a Simple-list Project.");
    }
    filingLensId = destinationProject.lensId;
  } else if (filesSomewhere) {
    if (!lensId) throw new Error("Lens not found.");
    const destinationLens = await entities.Lens.findFirst({
      where: { id: lensId, userId },
      select: { id: true },
    });
    if (!destinationLens) throw new Error("Lens not found.");
    filingLensId = destinationLens.id;
  }
  if (assertLens && filingLensId) await assertLens(filingLensId);

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
        lensId!,
        projectId ?? null,
      );
      // Images move with the item — fetch the blobs only when the seed
      // actually has some (the main read selected metadata only).
      const preparedAttachments = await fetchSeedAttachmentBlobs(entities, item);
      result = await createTaskFromTriage(entities, userId, {
        decision,
        title,
        content: resolvedContent ?? itemNotes,
        lensId: lensId!,
        priority: resolvedPriority,
        size: resolvedSize,
        scheduledDate: item.parsedScheduledDate,
        snoozedUntil: item.parsedSnoozedUntil,
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
          lensId: lensId!,
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
      const resourceProject = await entities.Project.findFirst({
        where: { id: projectId, userId },
        select: { id: true, type: true },
      });
      if (!resourceProject) throw new Error("Project not found.");
      if (resourceProject.type === "SIMPLE_LIST") {
        throw new Error("A resource cannot be filed into a Simple-list Project.");
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
        attachments?: { create: InboxAttachmentBlobRow[] };
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
      const resource: Pick<Resource, "id"> = await entities.Resource.create({
        data: resourceData,
        select: { id: true },
      });
      result = { kind: "project", id: resource.id }; // reuse for now
      break;
    }
    case "list-item": {
      // The other decision that keeps the images — fetch the blobs now (the
      // main read selects metadata only). The destination project was
      // validated above (SIMPLE_LIST, owned).
      const attachments = await fetchSeedAttachmentBlobs(entities, item);
      // SAFETY: the simpleLists core's slice is a structural subset of the
      // same seam delegates (Project guard-read + ListItem findFirst/create);
      // the loose original core accepted any Prisma-shaped object here.
      const listItem = await createListItemCore(
        entities as unknown as Parameters<typeof createListItemCore>[0],
        {
          userId,
          projectId: projectId!,
          text: title,
          content: resolvedContent ?? item.content,
          sourceUrl: item.sourceUrl,
          // SAFETY: same bytes — the seam hands Buffer-backed Uint8Array rows
          // back; the simpleLists slice types them as Buffer.
          preparedAttachments: attachments as unknown as PreparedImageAttachment[],
        },
      );
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

// Re-exported for the API layer's wrappers (same shapes the webapp ops
// re-exported from the core).
export type {
  ImageAttachmentInput,
  PreparedImageAttachment,
} from "../shared/imageAttachments.js";
