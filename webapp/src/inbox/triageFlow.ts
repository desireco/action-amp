import type { TriageChip, TriageExit } from "../components/ui";
import type { ParsedPriority, ParsedSize } from "./parseCapture";

export type Outcome = "task-today" | "upcoming" | "someday" | "project" | "resource" | "archive";
export type ChosenType = "task" | "project" | "resource" | "archive";
export type Step = "classify" | "spec";

export const OUTCOME_EXIT: Record<Outcome, TriageExit> = {
  "task-today": "right",
  upcoming: "right",
  someday: "left",
  project: "up",
  resource: "left",
  archive: "down",
};

export const WHEN_OPTS = ["Today", "Upcoming", "Someday"] as const;
export const SIZE_OPTS: ParsedSize[] = ["S", "M", "L", "XL"];
export const PRIORITY_OPTS: ParsedPriority[] = ["LOW", "NORMAL", "IMPORTANT"];
export const KIND_OPTS = ["Link", "Note"] as const;
export const DUE_OPTS = ["—", "This week", "Next week", "Next month"] as const;

export interface Working {
  type: ChosenType;
  when: (typeof WHEN_OPTS)[number];
  size: ParsedSize;
  priority: ParsedPriority;
  content: string;
  projectId: string | null;
  projectGoalId: string | null;
  due: (typeof DUE_OPTS)[number];
  parentProjectId: string | null;
  parentGoalId: string | null;
  kind: (typeof KIND_OPTS)[number];
}

interface ParsedChipSource {
  parsedDate: Date | string | null;
  parsedLens: string | null;
  parsedProject: string | null;
  parsedPriority: ParsedPriority | string | null;
  parsedSize: ParsedSize | string | null;
  parsedTags: string[];
}

export function buildTriageChips(item: ParsedChipSource | null): TriageChip[] {
  if (!item) return [];
  const chips: TriageChip[] = [];
  if (item.parsedDate) chips.push({ tone: "date", label: `📅 ${formatChipDate(item.parsedDate)}` });
  if (item.parsedLens) chips.push({ tone: "tag", label: `[[${item.parsedLens}]]` });
  if (item.parsedProject) chips.push({ tone: "tag", label: `▣ ${item.parsedProject}` });
  if (item.parsedPriority === "IMPORTANT") chips.push({ tone: "priority", label: "★ Important" });
  if (item.parsedPriority === "LOW") chips.push({ tone: "priority", label: "low" });
  if (item.parsedSize) chips.push({ tone: "tag", label: item.parsedSize });
  for (const tag of item.parsedTags) chips.push({ tone: "tag", label: tag });
  return chips;
}

export function buildOutcome(w: Working): Outcome {
  if (w.type === "archive") return "archive";
  if (w.type === "project") return "project";
  if (w.type === "resource") return "resource";
  return w.when === "Today" ? "task-today" : w.when === "Upcoming" ? "upcoming" : "someday";
}

export function canComplete(w: Working | null, chosenLensId: string | null): boolean {
  if (!w || !chosenLensId) return false;
  if (w.type === "resource") return !!w.parentProjectId || !!w.parentGoalId;
  return true;
}

export function summaryFor(
  w: Working,
  projectName: string,
  goalName: string | null,
  parentName: string | null,
): string {
  if (w.type === "task") {
    return `→ ${w.when} · ${w.size} · ${formatPriority(w.priority)} · in ${projectName}`;
  }
  if (w.type === "project") {
    const goalBit = w.projectGoalId ? ` · supports ${goalName}` : "";
    return `→ new Project${goalBit}`;
  }
  return `→ ${w.kind} filed under ${parentName ?? "—"}`;
}

export function formatPriority(priority: ParsedPriority): string {
  if (priority === "LOW") return "Low";
  if (priority === "IMPORTANT") return "Important";
  return "Normal";
}

export function formatAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export function formatChipDate(date: Date | string): string {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isSameDay(a: Date | string, b: Date): boolean {
  const left = new Date(a);
  return (
    left.getFullYear() === b.getFullYear() &&
    left.getMonth() === b.getMonth() &&
    left.getDate() === b.getDate()
  );
}
