/**
 * The inbox contract — S2 (capture) + S3 (inbox/triage).
 *
 * Ported from the Wasp ops in webapp/src/inbox/operations.ts (see the P0
 * notes: packages/contract/src/s2-capture/README.md +
 * s3-inbox-triage/README.md). The Inbox is universal — items carry parsed-*
 * guesses but NO lens; capture never gates on entitlement (FREE users capture
 * freely — the filing gate is at triage).
 *
 * Dates cross the wire as ISO-8601 strings (the tasks.ts convention: the wire
 * stays JSON-simple; `parsedScheduledDate` is a calendar date `YYYY-MM-DD`,
 * every other temporal field a full datetime). DTO field names match
 * webapp/schema.prisma's InboxItem 1:1 so domain rows map directly.
 *
 * Composed into the tree by src/router.ts (the one composition point — a one
 * line edit, listed in docs/plans/slices/s2-s3-wiring.md).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";
import { PrioritySchema } from "./tasks.js";
// The triage 402 entitlement gate — the same DECLARED error ontology S5/S6
// attach to their Pro-gated procedures, so the wire status is 402 (not a
// `defined:false` 500) and clients can catch it by code.
import { ProGateErrorMap } from "./projects.js";

/** `enum Size` (webapp/schema.prisma). */
export const SizeSchema = z.enum(["S", "M", "L", "XL"]);

/** `enum InboxItemStatus` (webapp/schema.prisma). */
export const InboxItemStatusSchema = z.enum(["UNPROCESSED", "ARCHIVED"]);

/** The triage decisions (DATA-MODEL.md §3) — the wizard's outcome union. */
export const TriageDecisionSchema = z.enum([
  "task-today",
  "upcoming",
  "someday",
  "project",
  "resource",
  "list-item",
  "archive",
  "delete",
]);

/** A moved image's metadata (bytes live behind the attachment route, S12). */
export const InboxAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
});

/**
 * The inbox list row — everything the queue + triage wizard render: the
 * captured text, structured share fields, attachment metadata, and every
 * parsed-* guess the NL parser persisted at capture time.
 */
export const InboxItemSchema = z.object({
  id: z.string(),
  /** The cleaned capture text (tokens stripped by the parser). */
  text: z.string(),
  /** Structured share title (nullable; display falls back to text). */
  title: z.string().nullable(),
  content: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  status: InboxItemStatusSchema,
  /** ISO-8601 datetime. */
  createdAt: z.string(),
  attachments: z.array(InboxAttachmentSchema),
  /** Calendar date, `YYYY-MM-DD`. */
  parsedScheduledDate: z.string().nullable(),
  /** ISO-8601 datetime (tonight = today 20:00 local). */
  parsedSnoozedUntil: z.string().nullable(),
  parsedPriority: PrioritySchema.nullable(),
  parsedSize: SizeSchema.nullable(),
  /** `["#tag"]` — lowercased, prefix kept. */
  parsedTags: z.array(z.string()),
  /** Project name hint (first `#token`, lowercased) — resolved at triage. */
  parsedProject: z.string().nullable(),
  /** `[[lens]]` token (lowercased) when recognized. */
  parsedLens: z.string().nullable(),
  parsedProjectId: z.string().nullable(),
  parsedLensId: z.string().nullable(),
});

/**
 * Cross-lens project tuple for capture `#` autocomplete + triage's
 * project-bridged lens inference and list picker. Lens-agnostic BY DESIGN:
 * FREE users see Work/custom-lens projects here (visibility ≠ write access —
 * filing still 402s at triage). Most-recently-active first is contract.
 */
export const ResolverProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  permalink: z.string(),
  type: z.enum(["STANDARD", "SIMPLE_LIST"]),
  lensId: z.string(),
  lensName: z.string().nullable(),
  lensColor: z.string().nullable(),
});

/** What a triage dispatch created (`resource` currently reports `project`). */
export const TriageResultSchema = z.object({
  kind: z.enum(["task", "project", "list-item", "archive", "delete"]),
  id: z.string(),
});

// ----------------------------------------------------------------
// Procedures
// ----------------------------------------------------------------

/**
 * Capture — the ⌘K popover's submit. The server parses the raw text with the
 * SAME grammar the client previews with (grammar v2), persisting the parsed-*
 * guesses onto a fresh UNPROCESSED InboxItem. No entitlement gate — capture is
 * universal; triage filing is where 402s live.
 */
export const createInboxItem = oc
  .input(
    z.object({
      text: z.string().min(1),
      /** Explicit typeahead pick — overrides the first `#token` hint. */
      projectName: z.string().optional(),
      projectId: z.string().optional(),
      lensId: z.string().optional(),
      /** Structured share fields (Android share target) — optional. */
      title: z.string().optional(),
      content: z.string().optional(),
      sourceUrl: z.string().optional(),
      /** IANA zone for relative-date resolution; server falls back to the
       *  user's saved zone, then UTC. */
      timeZone: z.string().optional(),
    }),
  )
  .output(
    z.object({
      id: z.string(),
      text: z.string(),
      /** ISO-8601 datetime. */
      createdAt: z.string(),
    }),
  );

/** The queue snapshot — the user's UNPROCESSED items, newest first. Both the
 *  /do/inbox list and the review wizard's fixed walkthrough queue read this. */
export const listInboxItems = oc.output(z.array(InboxItemSchema));

/**
 * Triage — transform an InboxItem into its concrete type, then delete the
 * seed (the transformed entity IS the record). Precedence: explicit choice >
 * parsed guess > default (When defaults to Upcoming — never auto-Today).
 * Entitlement gates fire here: FREE may file only into the included lens
 * (402), and the `project` decision enforces the FREE per-lens project cap.
 */
export const triageInboxItem = oc
  .input(
    z.object({
      inboxItemId: z.string().min(1),
      decision: TriageDecisionSchema,
      /** Required for task/project/resource; list-item files by projectId. */
      lensId: z.string().optional(),
      goalId: z.string().optional(),
      /** Task's project (or the list-item's SIMPLE_LIST destination, or the
       *  resource's required parent). */
      projectId: z.string().optional(),
      /** Rename the created entity (defaults to the capture text). */
      name: z.string().optional(),
      priority: PrioritySchema.optional(),
      size: SizeSchema.optional(),
      /** Durable task notes captured during triage. */
      content: z.string().optional(),
    }),
  )
  .errors(ProGateErrorMap)
  .output(TriageResultSchema);

/**
 * Edit an unprocessed item's captured text in place (the triage card's
 * ~600 ms debounced write-back). UNPROCESSED-only server-side, so a late
 * flush after dispatch no-ops instead of racing the delete.
 */
export const updateInboxItem = oc
  .input(z.object({ inboxItemId: z.string().min(1), text: z.string().min(1) }))
  .output(z.object({ id: z.string() }));

/** Undo an archive — an ARCHIVED item re-enters the unprocessed inbox. */
export const restoreArchivedItem = oc
  .input(z.object({ inboxItemId: z.string().min(1) }))
  .output(z.object({ id: z.string() }));

/** The capture/triage resolver source (see ResolverProjectSchema). */
export const getProjectsForResolver = oc.output(z.array(ResolverProjectSchema));

/**
 * The user's lenses — the Classify step's pill radio + the client-side
 * `[[lens]]` preview's known names (webapp read them from getAppData, the
 * shell's app-data query; until that surface composes, the inbox fragment
 * owns this small supporting read).
 */
export const LensInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  isIncluded: z.boolean(),
});
export const listLenses = oc.output(z.array(LensInfoSchema));

/** The inbox namespace — paths: POST /rpc/inbox/create, /rpc/inbox/list, …
 *  Composed into the tree by src/router.ts (the one composition point). */
export const inboxContract = {
  create: createInboxItem,
  list: listInboxItems,
  triage: triageInboxItem,
  update: updateInboxItem,
  restore: restoreArchivedItem,
  projectsForResolver: getProjectsForResolver,
  lenses: listLenses,
};
