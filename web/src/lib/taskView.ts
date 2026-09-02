/**
 * Pure view helpers for the S1+S4 screens — ported from the webapp's
 * `app/focusWhy.ts`, `app/taskContext.ts`, `app/focusTaskView.ts`,
 * `shared/dateFormat.ts`, `lists/weekView.ts`, and
 * `tasks/taskPropertyFields.ts`. Same rules, same copy; date math uses plain
 * local `Date`s (calendar-day granularity — due dates are day-granular by
 * design), no Temporal dependency in the browser bundle.
 */
import type { TaskPriority, TaskSize, TaskStatus } from "./dto";

// ----------------------------------------------------------------
// Calendar-day math (local zone, day-granular)
// ----------------------------------------------------------------

/** Parse a `yyyy-MM-dd` wire date as a LOCAL midnight Date. */
export function plainDateFromValue(value: string | Date): Date {
  if (value instanceof Date) {
    // UTC-midnight wire dates → local calendar day.
    return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function currentPlainDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whole-day diff: 0 = today, -1 = yesterday/overdue, 1 = tomorrow. */
export function calendarDayDifference(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ----------------------------------------------------------------
// Labels (focusTaskView + dateFormat)
// ----------------------------------------------------------------

export function sizeLabel(size: string | null | undefined): string {
  if (!size) return "";
  return ({ S: "15 min", M: "30 min", L: "1 hr", XL: "2 hr+" })[size as TaskSize] ?? size;
}

export function formatWhen(date: string | Date): string {
  const target = plainDateFromValue(date);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return target.toLocaleString("en-US", { weekday: "short" });
  return target.toLocaleString("en-US", { month: "short", day: "numeric" });
}

export interface DueChip {
  label: string;
  overdue: boolean;
}

export function formatDueChip(d: string | Date): DueChip {
  const target = plainDateFromValue(d);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, overdue: true };
  if (diffDays === 0) return { label: "today", overdue: false };
  if (diffDays === 1) return { label: "tomorrow", overdue: false };
  if (diffDays < 7) return { label: `in ${diffDays}d`, overdue: false };
  return {
    label: target.toLocaleString("en-US", { month: "short", day: "numeric" }),
    overdue: false,
  };
}

/** Compact duration label: "12 min" / "1h 5m" / "3h" / "0 min". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// ----------------------------------------------------------------
// The truthful "why this?" (focusWhy.ts)
// ----------------------------------------------------------------

export interface FocusWhyInput {
  startedAt?: string | null;
  priority: string;
  size: string;
  status?: string;
  scheduledDate?: string | Date | null;
}

export interface FocusWhy {
  lead: string;
  detail: string;
}

const SIZE_MINUTES = new Map<string, number>([
  ["S", 15],
  ["M", 30],
  ["L", 60],
  ["XL", 120],
]);

function dayDiff(date: string | Date): number {
  return calendarDayDifference(currentPlainDate(), plainDateFromValue(date));
}

function dueClause(scheduledDate: FocusWhyInput["scheduledDate"]): string | null {
  if (!scheduledDate) return null;
  const diff = dayDiff(scheduledDate);
  if (diff < 0) return "overdue";
  if (diff === 0) return "due today";
  if (diff === 1) return "due tomorrow";
  const date = plainDateFromValue(scheduledDate);
  if (diff <= 7) return `due ${date.toLocaleString("en-US", { weekday: "short" })}`;
  return `due ${date.toLocaleString("en-US", { month: "short", day: "numeric" })}`;
}

function sizeClause(size: string): string | null {
  const mins = SIZE_MINUTES.get(size);
  if (!mins || mins >= 60) return null;
  return `fits in ${mins} min`;
}

export function composeWhy(task: FocusWhyInput): FocusWhy {
  if (task.startedAt) {
    return { lead: "You're already doing this.", detail: "" };
  }

  let lead = "";
  if (task.priority === "IMPORTANT") {
    lead = "Important";
  } else if (task.priority === "LOW") {
    const minutes = SIZE_MINUTES.get(task.size);
    lead = minutes && minutes < 60 ? "Quick win" : "Low priority";
  }

  const due = task.scheduledDate ? dueClause(task.scheduledDate) : null;
  const size = sizeClause(task.size);
  const parts = [due, size].filter((p): p is string => p !== null);

  let detail = "";
  if (parts.length > 0) {
    if (lead) {
      detail =
        parts.length === 1 && due === "overdue" ? `and ${parts[0]}` : `— ${parts.join(", ")}`;
    } else {
      detail = parts.join(", ");
      detail = detail.charAt(0).toUpperCase() + detail.slice(1);
    }
  }

  return { lead, detail };
}

// ----------------------------------------------------------------
// Goal rationale + continuity (taskContext.ts)
// ----------------------------------------------------------------

export interface GoalRefInput {
  id: string;
  name: string;
  description?: string | null;
}

export interface TaskContextInput {
  project?: { id: string; name: string; goal?: GoalRefInput | null } | null;
  goal?: GoalRefInput | null;
  sessions?: { startedAt: string; endedAt?: string | null }[];
  updates?: { body: string; createdAt: string; kind?: string }[];
}

export interface GoalContext {
  name: string;
  description: string | null;
}

export function resolveGoal(task: TaskContextInput): GoalContext | null {
  const ref = task.project?.goal ?? task.goal ?? null;
  if (!ref) return null;
  const trimmed = ref.description?.trim() || null;
  return { name: ref.name, description: trimmed };
}

export interface TaskContinuity {
  workedMs: number;
  workedLabel: string | null;
  sessionCount: number;
  noteCount: number;
  latestNote: string | null;
}

function isValidSession(s: { startedAt: string; endedAt?: string | null }): boolean {
  if (!s.endedAt) return false;
  return new Date(s.endedAt).getTime() > new Date(s.startedAt).getTime();
}

export function formatWorkedLabel(workedMs: number): string | null {
  if (!Number.isFinite(workedMs) || workedMs <= 0) return null;
  if (workedMs < 60_000) return "<1 min worked";
  const minutes = Math.round(workedMs / 60_000);
  if (minutes < 1) return "<1 min worked";
  if (minutes === 1) return "1 min worked";
  return `${minutes} min worked`;
}

export function resolveContinuity(task: TaskContextInput): TaskContinuity {
  const sessions = task.sessions ?? [];
  const valid = sessions.filter(isValidSession);
  const workedMs = valid.reduce(
    (sum, s) =>
      sum + Math.max(0, new Date(s.endedAt ?? "").getTime() - new Date(s.startedAt).getTime()),
    0,
  );

  const notes = (task.updates ?? [])
    .filter((u) => (u.kind ?? "NOTE") === "NOTE")
    .map((u) => ({ body: u.body.trim(), at: new Date(u.createdAt).getTime() }))
    .filter((u) => u.body.length > 0 && !Number.isNaN(u.at));

  const newest = [...notes].sort((a, b) => b.at - a.at)[0]?.body ?? null;

  return {
    workedMs,
    workedLabel: formatWorkedLabel(workedMs),
    sessionCount: valid.length,
    noteCount: notes.length,
    latestNote: newest,
  };
}

export function continuityStatsRow(c: TaskContinuity): string | null {
  const parts: string[] = [];
  if (c.workedLabel) parts.push(c.workedLabel);
  if (c.sessionCount > 0) {
    parts.push(`${c.sessionCount} session${c.sessionCount === 1 ? "" : "s"}`);
  }
  if (c.noteCount > 0) {
    parts.push(`${c.noteCount} note${c.noteCount === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

// ----------------------------------------------------------------
// Week bucketing (weekView.ts)
// ----------------------------------------------------------------

export interface WeekBucketLike {
  scheduledDate: string | null;
  status: string;
}

export type WeekBucket<T extends WeekBucketLike> = { key: string; items: T[] };

export function dayKey(date: string | Date): string {
  const d = plainDateFromValue(date);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local Monday of the current week as `yyyy-MM-dd`. */
export function startOfWeekKey(): string {
  const today = currentPlainDate();
  const offset = (today.getDay() + 6) % 7; // Monday=0
  return dayKey(new Date(today.getTime() - offset * 86_400_000));
}

function shiftKey(key: string, days: number): string {
  const d = plainDateFromValue(key);
  return dayKey(new Date(d.getTime() + days * 86_400_000));
}

export function bucketWeekTasks<T extends WeekBucketLike>(
  tasks: T[],
  weekStart: string,
  today: string = dayKey(currentPlainDate()),
): WeekBucket<T>[] {
  const byDay = new Map<string, T[]>();
  for (let offset = 0; offset < 7; offset += 1) {
    byDay.set(shiftKey(weekStart, offset), []);
  }
  for (const task of tasks) {
    if (task.scheduledDate) {
      const key = dayKey(task.scheduledDate);
      if (byDay.has(key)) byDay.get(key)!.push(task);
      else byDay.get(today)?.push(task); // overdue → Today
    } else if (task.status === "TODAY") {
      byDay.get(today)?.push(task); // committed now → Today
    }
  }
  return Array.from(byDay, ([key, items]) => ({ key, items }));
}

// ----------------------------------------------------------------
// Property fields + chip patch mapping (taskPropertyFields.ts)
// ----------------------------------------------------------------

export interface PropertyOption {
  value: string;
  label: string;
  hint?: string | null;
}

export interface PropertyPickerItem {
  id: string;
  label: string;
  meta?: string | null;
}

export interface PropertyField {
  key: string;
  variant: "when" | "important" | "normal" | "size" | "project" | "goal" | "due";
  displayValue: string;
  value: string | null;
  options?: PropertyOption[];
  picker?: {
    title: string;
    items: PropertyPickerItem[];
    allowNone?: boolean;
    noneLabel?: string;
  };
  unset?: boolean;
  addLabel?: string;
}

const WHEN_OPTS: PropertyOption[] = [
  { value: "TODAY", label: "Today", hint: "on the table now" },
  { value: "UPCOMING", label: "Upcoming", hint: "the bench" },
  { value: "SOMEDAY", label: "Someday", hint: "maybe later" },
];
const PRIORITY_OPTS: PropertyOption[] = [
  { value: "LOW", label: "Low", hint: "when you can" },
  { value: "NORMAL", label: "Normal", hint: "default" },
  { value: "IMPORTANT", label: "Important", hint: "today matters" },
];
const SIZE_OPTS: PropertyOption[] = [
  { value: "S", label: "S", hint: "15 min" },
  { value: "M", label: "M", hint: "30 min" },
  { value: "L", label: "L", hint: "1 hr" },
  { value: "XL", label: "XL", hint: "2 hr+" },
];

/** Scheduling presets resolve to a concrete local calendar day (`yyyy-MM-dd`). */
export function presetToScheduledDate(preset: string, _now = new Date()): string | null {
  if (preset === "none") return null;
  const today = currentPlainDate();
  const key = (d: Date) => dayKey(d);
  if (preset === "today") return key(today);
  if (preset === "tomorrow") return key(new Date(today.getTime() + 86_400_000));

  const weekday = Number(preset.replace("weekday-", ""));
  if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) {
    const targetDay = weekday === 0 ? 7 : weekday; // Monday=1..Sunday=7
    const todayDow = (today.getDay() + 6) % 7 + 1;
    const daysAhead = (targetDay - todayDow + 7) % 7;
    return key(new Date(today.getTime() + daysAhead * 86_400_000));
  }

  if (preset === "next-week") {
    const daysAhead = 8 - ((today.getDay() + 6) % 7 + 1);
    return key(new Date(today.getTime() + daysAhead * 86_400_000));
  }
  if (preset === "next-month") {
    return key(new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()));
  }
  return null;
}

const DUE_OPTS: PropertyOption[] = [
  { value: "none", label: "No due date" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekday-1", label: "Monday" },
  { value: "weekday-2", label: "Tuesday" },
  { value: "weekday-3", label: "Wednesday" },
  { value: "weekday-4", label: "Thursday" },
  { value: "weekday-5", label: "Friday" },
  { value: "weekday-6", label: "Saturday" },
  { value: "weekday-0", label: "Sunday" },
  { value: "next-week", label: "Next Monday" },
  { value: "next-month", label: "Next month" },
];

function dueLabel(scheduledDate: string | null): string | null {
  if (!scheduledDate) return null;
  const target = plainDateFromValue(scheduledDate);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return target.toLocaleString("en-US", { weekday: "short" });
  return target.toLocaleString("en-US", { month: "short", day: "numeric" });
}

function duePreset(scheduledDate: string | null): string {
  if (!scheduledDate) return "none";
  const target = plainDateFromValue(scheduledDate);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays >= 0 && diffDays <= 6) {
    const dow = (target.getDay() + 6) % 7 + 1; // Monday=1..Sunday=7
    return `weekday-${dow === 7 ? 0 : dow}`;
  }
  if (diffDays >= 7 && diffDays <= 13) return "next-week";
  return "next-month";
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  IMPORTANT: "Important",
};
const WHEN_LABEL: Record<TaskStatus, string> = {
  TODAY: "Today",
  UPCOMING: "Upcoming",
  SOMEDAY: "Someday",
  WONT_DO: "Upcoming",
};

export interface TaskChipState {
  status: TaskStatus;
  priority: TaskPriority;
  size: TaskSize;
  scheduledDate: string | null;
  project: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
}

export function taskPropertyFields({
  task,
  projects,
  goals,
}: {
  task: TaskChipState;
  projects: PropertyPickerItem[];
  goals: PropertyPickerItem[];
}): PropertyField[] {
  const fields: PropertyField[] = [
    {
      key: "status",
      variant: "when",
      value: task.status,
      displayValue: WHEN_LABEL[task.status] ?? "Upcoming",
      options: WHEN_OPTS,
    },
    {
      key: "priority",
      variant: task.priority === "IMPORTANT" ? "important" : "normal",
      value: task.priority,
      displayValue: PRIORITY_LABEL[task.priority] ?? "Normal",
      options: PRIORITY_OPTS,
    },
    {
      key: "size",
      variant: "size",
      value: task.size,
      displayValue: task.size,
      options: SIZE_OPTS,
    },
    {
      key: "project",
      variant: "project",
      value: task.project?.id ?? null,
      displayValue: task.project?.name ?? "No project",
      picker: {
        title: "Project",
        items: projects,
        allowNone: true,
        noneLabel: "No project",
      },
    },
  ];

  // Due — bench only: a committed (TODAY) row never renders two "today"
  // signals (one-field-may-say-today, mirrored from the server rule).
  if (task.status !== "TODAY") {
    const label = dueLabel(task.scheduledDate);
    if (label) {
      fields.push({
        key: "due",
        variant: "due",
        value: duePreset(task.scheduledDate),
        displayValue: label,
        options: DUE_OPTS,
      });
    } else {
      fields.push({
        key: "due",
        variant: "due",
        value: null,
        displayValue: "Due",
        addLabel: "Due",
        unset: true,
        options: DUE_OPTS.filter((o) => o.value !== "none"),
      });
    }
  }

  // Goal — picker-backed, only when there's no project (one-parent rule).
  if (!task.project) {
    if (task.goal) {
      fields.push({
        key: "goal",
        variant: "goal",
        value: task.goal.id,
        displayValue: task.goal.name,
        picker: {
          title: "Goal",
          items: goals,
          allowNone: true,
          noneLabel: "No goal",
        },
      });
    } else {
      fields.push({
        key: "goal",
        variant: "goal",
        value: null,
        displayValue: "Goal",
        addLabel: "Goal",
        unset: true,
        picker: {
          title: "Goal",
          items: goals,
          allowNone: false,
        },
      });
    }
  }

  return fields;
}

/** The updateTaskDetails patch a chip pick produces (invalid picks → {}). */
export interface TaskChipPatch {
  status?: "TODAY" | "UPCOMING" | "SOMEDAY";
  priority?: TaskPriority;
  size?: TaskSize;
  scheduledDate?: string | null;
}

const TASK_STATUSES = new Set<string>(["TODAY", "UPCOMING", "SOMEDAY"]);
const TASK_PRIORITIES = new Set<string>(["LOW", "NORMAL", "IMPORTANT"]);
const TASK_SIZES = new Set<string>(["S", "M", "L", "XL"]);

export function chipPickToTaskPatch(fieldKey: string, value: string): TaskChipPatch {
  switch (fieldKey) {
    case "status":
      return TASK_STATUSES.has(value)
      ? { status: value as "TODAY" | "UPCOMING" | "SOMEDAY" }
      : {};
    case "priority":
      return TASK_PRIORITIES.has(value) ? { priority: value as TaskPriority } : {};
    case "size":
      return TASK_SIZES.has(value) ? { size: value as TaskSize } : {};
    case "due":
      return { scheduledDate: presetToScheduledDate(value) };
    default:
      return {};
  }
}

// ----------------------------------------------------------------
// Property-key shortcut cycles (usePropertyKeys.ts)
// ----------------------------------------------------------------

export const SIZE_ORDER = ["S", "M", "L", "XL"] as const;
export const PRIORITY_ORDER = ["LOW", "NORMAL", "IMPORTANT"] as const;
export const WHEN_ORDER = ["TODAY", "UPCOMING", "SOMEDAY"] as const;

export function cycle(value: string, order: readonly string[], step: 1 | -1): string {
  const idx = order.indexOf(value);
  if (idx === -1) return order[0] as string;
  const next = (idx + step + order.length) % order.length;
  return order[next] as string;
}

export function dueLabelFor(t: {
  status: string;
  scheduledDate: string | null;
}): string | null {
  return t.status === "TODAY"
    ? "due today"
    : t.scheduledDate
      ? `due ${formatWhen(t.scheduledDate)}`
      : null;
}
