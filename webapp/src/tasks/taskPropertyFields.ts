import type { PropertyField, PropertyOption } from "../components/ui";
import {
  calendarDayDifference,
  currentPlainDate,
  instantFrom,
  instantToPlainDate,
  plainDateFromValue,
  plainDateToDb,
  systemTimeZone,
} from "../shared/time/temporal";

/* ------------------------------------------------------------------
 * taskPropertyFields — build the PropertyChips field config for a task.
 *
 * Boundary normalization: the Task model speaks uppercase enums (TODAY,
 * IMPORTANT, L, etc.) while PropertyChips speaks string values. This helper
 * maps between them, producing the config the chip editor consumes.
 * ------------------------------------------------------------------ */

export type TaskStatus = "TODAY" | "UPCOMING" | "SOMEDAY";
export type TaskPriority = "LOW" | "NORMAL" | "IMPORTANT";
export type TaskSize = "S" | "M" | "L" | "XL";

export interface TaskChipProject {
  id: string;
  permalink?: string | null;
  name: string;
}
export interface TaskChipGoal {
  id: string;
  permalink?: string | null;
  name: string;
}

export interface TaskChipState {
  status: TaskStatus;
  priority: TaskPriority;
  size: TaskSize;
  scheduledDate: Date | string | null;
  project: TaskChipProject | null;
  goal: TaskChipGoal | null;
}

export interface TaskChipPickerItem {
  id: string;
  label: string;
  meta?: string | null;
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

/** Scheduling presets resolve to a concrete local calendar day. */
export function presetToScheduledDate(preset: string, now = new Date()): Date | null {
  if (preset === "none") return null;
  const today = instantToPlainDate(instantFrom(now), systemTimeZone());
  if (preset === "today") return plainDateToDb(today);
  if (preset === "tomorrow") return plainDateToDb(today.add({ days: 1 }));

  const weekday = Number(preset.replace("weekday-", ""));
  if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) {
    const targetDay = weekday === 0 ? 7 : weekday;
    const daysAhead = (targetDay - today.dayOfWeek + 7) % 7;
    return plainDateToDb(today.add({ days: daysAhead }));
  }

  if (preset === "next-week") {
    return plainDateToDb(today.add({ days: 8 - today.dayOfWeek }));
  }
  if (preset === "next-month") {
    return plainDateToDb(today.add({ months: 1 }));
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

function dueLabel(scheduledDate: Date | string | null): string | null {
  if (!scheduledDate) return null;
  const target = plainDateFromValue(scheduledDate);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7)
    return target.toLocaleString(undefined, { weekday: "short" });
  return target.toLocaleString(undefined, { month: "short", day: "numeric" });
}

function duePreset(scheduledDate: Date | string | null): string {
  if (!scheduledDate) return "none";
  const target = plainDateFromValue(scheduledDate);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays >= 0 && diffDays <= 6)
    return `weekday-${target.dayOfWeek === 7 ? 0 : target.dayOfWeek}`;
  if (diffDays >= 7 && diffDays <= 13) return "next-week";
  return "next-month";
}

const PRIORITY_LABEL = {
  LOW: "Low",
  NORMAL: "Normal",
  IMPORTANT: "Important",
} as const satisfies Record<TaskPriority, string>;
const WHEN_LABEL = {
  TODAY: "Today",
  UPCOMING: "Upcoming",
  SOMEDAY: "Someday",
} as const satisfies Record<TaskStatus, string>;

export interface TaskPropertyArgs {
  task: TaskChipState;
  projects: TaskChipPickerItem[];
  goals: TaskChipPickerItem[];
}

/** Build the chip field config for the task page. */
export function taskPropertyFields({
  task,
  projects,
  goals,
}: TaskPropertyArgs): PropertyField[] {
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

  // Due — preset popover, or quiet "+ Due" when unset.
  const dueLabelNow = dueLabel(task.scheduledDate);
  if (dueLabelNow) {
    fields.push({
      key: "due",
      variant: "due",
      value: duePreset(task.scheduledDate),
      displayValue: dueLabelNow,
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

/** The updateTaskDetails patch a PropertyChips pick produces. */
export interface TaskChipPatch {
  status?: TaskStatus;
  priority?: TaskPriority;
  size?: TaskSize;
  scheduledDate?: Date | null;
}

const TASK_STATUSES = new Set<string>(["TODAY", "UPCOMING", "SOMEDAY"]);
const TASK_PRIORITIES = new Set<string>(["LOW", "NORMAL", "IMPORTANT"]);
const TASK_SIZES = new Set<string>(["S", "M", "L", "XL"]);

function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.has(value);
}

function isTaskPriority(value: string): value is TaskPriority {
  return TASK_PRIORITIES.has(value);
}

function isTaskSize(value: string): value is TaskSize {
  return TASK_SIZES.has(value);
}

/**
 * Translate a PropertyChips onPick field+value into an updateTaskDetails patch.
 * The chip editor speaks string values; this maps them back to the task enums
 * / Date the op expects — validating each value at the boundary (an invalid
 * pick is dropped, {} — the old cast-through let bogus enums reach the op).
 * TaskDetailPage promotes a Someday task to Upcoming when it applies a
 * concrete schedule.
 */
export function chipPickToTaskPatch(
  fieldKey: string,
  value: string,
): TaskChipPatch {
  switch (fieldKey) {
    case "status":
      return isTaskStatus(value) ? { status: value } : {};
    case "priority":
      return isTaskPriority(value) ? { priority: value } : {};
    case "size":
      return isTaskSize(value) ? { size: value } : {};
    case "due":
      return { scheduledDate: presetToScheduledDate(value) };
    default:
      return {};
  }
}
