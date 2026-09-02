/**
 * The API client for the web app.
 *
 * This module is the ONLY place allowed to import `@actionamp/contract` —
 * stores and screens consume the client (or its DTO types) from here.
 *
 * Real transport since F8b: `createClient` wraps oRPC's RPCLink and POSTs to
 * the API's /rpc mount (same-origin — the vite dev proxy forwards /rpc to the
 * Hono server in dev, see vite.config.ts). The mock transport it replaced is
 * still available in the contract package for tests/stories.
 */

import { createClient } from "@actionamp/contract";

/** The path the vite dev proxy forwards to the Hono server (see vite.config.ts). */
export const API_PROXY_PATH = "/rpc";

export const client = createClient({ url: API_PROXY_PATH });

export type { Task, TaskStatus } from "@actionamp/contract";
