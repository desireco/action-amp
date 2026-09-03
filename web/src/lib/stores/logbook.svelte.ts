/**
 * Logbook store — the S8 data layer (same pattern as goals.svelte.ts).
 * DTO interfaces mirror the contract's Logbook schemas 1:1
 * (packages/contract/src/logbook.ts) — temporals arrive as ISO strings.
 *
 * The five categories are merged into one timeline client-side (webapp
 * LogbookPage parity): day grouping, sorting, and labels are a client
 * concern (local-time, browser TZ); the server only orders.
 */

import { client } from "../api";
import { lenses } from "./lenses.svelte";
import { messageFromError } from "./projects.svelte";

/** Client slice for the logbook procedure (see goals.svelte.ts note — the
 *  structural cast keeps the store typechecking regardless of composition
 *  timing). */
interface LogbookClientSlice {
  data(input?: { lensId?: string }): Promise<LogbookData>;
}

const rpc = (client as unknown as { logbook: LogbookClientSlice }).logbook;

export interface LogbookTaskEntry {
  id: string;
  title: string;
  completedAt: string;
  size: string;
  outcome: string | null;
  project: { id: string; name: string } | null;
  kind: "task";
}

export interface LogbookWontDoEntry {
  id: string;
  title: string;
  completedAt: string;
  size: string;
  project: { id: string; name: string } | null;
  kind: "wont-do";
}

export interface LogbookProjectEntry {
  id: string;
  title: string;
  completedAt: string;
  goal: { id: string; name: string } | null;
  kind: "project";
}

export interface LogbookGoalEntry {
  id: string;
  title: string;
  completedAt: string;
  goal: null;
  kind: "goal";
}

export interface LogbookArchivedEntry {
  id: string;
  title: string;
  archivedAt: string;
  kind: "archived";
}

export interface LogbookData {
  tasks: LogbookTaskEntry[];
  wontDo: LogbookWontDoEntry[];
  projects: LogbookProjectEntry[];
  goals: LogbookGoalEntry[];
  archived: LogbookArchivedEntry[];
}

/** One merged timeline row — the view's shape (webapp LogItem parity). */
export interface LogItem {
  id: string;
  title: string;
  /** completedAt (tasks/projects/goals), archivedAt (archived), updatedAt→completedAt (wont-do). */
  when: Date;
  kind: "task" | "wont-do" | "project" | "goal" | "archived";
  outcome?: string | null;
  project?: { id: string; name: string } | null;
  goal?: { id: string; name: string } | null;
}

/** Day label: Today / Yesterday / weekday (< 7d) / locale date. Client-side,
 *  local-time — the webapp's dayLabel ported verbatim. */
export function dayLabel(d: Date): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((now.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return target.toLocaleDateString(undefined, { weekday: "long" });
  return target.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Merge the five categories into day-grouped sections, newest first. */
export function groupLogbook(data: LogbookData): { key: string; label: string; items: LogItem[] }[] {
  const all: LogItem[] = [
    ...data.tasks.map((t) => ({ ...t, when: new Date(t.completedAt) })),
    ...data.wontDo.map((t) => ({ ...t, when: new Date(t.completedAt) })),
    ...data.projects.map((p) => ({ ...p, when: new Date(p.completedAt) })),
    ...data.goals.map((g) => ({ ...g, when: new Date(g.completedAt) })),
    ...data.archived.map((a) => ({ ...a, when: new Date(a.archivedAt) })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime());

  const byDay = new Map<string, LogItem[]>();
  for (const item of all) {
    const key = dayLabel(item.when);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(item);
  }
  return Array.from(byDay, ([label, items]) => ({ key: label, label, items }));
}

class LogbookStore {
  data = $state<LogbookData | null>(null);
  error = $state<string | null>(null);
  busy = $state(false);
  loaded = $state(false);

  /** Request token: last load wins (a lens switch mid-flight supersedes the
   *  older read instead of racing it or being dropped by a busy guard — the
   *  response is lens-scoped now, so a stale landing is visible wrong data). */
  #seq = 0;

  async load() {
    const seq = ++this.#seq;
    this.busy = true;
    try {
      // Lens-scoped (AppShell parity): the active lens, never the server's
      // primary-lens stopgap — the shell's active lens decides the context.
      const data = await rpc.data({ lensId: lenses.activeLensId ?? undefined });
      if (seq !== this.#seq) return;
      this.data = data;
      this.loaded = true;
      this.error = null;
    } catch (e) {
      if (seq !== this.#seq) return;
      this.error = messageFromError(e);
    } finally {
      if (seq === this.#seq) this.busy = false;
    }
  }

  /** Archived note → back to the inbox (UNPROCESSED). */
  async restoreArchived(id: string) {
    await client.inbox.restore({ inboxItemId: id });
    await this.load();
  }

  /** Declined task → Upcoming (the safe default horizon — never Today). */
  async restoreWontDo(id: string) {
    await client.tasks.updateStatus({ id, status: "UPCOMING" });
    await this.load();
  }

  /** Completed goal → active list. */
  async reopenGoal(id: string) {
    await client.goals.setDone({ id, isDone: false });
    await this.load();
  }

  /** Completed project → active list. */
  async reopenProject(id: string) {
    await client.projects.setDone({ id, isDone: false });
    await this.load();
  }
}

export const logbook = new LogbookStore();
