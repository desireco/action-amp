/**
 * Tasks store — the first real store on the contract client (the pattern
 * every later data store copies): a class with `$state` fields + plain
 * methods, exported as a singleton from a `*.svelte.ts` module. All server
 * contact goes through the client in `../api` — never fetch, never
 * `@orpc/*` imports outside it.
 */

import { client, type Task } from "../api";

class TasksStore {
  tasks = $state<Task[]>([]);
  /** Last load failure (user-presentable message). */
  error = $state<string | null>(null);
  busy = $state(false);
  /** True once a load has completed (success or failure). */
  loaded = $state(false);

  /** Open tasks in manual list order — what the work screen renders. */
  get open(): Task[] {
    return this.tasks.filter((t) => !t.isDone).sort((a, b) => a.order - b.order);
  }

  async load() {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      this.tasks = await client.tasks.list();
      this.loaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
    }
  }
}

export const tasks = new TasksStore();
