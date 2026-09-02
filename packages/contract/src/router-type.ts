/**
 * Placeholder Router — the ONE type goal F8b replaces.
 *
 * F8b defines the real contract in this package with `@orpc/contract`
 * (zod schemas + `oc` builders) and swaps the alias at the bottom for:
 *
 *   export type Router = ContractRouterClient<typeof contractRouter>
 *
 * That is the whole swap: one line here, and every client, mock, and store
 * downstream keeps compiling (the mock router type derives from `Router`).
 *
 * The placeholder mirrors structurally what `ContractRouterClient` produces —
 * nested namespaces of oRPC `Client` callables — with a single procedure,
 * `tasks.list`, so the seam is exercised end-to-end today. It is `any`-free.
 *
 * It must stay a type *alias* (not an `interface`): only aliases get the
 * implicit index signatures required to satisfy oRPC's `NestedClient`
 * constraint in `createORPCClient<Router>(...)`.
 */

import type { Client } from "@orpc/client";

/** `enum TaskStatus` (webapp/schema.prisma) — wire format is a string union. */
export type TaskStatus = "SOMEDAY" | "UPCOMING" | "TODAY" | "WONT_DO";

/** `enum Priority` (webapp/schema.prisma). */
export type Priority = "LOW" | "NORMAL" | "IMPORTANT";

/**
 * List-row slice of the `Task` model (webapp/schema.prisma): the fields a
 * list screen renders. Field names and types match the schema so F8b's
 * contract DTOs supersede this as a type-only change.
 */
export interface Task {
  id: string;
  /** The title — what to do (`Task.description` in schema.prisma). */
  description: string;
  status: TaskStatus;
  priority: Priority;
  isDone: boolean;
  /** Manual sort order within a list (`order Int @default(0)`). */
  order: number;
}

export type Router = {
  tasks: {
    /** No input → the user's tasks in list order. */
    list: Client<Record<never, never>, undefined, Task[], never>;
  };
};
