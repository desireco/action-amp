/**
 * The logbook contract — S8 (the Logbook surface).
 *
 * Ported from the Wasp op in webapp/src/logbook/operations.ts (see the P0
 * notes: packages/contract/src/s8-logbook/README.md). The Logbook is the
 * record of things no longer active — five categories merged client-side into
 * one day-grouped timeline: completed tasks, wont-do tasks, completed projects
 * (STANDARD only), completed goals (goal: null — no parent goal), and archived
 * InboxItems (universal — no lens filter; they belong to the user, not a
 * context).
 *
 * Wire conventions match tasks.ts/goals.ts: temporals cross as ISO-8601
 * strings; the wire stays JSON-simple. `PAYMENT_REQUIRED` (402) is DECLARED —
 * the port ADDS the lens guard the webapp op lacked (P0 §5 port decision:
 * parity with the CLI route, closing the FREE-reads-Work-history gap), so a
 * FREE user reading a non-included lens gets 402 with `{ feature, reason }`.
 *
 * The Restore/Reopen actions the rows render do NOT live here — they drive the
 * EXISTING ops: `inbox.restore` (archived → inbox), `tasks.updateStatus` with
 * `status: "UPCOMING"` (wont-do — never straight to Today), `goals.setDone`
 * + `projects.setDone` with `isDone: false` (reopen).
 *
 * Composed into the tree by src/router.ts (the one composition point — a one
 * line edit, listed in docs/plans/slices/s8-wiring.md).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

import { SizeSchema } from "./inbox.js";
import { ProGateErrorMap } from "./projects.js";

const datetime = () => z.string();

/** A completed task row (`getLogbookData`'s task mapping). */
export const LogbookTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** ISO-8601 datetime (completedAt). */
  completedAt: datetime(),
  size: SizeSchema,
  /** "What happened" (task-fields §G) — rendered as markdown. */
  outcome: z.string().nullable(),
  project: z.object({ id: z.string(), name: z.string() }).nullable(),
  kind: z.literal("task"),
});

/** A declined task row — `completedAt` carries the decline (updatedAt). */
export const LogbookWontDoSchema = z.object({
  id: z.string(),
  title: z.string(),
  completedAt: datetime(),
  size: SizeSchema,
  project: z.object({ id: z.string(), name: z.string() }).nullable(),
  kind: z.literal("wont-do"),
});

/** A completed STANDARD project row (Simple-list projects never appear). */
export const LogbookProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  completedAt: datetime(),
  goal: z.object({ id: z.string(), name: z.string() }).nullable(),
  kind: z.literal("project"),
});

/** A completed goal row — goal is always null (a goal has no parent goal). */
export const LogbookGoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  completedAt: datetime(),
  goal: z.null(),
  kind: z.literal("goal"),
});

/** An archived inbox note — universal, shown in every lens's Logbook. */
export const LogbookArchivedSchema = z.object({
  id: z.string(),
  title: z.string(),
  archivedAt: datetime(),
  kind: z.literal("archived"),
});

/** The full Logbook payload — the five categories the client merges. */
export const LogbookSchema = z.object({
  tasks: z.array(LogbookTaskSchema),
  wontDo: z.array(LogbookWontDoSchema),
  projects: z.array(LogbookProjectSchema),
  goals: z.array(LogbookGoalSchema),
  archived: z.array(LogbookArchivedSchema),
});

/**
 * The Logbook read. `lensId` optional — absent, the server resolves the
 * user's primary lens (the S5/S6 list convention). Lens-scoped results
 * (tasks/wontDo/projects/goals); archived notes universal. 402 when a FREE
 * user reads a non-included lens (the guard the webapp op lacked — see the
 * file header).
 */
export const getLogbook = oc
  .errors(ProGateErrorMap)
  .input(z.object({ lensId: z.string().min(1).optional() }))
  .output(LogbookSchema);

/** The logbook namespace — path: POST /rpc/logbook/data. */
export const logbookContract = {
  data: getLogbook,
};
