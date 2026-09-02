/**
 * Projects store — the S5 data layer (same pattern as tasks.svelte.ts): a
 * class with `$state` fields + plain methods, exported as a singleton. All
 * server contact goes through the client in `../api` — never fetch, never
 * `@orpc/*` imports outside it.
 *
 * The DTO interfaces below mirror the contract's ProjectSummary /
 * ProjectDetail schemas (packages/contract/src/projects.ts) 1:1 — temporal
 * fields arrive as ISO strings.
 */

import { client } from "../api";

/** Input shapes the projects procedures take (contract mirrors — the shared
 *  client's type gains `projects`/`goals` when the composition lines in
 *  docs/plans/slices/s5-s6-wiring.md land; this structural slice keeps the
 *  store typechecking either way). */
interface ProjectsClientSlice {
  list(input?: {
    lensId?: string;
    includeCompleted?: boolean;
    includeArchived?: boolean;
  }): Promise<ProjectSummary[]>;
  create(input: {
    name: string;
    lensId?: string;
    goalId?: string;
    description?: string;
    type?: ProjectType;
  }): Promise<{ id: string; permalink: string; name: string }>;
  detail(input: { id: string }): Promise<ProjectDetail | null>;
  createTask(input: {
    description: string;
    lensId?: string;
    projectId?: string;
    goalId?: string;
  }): Promise<{ id: string; permalink: string }>;
  setDone(input: { id: string; isDone: boolean }): Promise<{ id: string }>;
  archive(input: { id: string }): Promise<{ id: string }>;
  move(input: { id: string; targetLensId: string }): Promise<{ id: string; movedTaskCount: number }>;
  update(input: {
    id: string;
    name?: string;
    description?: string;
    goalId?: string | null;
    dueDate?: string | null;
    type?: ProjectType;
  }): Promise<{ id: string; name: string; description: string | null; goalId: string | null }>;
  delete(input: {
    id: string;
    taskDisposition?: "delete" | "reassign" | "triage";
    targetProjectId?: string;
  }): Promise<{ id: string; affectedTaskCount: number }>;
  updateTask(input: {
    id: string;
    projectId?: string | null;
    goalId?: string | null;
  }): Promise<{ id: string; projectId: string | null; goalId: string | null }>;
  moveTargets(input: {
    projectId: string;
  }): Promise<{ id: string; name: string; color: string | null }[]>;
  setTaskStatus(input: { id: string; status: TaskStatus }): Promise<{ id: string }>;
  startTask(input: { id: string }): Promise<{ id: string; startedAt: string | null }>;
}

const rpc = (client as unknown as { projects: ProjectsClientSlice }).projects;

export type ProjectType = "STANDARD" | "SIMPLE_LIST";
export type TaskStatus = "TODAY" | "UPCOMING" | "SOMEDAY" | "WONT_DO";

export interface ProjectResourceRef {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  isDone: boolean;
  type: ProjectType;
  completedAt: string | null;
  archivedAt: string | null;
  goal: { id: string; name: string } | null;
  openCount: number;
  doneCount: number;
  openItems: number;
  checkedItems: number;
  nextAction: {
    id: string;
    permalink: string;
    description: string;
    priority: string;
    size: string;
    status: string;
    isDone: boolean;
  } | null;
  resources: ProjectResourceRef[];
}

export interface ProjectDetailTask {
  id: string;
  permalink: string;
  description: string;
  content: string | null;
  isDone: boolean;
  priority: string;
  size: string;
  status: TaskStatus;
  scheduledDate: string | null;
  snoozedUntil: string | null;
  completedAt: string | null;
  attachments: { id: string; filename: string; mimeType: string }[];
}

export interface ProjectDetail {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  isDone: boolean;
  type: ProjectType;
  completedAt: string | null;
  archivedAt: string | null;
  goal: { id: string; permalink: string; name: string } | null;
  openCount: number;
  doneCount: number;
  openItems: number;
  checkedItems: number;
  nextAction: ProjectSummary["nextAction"];
  order: number;
  lensId: string;
  tasks: ProjectDetailTask[];
  resources: ProjectResourceRef[];
  attachments: { id: string; filename: string; mimeType: string }[];
}

/** The 402 payload the ProGate panel renders (byte-exact from the server). */
export interface GateMessage {
  feature: string;
  reason: string;
}

/** Extract the entitlement gate from a rejected oRPC call (PAYMENT_REQUIRED). */
export function gateFromError(e: unknown): GateMessage | null {
  const err = e as { code?: string; data?: { feature?: string; reason?: string } };
  if (err?.code === "PAYMENT_REQUIRED" && err.data?.feature) {
    return { feature: err.data.feature, reason: err.data.reason ?? "" };
  }
  return null;
}

/** Human message from a rejected oRPC call (declared errors carry `message`). */
export function messageFromError(e: unknown): string {
  const err = e as { message?: string };
  return err?.message ?? "Couldn't save.";
}

/** Size → human duration, matching the home screen. */
export const SIZE_DURATION: Record<string, string> = {
  S: "15 min",
  M: "30 min",
  L: "1 hr",
  XL: "2 hr+",
};

/** Due chip copy (`webapp/src/shared/dateFormat.ts` formatRelativeDue). */
export function formatRelativeDue(iso: string): string {
  const target = new Date(iso);
  const today = new Date();
  const day = 86_400_000;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOf(target).getTime() - startOf(today).getTime()) / day);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return target.toLocaleString(undefined, { month: "short", day: "numeric" });
}

class ProjectsStore {
  /** Lens-scoped list (the page re-filters into active/completed/archived). */
  projects = $state<ProjectSummary[]>([]);
  /** The open detail row. */
  detail = $state<ProjectDetail | null>(null);
  error = $state<string | null>(null);
  busy = $state(false);
  loaded = $state(false);

  async load() {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      // Both includes on; the view re-filters (webapp parity).
      this.projects = await rpc.list({
        includeCompleted: true,
        includeArchived: true,
      });
      this.loaded = true;
    } catch (e) {
      this.error = messageFromError(e);
    } finally {
      this.busy = false;
    }
  }

  async loadDetail(permalinkOrId: string) {
    this.busy = true;
    this.error = null;
    this.detail = null;
    try {
      this.detail = await rpc.detail({ id: permalinkOrId });
      this.loaded = true;
    } catch (e) {
      this.error = messageFromError(e);
    } finally {
      this.busy = false;
    }
  }

  async create(input: {
    name: string;
    description?: string;
    type?: ProjectType;
  }): Promise<{ ok: true } | { ok: false; gate: GateMessage | null; message: string }> {
    try {
      await rpc.create(input);
      await this.load();
      return { ok: true };
    } catch (e) {
      const gate = gateFromError(e);
      return { ok: false, gate, message: messageFromError(e) };
    }
  }

  async update(input: {
    id: string;
    name?: string;
    description?: string;
    goalId?: string | null;
  }): Promise<boolean> {
    try {
      await rpc.update(input);
      return true;
    } catch (e) {
      this.error = messageFromError(e);
      return false;
    }
  }

  async setDone(id: string, isDone: boolean) {
    await rpc.setDone({ id, isDone });
  }

  async archive(id: string) {
    await rpc.archive({ id });
  }

  async move(id: string, targetLensId: string): Promise<string | null> {
    try {
      await rpc.move({ id, targetLensId });
      return null;
    } catch (e) {
      const err = e as { message?: string };
      return err?.message ?? "Couldn't move the project.";
    }
  }

  async remove(
    id: string,
    taskDisposition?: "delete" | "reassign" | "triage",
    targetProjectId?: string,
  ) {
    await rpc.delete({ id, taskDisposition, targetProjectId });
  }

  async addTask(description: string): Promise<boolean> {
    if (!this.detail) return false;
    try {
      await rpc.createTask({
        description,
        lensId: this.detail.lensId,
        projectId: this.detail.id,
      });
      await this.loadDetail(this.detail.permalink);
      return true;
    } catch (e) {
      this.error = messageFromError(e);
      return false;
    }
  }

  async setTaskStatus(taskId: string, status: TaskStatus) {
    await rpc.setTaskStatus({ id: taskId, status });
    if (this.detail) await this.loadDetail(this.detail.permalink);
  }

  async startTask(taskId: string) {
    await rpc.startTask({ id: taskId });
  }

  /** Sibling projects for the delete/reassign sheet (same lens, active). */
  async reassignTargets(): Promise<{ id: string; name: string }[]> {
    if (!this.detail) return [];
    const rows = await rpc.list({ lensId: this.detail.lensId });
    return rows
      .filter((p) => p.id !== this.detail?.id && !p.isDone && !p.archivedAt)
      .map((p) => ({ id: p.id, name: p.name }));
  }

  async moveTargets(): Promise<{ id: string; name: string; color: string | null }[]> {
    if (!this.detail) return [];
    return rpc.moveTargets({ projectId: this.detail.id });
  }
}

export const projects = new ProjectsStore();
