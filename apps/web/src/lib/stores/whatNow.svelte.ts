/**
 * What Now store — the S1 chooser + focus engine client (F9a pattern: a
 * class with `$state` fields + plain methods, exported as a singleton).
 * All server contact goes through the client in `../api`.
 */
import { client } from "../api";
import type {
  AppData,
  FocusedTask,
  RankedTask,
  WhatNowTask,
  SnoozePreset,
} from "../dto";

/** Today-cap fallback while appData is loading (matches the server default). */
export const TODAY_CAP_DEFAULT = 5;

class WhatNowStore {
  /** App-shell bootstrap (lenses + counts + todayCap). */
  appData = $state<AppData | null>(null);
  /** The ranked #1 candidate for the active lens (null = nothing on the table). */
  topTask = $state<WhatNowTask | null>(null);
  /** The picked task taking the stage (/do/today/:permalink), if any.
   *  SAFETY: the detail shape overlaps the What Now card's inputs for every
   *  field it renders; history relations are absent, exactly like the
   *  webapp's getTask path (continuity degrades to "no history"). */
  picked = $state<Awaited<ReturnType<typeof client.tasks.task>> | null>(null);
  alternatives = $state<RankedTask[]>([]);
  otherCounts = $state<{ lensId: string; lensName: string; count: number }[]>([]);
  focused = $state<FocusedTask | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  /** Active lens: remembered, else the first accessible one. */
  lensId = $state<string | null>(null);
  get lens() {
    const lenses = this.appData?.lenses ?? [];
    return lenses.find((l) => l.id === this.lensId) ?? lenses[0] ?? null;
  }

  get todayCap(): number {
    return this.appData?.todayCap ?? TODAY_CAP_DEFAULT;
  }

  async loadAppData() {
    try {
      this.appData = await client.tasks.appData({});
      if (!this.lensId || !this.appData.lenses.some((l) => l.id === this.lensId)) {
        this.lensId = this.appData.lenses[0]?.id ?? null;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  /** Load the chooser for the current stage: picked token or the ranked #1. */
  async load(pickedToken: string | null) {
    if (!this.lensId) await this.loadAppData();
    const lensId = this.lensId;
    if (!lensId) return;
    this.loading = true;
    this.error = null;
    try {
      if (pickedToken) {
        this.picked = await client.tasks.task({ id: pickedToken });
        this.topTask = this.picked ? await client.tasks.topTask({ lensId }) : null;
      } else {
        this.picked = null;
        this.topTask = await client.tasks.topTask({ lensId });
      }
      const task = this.picked ?? this.topTask;
      // Alternatives render only while deciding — a started task keeps the
      // stage to itself.
      this.alternatives =
        !task?.startedAt && task
          ? await client.tasks.alternatives({
              lensId,
              excludeIds: [task.id],
            })
          : [];
      this.otherCounts =
        !pickedToken && !task
          ? await client.tasks.otherLensCounts({ excludeLensId: lensId })
          : [];
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  /** The user's one started task (Focus route). */
  async loadFocused() {
    if (!this.focused) {
      try {
        this.focused = await client.tasks.focusedTask();
      } catch {
        this.focused = null;
      }
    }
    this.loading = false;
    if (this.focused) {
      // Refresh in place: a stale empty cache must not bounce to /do.
      const fresh = await client.tasks.focusedTask().catch(() => null);
      if (fresh !== null) this.focused = fresh;
    }
  }

  async start(id: string): Promise<boolean> {
    try {
      await client.tasks.start({ id });
      this.focused = null;
      return true;
    } catch {
      return false;
    }
  }

  async pause(id: string) {
    await client.tasks.pause({ id });
  }

  async snooze(id: string, preset: SnoozePreset) {
    await client.tasks.snooze({ id, preset });
  }

  async complete(id: string, outcome?: string) {
    await client.tasks.complete(outcome ? { taskId: id, outcome } : { taskId: id });
    this.focused = null;
  }

  async completeSession(id: string) {
    try {
      await client.tasks.completeSession({ id });
    } catch {
      // Server-time guard ("Focus session is still running.") — the timer
      // will re-fire at zero; nothing to surface yet.
    }
    if (this.focused?.id === id) this.focused = await client.tasks.focusedTask();
  }

  async startSession(id: string) {
    await client.tasks.start({ id });
    if (this.focused?.id === id) this.focused = await client.tasks.focusedTask();
  }

  async addNote(taskId: string, body: string) {
    await client.tasks.addUpdate({ taskId, body });
    if (this.focused?.id === taskId) this.focused = await client.tasks.focusedTask();
  }

  async saveContent(taskId: string, content: string) {
    await client.tasks.updateContent({ taskId, content });
    if (this.focused?.id === taskId) this.focused = await client.tasks.focusedTask();
  }
}

export const whatNow = new WhatNowStore();
