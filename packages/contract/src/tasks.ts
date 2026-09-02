/**
 * The tasks contract — the first real oRPC contract (F8b).
 *
 * Contract-first: zod schemas + `oc` builders define the wire surface here;
 * apps/api implements it (`implement(contractRouter)` → `.handler(...)`) and
 * every client consumes it as types (`ContractRouterClient`). Zod on `input`
 * gives the error taxonomy for free: a schema violation surfaces as an oRPC
 * `BAD_REQUEST` (4xx) before any handler runs — the server-side validation
 * gate for F10's auth layer to sit behind.
 *
 * DTOs are the list/detail slices the screens render (mirroring the What Now
 * data webapp's getRankedPool/getTasks ops surface, simplified): id,
 * description, status, priority, isDone, order — plus permalink/content on the
 * detail row. Field names match webapp/schema.prisma so the domain rows map
 * 1:1. No temporal fields yet — they join when a screen renders them, so the
 * wire stays JSON-simple.
 *
 * The router nests one level (`tasks.*`) — the ActionAmp router shape the
 * seam's `MockRouter` derivation and the `/rpc` path segments assume.
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

/** `enum TaskStatus` (webapp/schema.prisma) — wire format is the string union. */
export const TaskStatusSchema = z.enum(["SOMEDAY", "UPCOMING", "TODAY", "WONT_DO"]);

/** `enum Priority` (webapp/schema.prisma). */
export const PrioritySchema = z.enum(["LOW", "NORMAL", "IMPORTANT"]);

/**
 * List-row slice of the `Task` model: the fields a list screen renders.
 * Supersedes the placeholder DTO that lived in router-type.ts before F8b.
 */
export const TaskSchema = z.object({
  id: z.string(),
  /** The title — what to do (`Task.description` in schema.prisma). */
  description: z.string(),
  status: TaskStatusSchema,
  priority: PrioritySchema,
  isDone: z.boolean(),
  /** Manual sort order within a list (`order Int @default(0)`). */
  order: z.number().int(),
});

/** Detail row: the list slice plus the fields a detail screen needs. */
export const TaskDetailSchema = TaskSchema.extend({
  /** Slug id for URLs (`Task.permalink`, unique per user). */
  permalink: z.string(),
  /** Long-form notes (`Task.content`) — null when the task has none. */
  content: z.string().nullable(),
});

/**
 * The user's open tasks in list order — what the work screen renders.
 * No input: the user comes from the request context (F10 wires real auth;
 * today the seeded dev user is resolved server-side).
 */
export const listTasks = oc.output(z.array(TaskSchema));

/**
 * One task by id or permalink — the detail-page lookup (the core matches
 * either, so the input is a bare `id`). Missing task → `null`, not an error:
 * callers null-check, keeping the client error surface to transport failures.
 * Input is zod-validated: an empty id rejects with BAD_REQUEST (4xx).
 */
export const getTaskDetail = oc
  .input(z.object({ id: z.string().min(1) }))
  .output(TaskDetailSchema.nullable());

/** The tasks namespace — paths: POST /rpc/tasks/list, POST /rpc/tasks/detail. */
export const tasksContract = { list: listTasks, detail: getTaskDetail };

/** The full contract router. New features nest alongside `tasks`. */
export const contractRouter = { tasks: tasksContract };
