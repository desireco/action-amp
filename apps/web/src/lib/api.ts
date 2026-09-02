/**
 * The API client for the web app.
 *
 * This module is the ONLY place allowed to import `@actionamp/contract` —
 * stores and screens consume the client (or its DTO types) from here.
 *
 * Dev (F9b): the client runs on a mock transport — `createMockClient` serves
 * an in-memory dataset through the same typed pipeline as the real thing.
 * When the API lands (F8b), the swap is one line:
 *
 *   export const client = createClient({ url: API_PROXY_PATH });
 */

import { createMockClient, type MockRouter, type Task } from "@actionamp/contract";

/** The path the vite dev proxy forwards to the Hono server (see vite.config.ts). */
export const API_PROXY_PATH = "/rpc";

const mockTasks: Task[] = [
  {
    id: "t-1",
    description: "Reply to Dana about the venue shortlist",
    status: "TODAY",
    priority: "IMPORTANT",
    isDone: false,
    order: 0,
  },
  {
    id: "t-2",
    description: "Draft the September signup announcement",
    status: "TODAY",
    priority: "NORMAL",
    isDone: false,
    order: 1,
  },
  {
    id: "t-3",
    description: "Book the dentist (the overdue kind of task)",
    status: "UPCOMING",
    priority: "LOW",
    isDone: false,
    order: 2,
  },
  {
    id: "t-4",
    description: "Read the deployment research doc",
    status: "SOMEDAY",
    priority: "NORMAL",
    isDone: false,
    order: 3,
  },
  {
    id: "t-5",
    description: "Renew the domain",
    status: "TODAY",
    priority: "NORMAL",
    isDone: true,
    order: 4,
  },
];

const mockRouter: MockRouter = {
  tasks: {
    list: async () => mockTasks,
  },
};

export const client = createMockClient(mockRouter);

export type { Task, TaskStatus } from "@actionamp/contract";
