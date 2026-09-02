/**
 * Lists store — the S4 surfaces' data client (Today / Week / Done-today /
 * lens-scoped Upcoming + Someday), F9a class-singleton pattern.
 *
 * Lens scoping rides the shell's active lens (lenses.activeLensId, first lens
 * as fallback): the LensSwitcher's switch re-points the id and the /do/upcoming
 * + /do/someday screens re-run their loads off it.
 */
import { client } from "../api";
import type { TaskLensListRowDto, TaskListRowDto, AppData, TaskStatus } from "../dto";
import { lenses } from "./lenses.svelte";

/** Today-cap fallback while appData is loading (matches the server default). */
export const TODAY_CAP_DEFAULT = 5;

class ListsStore {
  appData = $state<AppData | null>(null);
  today = $state<TaskLensListRowDto[]>([]);
  week = $state<TaskLensListRowDto[]>([]);
  doneToday = $state<TaskLensListRowDto[]>([]);
  /** Lens-scoped bench / parked lists, keyed by status. */
  upcoming = $state<TaskListRowDto[]>([]);
  someday = $state<TaskListRowDto[]>([]);
  loading = $state(false);
  loaded = $state(false);
  error = $state<string | null>(null);

  get todayCap(): number {
    return this.appData?.todayCap ?? TODAY_CAP_DEFAULT;
  }

  /** The lens the lens-scoped lists render: the shell's active lens, falling
   *  back to the first accessible one while the switcher hasn't chosen. */
  get scopedLensId(): string | null {
    if (lenses.activeLensId) return lenses.activeLensId;
    // FREE default: the included lens, never a locked one (webapp parity).
    const list = this.appData?.lenses ?? [];
    return list.find((l) => l.isIncluded)?.id ?? list[0]?.id ?? null;
  }

  get showLensPill(): boolean {
    return (this.appData?.lenses.length ?? 0) > 1;
  }

  async loadAppData(): Promise<AppData | null> {
    try {
      this.appData = await client.tasks.appData({});
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    return this.appData;
  }

  async loadToday() {
    this.loading = true;
    this.error = null;
    try {
      if (!this.appData) await this.loadAppData();
      const [today, week, done] = await Promise.all([
        client.tasks.today(),
        client.tasks.week(),
        client.tasks.doneToday({}),
      ]);
      this.today = today;
      this.week = week;
      this.doneToday = done;
      this.loaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async loadLensList(status: "UPCOMING" | "SOMEDAY") {
    this.loading = true;
    this.error = null;
    try {
      if (!this.appData) await this.loadAppData();
      const lensId = this.scopedLensId;
      if (!lensId) {
        if (status === "UPCOMING") this.upcoming = [];
        else this.someday = [];
        return;
      }
      const rows = await client.tasks.byLens({ lensId, status, isDone: false });
      // A switch superseded this fetch: let the newer load win the write.
      if (lensId !== this.scopedLensId) return;
      if (status === "UPCOMING") this.upcoming = rows;
      else this.someday = rows;
      this.loaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async updateStatus(id: string, status: TaskStatus) {
    await client.tasks.updateStatus({ id, status });
    await this.refreshAll();
  }

  async updateDetails(patch: Parameters<typeof client.tasks.updateDetails>[0]) {
    await client.tasks.updateDetails(patch);
    await this.refreshAll();
  }

  async unscheduleOverdue() {
    const lensId = this.scopedLensId;
    if (!lensId) return;
    await client.tasks.unscheduleOverdue({ lensId });
    await this.refreshAll();
  }

  /** Re-read every list the mutation could have touched (the React Query
   *  invalidation set: today, week, done, upcoming, someday, appData). */
  async refreshAll() {
    const jobs: Promise<void>[] = [this.loadAppData().then(() => undefined)];
    if (this.today.length > 0 || this.loaded) jobs.push(this.loadTodayPreserving());
    if (this.upcoming.length > 0) jobs.push(this.loadLensList("UPCOMING"));
    if (this.someday.length > 0) jobs.push(this.loadLensList("SOMEDAY"));
    await Promise.all(jobs);
  }

  private async loadTodayPreserving() {
    const [today, week, done] = await Promise.all([
      client.tasks.today(),
      client.tasks.week(),
      client.tasks.doneToday({}),
    ]);
    this.today = today;
    this.week = week;
    this.doneToday = done;
  }
}

export const lists = new ListsStore();
