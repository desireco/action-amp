/**
 * Pure week-view grouping — extracted from WeekPage so the bucketing rules
 * are unit-testable without mounting the page.
 *
 * Rules (mirroring getWeekTasksData's pool):
 * - dated this week → its weekday bucket (promoting a task to Today must not
 *   make it disappear from its weekday);
 * - dated before the week started (overdue) → the Today bucket — an open
 *   task that slipped past its date is still due;
 * - TODAY with no dueDate → the Today bucket — a Today commit is due today,
 *   and today is inside this week;
 * - undated UPCOMING never reaches the pool (the query excludes it); a stray
 *   one is skipped defensively.
 */
import type { TaskLensListRow } from "../tasks/operationsCore";

export type WeekBucket = { key: string; items: TaskLensListRow[] };

/** yyyy-mm-dd local — the bucket key. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function bucketWeekTasks(
  tasks: TaskLensListRow[],
  weekStart: Date,
  today = new Date(),
): WeekBucket[] {
  const byDay = new Map<string, TaskLensListRow[]>();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + offset);
    byDay.set(dayKey(date), []);
  }
  const todayKey = dayKey(today);
  for (const task of tasks) {
    if (task.dueDate) {
      const key = dayKey(new Date(task.dueDate));
      if (byDay.has(key)) {
        byDay.get(key)!.push(task); // dated this week → its weekday
      } else {
        byDay.get(todayKey)?.push(task); // overdue → Today
      }
    } else if (task.status === "TODAY") {
      byDay.get(todayKey)?.push(task); // committed now → Today
    }
  }
  return Array.from(byDay, ([key, items]) => ({ key, items }));
}
