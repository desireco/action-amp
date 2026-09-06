/**
 * Pure week-view grouping — extracted from WeekPage so the bucketing rules
 * are unit-testable without mounting the page.
 *
 * Rules (mirroring getWeekTasksData's pool):
 * - dated this week → its weekday bucket (promoting a task to Today must not
 *   make it disappear from its weekday);
 * - dated before the week started (overdue) → the Today bucket — an open
 *   task that slipped past its date is still due;
 * - TODAY with no scheduledDate → the Today bucket — a Today commit is due today,
 *   and today is inside this week;
 * - undated UPCOMING never reaches the pool (the query excludes it); a stray
 *   one is skipped defensively.
 */
import type { TaskLensListRow } from "../tasks/operationsCore";
import {
  currentPlainDate,
  plainDateFromValue,
} from "../shared/time/temporal";

export type WeekBucket = { key: string; items: TaskLensListRow[] };

/** yyyy-mm-dd local — the bucket key. */
export function dayKey(date: Date | string): string {
  return plainDateFromValue(date).toString();
}

export function bucketWeekTasks(
  tasks: TaskLensListRow[],
  weekStart: Date | string,
  today: Date | string = currentPlainDate().toString(),
): WeekBucket[] {
  const byDay = new Map<string, TaskLensListRow[]>();
  const start = plainDateFromValue(weekStart);
  for (let offset = 0; offset < 7; offset += 1) {
    byDay.set(start.add({ days: offset }).toString(), []);
  }
  const todayKey = dayKey(today);
  for (const task of tasks) {
    if (task.scheduledDate) {
      const key = dayKey(new Date(task.scheduledDate));
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
