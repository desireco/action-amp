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
