/**
 * The Router type — derived from the real contract since F8b.
 *
 * The contract lives in `./tasks.js` (zod schemas + `oc` builders); this
 * module derives the client-side Router from it:
 *
 *   export type Router = ContractRouterClient<typeof contractRouter>
 *
 * `ContractRouterClient` maps each contract procedure to an oRPC `Client`
 * callable, so `client.tasks.list()` / `client.tasks.detail({ id })` are
 * fully typed end-to-end (inputs via `InferSchemaInput`, outputs via
 * `InferSchemaOutput`). Swapping transport never touches this file again:
 * `createClient` (real) and `createMockClient` (in-memory) both produce this
 * same shape.
 *
 * It must stay a type *alias* (not an `interface`): only aliases get the
 * implicit index signatures required to satisfy oRPC's `NestedClient`
 * constraint in `createORPCClient<Router>(...)`.
 */

import type { ContractRouterClient } from "@orpc/contract";
import type { z } from "zod";
// Value import (referenced as a value inside `typeof ...`); erased from the
// emitted output since this module exports types only.
import { contractRouter } from "./router.js";
import type {
  PrioritySchema,
  TaskSchema,
  TaskStatusSchema,
} from "./tasks.js";

export type Router = ContractRouterClient<typeof contractRouter>;

/** DTO types the screens consume — inferred from the contract's zod schemas. */

/** `enum TaskStatus` (webapp/schema.prisma) — wire format is a string union. */
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** `enum Priority` (webapp/schema.prisma). */
export type Priority = z.infer<typeof PrioritySchema>;

/**
 * List-row slice of the `Task` model (webapp/schema.prisma): the fields a
 * list screen renders. Field names and types match the schema.
 */
export type Task = z.infer<typeof TaskSchema>;
