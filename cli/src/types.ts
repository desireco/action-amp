/**
 * Shared types — the shapes the API returns, as the CLI sees them.
 *
 * These mirror the backend's response shapes (from webapp/src/auth/patRoutes.ts
 * and the /api/cli/* routes). Kept here rather than imported from wasp/client/
 * because the CLI is a standalone package; if the API shape drifts, the CLI's
 * msw tests will fail (they assert the exact shapes).
 */

export type Task = {
  id: string;
  description: string;
  permalink?: string;
  content?: string | null;
  outcome?: string | null;
  isDone: boolean;
  createdAt: string;
  completedAt?: string | null;
  startedAt?: string | null;
  priority: "LOW" | "NORMAL" | "IMPORTANT";
  size: "S" | "M" | "L" | "XL";
  status: "SOMEDAY" | "UPCOMING" | "TODAY";
  dueDate?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  lensId?: string;
  project?: { id: string; name: string; permalink?: string } | null;
  goal?: { id: string; name: string; permalink?: string } | null;
};

export type InboxItem = {
  id: string;
  text: string;
  status: "UNPROCESSED" | "ARCHIVED";
  createdAt: string;
  parsedDate?: string | null;
  parsedPriority?: string | null;
  parsedSize?: string | null;
  parsedTags?: string[];
  parsedProject?: string | null;
  parsedLens?: string | null;
  title?: string | null;
  content?: string | null;
  sourceUrl?: string | null;
  attachments?: { id: string; filename: string; mimeType: string }[];
};

export type Resource = {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  projectId?: string;
  createdAt?: string;
};

export type Project = {
  id: string;
  name: string;
  permalink?: string;
  description?: string | null;
  isDone: boolean;
  goalId?: string | null;
  lensId?: string;
  _count?: { tasks: number };
  taskCount?: number;
  resources?: Resource[];
};

export type Goal = {
  id: string;
  name: string;
  permalink?: string;
  description?: string | null;
  isDone: boolean;
  lensId?: string;
  _count?: { projects: number; tasks: number };
};

export type Lens = {
  id: string;
  name: string;
  kind: "PERSONAL" | "WORK" | "CUSTOM";
  color?: string | null;
  purpose?: string | null;
  createdAt?: string;
  counts?: { goals: number; projects: number; tasks: number };
};

/**
 * Logbook — the reflection feed.
 *
 * The backend (`logbook/operationsCore.ts`) normalizes completed tasks,
 * finished projects, achieved goals, and archived inbox items into a unified
 * shape keyed by `kind`. Each entry carries `title` (renamed from
 * `description`/`name` server-side so the feed can group heterogeneous
 * records under one heading), an ISO `completedAt`, the parent (if any), and
 * — for tasks — the optional `outcome` captured at completion.
 */
export type LogbookItem = {
  id: string;
  title: string;
  completedAt?: string;
  archivedAt?: string;
  outcome?: string | null;
  size?: string;
  project?: { id: string; name: string } | null;
  goal?: { id: string; name: string } | null;
  kind: "task" | "wont-do" | "project" | "goal" | "archived";
};

export type LogbookEntry = {
  tasks?: LogbookItem[];
  wontDo?: LogbookItem[];
  projects?: LogbookItem[];
  goals?: LogbookItem[];
  archived?: LogbookItem[];
};

export type Whoami = {
  user: {
    id: string;
    email: string | null;
    fullName: string;
    plan: string;
  };
};

export type NowResult = {
  task: Task | null;
  reason?: "no-lens" | "no-candidates";
};

export type CaptureResult = {
  ok: true;
  id: string;
  text: string;
  createdAt: string;
};

export type TaskMutationResult = {
  id: string;
  [key: string]: unknown;
};
