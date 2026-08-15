import type { PropertyField, PropertyOption } from "../components/ui";

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
  dueDate: Date | string | null;
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
export function presetToDate(preset: string, now = new Date()): Date | null {
  if (preset === "none") return null;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (preset === "today") return d;
  if (preset === "tomorrow") {
    d.setDate(d.getDate() + 1);
    return d;
  }

  const weekday = Number(preset.replace("weekday-", ""));
  if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) {
    const daysAhead = (weekday - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + daysAhead);
    return d;
  }

  if (preset === "next-week") {
    d.setDate(d.getDate() + 7 - ((d.getDay() + 6) % 7));
    return d;
  }
  if (preset === "next-month") {
    d.setMonth(d.getMonth() + 1);
    return d;
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

function dueLabel(dueDate: Date | string | null): string | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7)
    return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function duePreset(dueDate: Date | string | null): string {
  if (!dueDate) return "none";
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return "none";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays >= 0 && diffDays <= 6) return `weekday-${target.getDay()}`;
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
};

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
  const dueLabelNow = dueLabel(task.dueDate);
  if (dueLabelNow) {
    fields.push({
      key: "due",
      variant: "due",
      value: duePreset(task.dueDate),
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

/**
 * Translate a PropertyChips onPick field+value into an updateTaskDetails patch.
 * The chip editor speaks string values; this maps them back to the task enums
 * / Date the op expects. TaskDetailPage promotes a Someday task to Upcoming
 * when it applies a concrete schedule.
 */
export function chipPickToTaskPatch(
  fieldKey: string,
  value: string,
): { status?: TaskStatus; priority?: TaskPriority; size?: TaskSize; dueDate?: Date | null } {
  switch (fieldKey) {
    case "status":
      return { status: value as TaskStatus };
    case "priority":
      return { priority: value as TaskPriority };
    case "size":
      return { size: value as TaskSize };
    case "due":
      return { dueDate: presetToDate(value) };
    default:
      return {};
  }
}
