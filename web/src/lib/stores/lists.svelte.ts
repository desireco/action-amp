/**
 * Lists store — the S4 surfaces' data client (Today / Week / Done-today /
 * the global Upcoming bench + lens-scoped Someday), F9a class-singleton
 * pattern.
 *
 * Upcoming is universal like Today (#10, 2026-09-24): one load across every
 * accessible lens, filtered client-side. Someday stays lens-scoped off the
 * shell's active lens (lenses.activeLensId, first lens as fallback).
 */
import { client } from "../api";
import type { TaskLensListRowDto, TaskListRowDto, AppData, TaskStatus } from "../dto";
import { lenses, entitlementDefaultLensId } from "./lenses.svelte";
import { prefs } from "./prefs.svelte";

/** Today-cap fallback while appData is loading (matches the server default). */
export const TODAY_CAP_DEFAULT = 5;

class ListsStore {
  appData = $state<AppData | null>(null);
  today = $state<TaskLensListRowDto[]>([]);
  week = $state<TaskLensListRowDto[]>([]);
  doneToday = $state<TaskLensListRowDto[]>([]);
  /** The global bench (all accessible lenses) + the lens-scoped parked list. */
  upcoming = $state<TaskLensListRowDto[]>([]);
  someday = $state<TaskListRowDto[]>([]);
  loading = $state(false);
  loaded = $state(false);
  error = $state<string | null>(null);

  get todayCap(): number {
    return this.appData?.todayCap ?? TODAY_CAP_DEFAULT;
  }

  /** The lens the lens-scoped lists render: the shell's active lens, falling
   *  back to the entitlement-aware default. The fallback is the SHELL's rule
   *  (not included-first) so a read before the shell resolves never scopes
   *  to the other lens. */
  get scopedLensId(): string | null {
    if (lenses.activeLensId) return lenses.activeLensId;
    const list = this.appData?.lenses ?? [];
    return entitlementDefaultLensId(list, prefs.account);
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

  /** The global bench: every accessible lens's UPCOMING (#10). */
  async loadUpcomingAll() {
    this.loading = true;
    this.error = null;
    try {
      if (!this.appData) await this.loadAppData();
      this.upcoming = await client.tasks.upcomingAll();
      this.loaded = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }

  async loadLensList(status: "UPCOMING" | "SOMEDAY") {
    // The bench went global (#10): route Upcoming through the global load.
    if (status === "UPCOMING") return this.loadUpcomingAll();
    this.loading = true;
    this.error = null;
    try {
      if (!this.appData) await this.loadAppData();
      const lensId = this.scopedLensId;
      if (!lensId) {
        this.someday = [];
        return;
      }
      const rows = await client.tasks.byLens({ lensId, status, isDone: false });
      // A switch superseded this fetch: let the newer load win the write.
      if (lensId !== this.scopedLensId) return;
      this.someday = rows;
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

  /** Clear overdue scheduledDates in the given lenses (the bench spans
   * lenses — #10; the op stays per-lens, the page batches). */
  async unscheduleOverdue(lensIds: string[]) {
    for (const lensId of lensIds) {
      await client.tasks.unscheduleOverdue({ lensId });
    }
    await this.refreshAll();
  }

  /** Re-read every list the mutation could have touched (the React Query
   *  invalidation set: today, week, done, upcoming, someday, appData). */
  async refreshAll() {
    const jobs: Promise<void>[] = [this.loadAppData().then(() => undefined)];
    if (this.today.length > 0 || this.loaded) jobs.push(this.loadTodayPreserving());
    if (this.upcoming.length > 0) jobs.push(this.loadUpcomingAll());
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
