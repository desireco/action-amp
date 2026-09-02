/**
 * Goals store — the S6 data layer (same pattern as projects.svelte.ts).
 * DTO interfaces mirror the contract's GoalSummary / GoalDetail schemas 1:1.
 */

import { client } from "../api";
import { lenses } from "./lenses.svelte";
import { gateFromError, messageFromError, type GateMessage } from "./projects.svelte";

/** Client slice for the goals procedures (see projects.svelte.ts note — the
 *  shared client's type gains `goals` when the composition line lands). */
interface GoalsClientSlice {
  list(input?: { lensId?: string }): Promise<GoalSummary[]>;
  detail(input: { id: string }): Promise<GoalDetail | null>;
  create(input: {
    name: string;
    lensId?: string;
    description?: string;
  }): Promise<{ id: string; permalink: string; name: string }>;
  setDone(input: { id: string; isDone: boolean }): Promise<{ id: string }>;
  update(input: {
    id: string;
    name?: string;
    description?: string;
  }): Promise<{ id: string; name: string; description: string | null }>;
  delete(input: { id: string }): Promise<{ id: string; reparentedCount: number }>;
  reorder(input: { goalId: string; orderedIds: string[] }): Promise<{ goalId: string }>;
}


const rpc = (client as unknown as { goals: GoalsClientSlice }).goals;

export interface GoalSummary {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  projectCount: number;
  progress: number;
  nextProject: { id: string; permalink: string; name: string } | null;
}

export interface GoalDetailProject {
  id: string;
  permalink: string;
  name: string;
  isDone: boolean;
  order: number;
  dueDate: string | null;
  tasks: { id: string; isDone: boolean }[];
}

export interface GoalDetail {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  isDone: boolean;
  completedAt: string | null;
  createdAt: string;
  lensId: string;
  projects: GoalDetailProject[];
}

class GoalsStore {
  goals = $state<GoalSummary[]>([]);
  /** Active goals in a specific lens (the project-side relink picker). */
  lensGoals = $state<GoalSummary[]>([]);
  detail = $state<GoalDetail | null>(null);
  error = $state<string | null>(null);
  busy = $state(false);
  loaded = $state(false);
  /** The lens scope the current `goals` rows were loaded with (the switch
   *  race guard). */
  loadedLensId = $state<string | null>(null);

  async load() {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      // Scoped to the shell's active lens (server falls back to the first
      // lens); the screen re-runs load() when the switcher moves.
      const lensId = lenses.activeLensId ?? undefined;
      this.goals = await rpc.list({ lensId });
      this.loadedLensId = lensId ?? null;
      this.loaded = true;
    } catch (e) {
      this.error = messageFromError(e);
    } finally {
      this.busy = false;
      // The busy guard drops a reload that arrives mid-flight; if the lens
      // moved during the fetch, converge on the new scope (at most once per
      // switch).
      if ((lenses.activeLensId ?? null) !== this.loadedLensId) void this.load();
    }
  }

  /** Active goals for one lens — the "Link a goal" picker (isDone: false). */
  async loadLens(lensId: string) {
    this.lensGoals = await rpc.list({ lensId });
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

  /** Create a goal. Same result shape as the projects store: the caller
   *  distinguishes a 402 gate (paywall moment) from a plain failure so the
   *  composer can show the error instead of silently closing. */
  async create(input: { name: string; description?: string }): Promise<
    { ok: true } | { ok: false; gate: GateMessage | null; message: string }
  > {
    try {
      await rpc.create({ ...input, lensId: lenses.activeLensId ?? undefined });
      await this.load();
      return { ok: true };
    } catch (e) {
      return { ok: false, gate: gateFromError(e), message: messageFromError(e) };
    }
  }

  async update(input: { id: string; name: string; description: string }): Promise<string | null> {
    try {
      await rpc.update(input);
      return null;
    } catch (e) {
      return messageFromError(e);
    }
  }

  async setDone(id: string, isDone: boolean) {
    await rpc.setDone({ id, isDone });
  }

  /** Lossless delete (children re-parent to standalone). */
  async remove(id: string) {
    await rpc.delete({ id });
  }

  /** Sequence under the goal: full-array write (order = index per id). */
  async reorder(goalId: string, orderedIds: string[]) {
    await rpc.reorder({ goalId, orderedIds });
  }
}

export const goals = new GoalsStore();
