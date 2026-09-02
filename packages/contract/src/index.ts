/**
 * @actionamp/contract — the sole API surface for clients (web, any future
 * consumers). Apps import from here only; never from `@orpc/*` directly.
 */

export type { Priority, Router, Task, TaskStatus } from "./router-type.js";
export {
  createClient,
  createMockClient,
  type CreateClientOptions,
  type MockRouter,
  type RouterClient,
  type RouterInputs,
  type RouterOutputs,
} from "./client.js";

// The contract itself (zod schemas + oc procedures) — apps/api implements it;
// clients normally touch only the types and factories above. Surface
// fragments live in their own files; src/router.ts composes the tree.
export {
  tasksContract,
  PrioritySchema,
  TaskDetailSchema,
  TaskSchema,
  TaskStatusSchema,
} from "./tasks.js";
export { contractRouter } from "./router.js";
