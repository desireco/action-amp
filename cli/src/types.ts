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
  attachments?: { id: string; filename: string; mimeType: string }[];
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
  isDefault: boolean;
  isIncluded: boolean;
  type: "LIFE_AREA" | "SIMPLE_LIST";
  color?: string | null;
  purpose?: string | null;
  createdAt?: string;
  counts?: {
    goals: number;
    projects: number;
    tasks: number;
    openItems: number;
    checkedItems: number;
  };
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

/**
 * `actionamp now` response. The additive `context` field (focus-goal-context
 * spec) carries Project, resolved Goal, truthful matcher `whyNow`, and
 * Goal-backed `whyItMatters`. For a null Task (no-lens / no-candidates),
 * `context` is null too. Existing `task` and `reason` meanings are unchanged.
 */
export type NowContext = {
  project: { id: string; name: string; permalink?: string } | null;
  goal: {
    id: string;
    name: string;
    permalink?: string;
    description: string | null;
  } | null;
  whyNow: string | null;
  whyItMatters: string | null;
};

export type NowResult = {
  task: Task | null;
  context: NowContext | null;
  reason?: "no-lens" | "no-candidates";
};

export type CaptureResult = {
  ok: true;
  kind?: "inbox-item" | "list-item";
  id: string;
  text: string;
  createdAt: string;
};

export type TaskMutationResult = {
  id: string;
  [key: string]: unknown;
};

export type ReviewLensRef = {
  id: string;
  name: string;
  color: string | null;
};

export type ReviewGoalRef = {
  id: string;
  name: string;
  permalink?: string;
};

export type ReviewProjectRef = {
  id: string;
  name: string;
  permalink?: string;
  goal?: ReviewGoalRef | null;
};

export type ReviewTask = {
  id: string;
  title: string;
  permalink: string;
  outcome: string | null;
  size?: "S" | "M" | "L" | "XL";
  completedAt: string;
  lens: ReviewLensRef;
  project: ReviewProjectRef | null;
  goal: ReviewGoalRef | null;
};

export type ReviewReport = {
  cadence: "WEEKLY" | "MONTHLY";
  state: "in_progress" | "finished";
  period: {
    start: string;
    end: string;
    startDate: string;
    endDate: string;
    label: string;
    inProgress: boolean;
  };
  lensId: string | null;
  totals: {
    actions: number;
    projects: number;
    goals: number;
    focusMinutes: number;
  };
  actionsByLens: { lens: ReviewLensRef; count: number }[];
  highlights: ReviewTask[];
  tasks: ReviewTask[];
  projects: {
    id: string;
    name: string;
    permalink: string;
    description: string | null;
    completedAt: string;
    lens: ReviewLensRef;
    goal: ReviewGoalRef | null;
  }[];
  goals: {
    id: string;
    name: string;
    permalink: string;
    description: string | null;
    completedAt: string;
    lens: ReviewLensRef;
  }[];
  weeklySlices: { startDate: string; completedTasks: number }[];
  checkIn: {
    howGoing?: string;
    goingWell?: string;
    challenges?: string;
    currentAttention?: string;
  };
  reflection: {
    moved?: string;
    change?: string;
    proud?: string;
    learned?: string;
    attention?: string;
    emphasisGoalId?: string;
  };
  emphasisGoal: {
    id: string;
    name: string;
    permalink: string;
    lens: ReviewLensRef;
  } | null;
};

export type ReviewReportResult = { report: ReviewReport };
