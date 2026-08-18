import type { TriageChip, TriageExit } from "../components/ui";
import type { ParsedPriority, ParsedSize } from "./parseCapture";
import { formatRelativeDay } from "../shared/dateFormat";

export type Outcome =
  | "task-today"
  | "upcoming"
  | "someday"
  | "project"
  | "resource"
  | "list-item"
  | "delete";
export type ChosenType =
  "task" | "project" | "resource" | "list-item" | "delete";
export type Step = "classify" | "spec";

export const OUTCOME_EXIT = {
  "task-today": "right",
  upcoming: "right",
  someday: "left",
  project: "up",
  resource: "left",
  "list-item": "right",
  delete: "down",
} as const satisfies Record<Outcome, TriageExit>;

export const WHEN_OPTS = ["Today", "Upcoming", "Someday"] as const;
export const SIZE_OPTS: ParsedSize[] = ["S", "M", "L", "XL"];
export const PRIORITY_OPTS: ParsedPriority[] = ["LOW", "NORMAL", "IMPORTANT"];
export const KIND_OPTS = ["Link", "Note"] as const;
export const DUE_OPTS = ["—", "This week", "Next week", "Next month"] as const;

export interface Working {
  type: ChosenType;
  title: string;
  when: (typeof WHEN_OPTS)[number];
  size: ParsedSize;
  priority: ParsedPriority;
  content: string;
  projectId: string | null;
  projectGoalId: string | null;
  due: (typeof DUE_OPTS)[number];
  parentProjectId: string | null;
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
  if (item.parsedDate)
    chips.push({
      tone: "date",
      label: `📅 ${formatRelativeDay(item.parsedDate)}`,
    });
  if (item.parsedLens)
    chips.push({ tone: "tag", label: `[[${item.parsedLens}]]` });
  if (item.parsedProject)
    chips.push({ tone: "tag", label: `▣ ${item.parsedProject}` });
  if (item.parsedPriority === "IMPORTANT")
    chips.push({ tone: "priority", label: "★ Important" });
  if (item.parsedPriority === "LOW")
    chips.push({ tone: "priority", label: "low" });
  if (item.parsedSize) chips.push({ tone: "tag", label: item.parsedSize });
  for (const tag of item.parsedTags) chips.push({ tone: "tag", label: tag });
  return chips;
}

function buildOutcome(w: Working): Outcome {
  if (w.type === "delete") return "delete";
  if (w.type === "project") return "project";
  if (w.type === "resource") return "resource";
  if (w.type === "list-item") return "list-item";
  return w.when === "Today"
    ? "task-today"
    : w.when === "Upcoming"
      ? "upcoming"
      : "someday";
}

/**
 * Build the `triageInboxItem` args payload from a working spec + resolved
 * context. Centralizes the per-type field selection (projectId vs goalId,
 * which optional fields apply) so the component's dispatch handler stays
 * focused on the call + invalidation orchestration.
 *
 *   - task:     projectId (manual pick > resolved #token), priority, size, content
 *   - project:  goalId (the goal it supports)
 *   - resource: projectId (its required project home)
 *
 * `resolvedProjectId` is the capture-resolved project for the task path only;
 * it's the fallback when the user didn't pick one manually in the spec step.
 */
/** The triageInboxItem args payload a dispatch builds (the named owner
 *  contract for TriagePage's dispatch call). */
export interface DispatchPayload {
  inboxItemId: string;
  decision: Outcome;
  lensId: string;
  name?: string;
  projectId?: string;
  goalId?: string;
  priority?: ParsedPriority;
  size?: ParsedSize;
  content?: string;
}

export function buildDispatchPayload(
  w: Working,
  ctx: {
    inboxItemId: string;
    lensId: string;
    resolvedProjectId?: string | null;
    listProjectId?: string | null;
  },
): DispatchPayload {
  const outcome = buildOutcome(w);
  const base: DispatchPayload = {
    inboxItemId: ctx.inboxItemId,
    decision: outcome,
    lensId: ctx.lensId,
  };
  const name = w.title.trim();
  if (w.type === "task") {
    return {
      ...base,
      name,
      projectId: w.projectId ?? ctx.resolvedProjectId ?? undefined,
      priority: w.priority,
      size: w.size,
      content: w.content.trim(),
    };
  }
  if (w.type === "project") {
    return { ...base, name, goalId: w.projectGoalId ?? undefined };
  }
  if (w.type === "resource") {
    return {
      ...base,
      name,
      projectId: w.parentProjectId ?? undefined,
    };
  }
  if (w.type === "list-item") {
    // The destination is the chosen Simple-list Project; the lens rides
    // along for API symmetry but the server files by projectId.
    return { ...base, name, projectId: ctx.listProjectId ?? undefined };
  }
  // Delete only needs the base — it does not file anything into a lens.
  return base;
}

export function canComplete(
  w: Working | null,
  chosenLensId: string | null,
  listProjectId?: string | null,
): boolean {
  if (!w || !w.title.trim()) return false;
  if (w.type === "list-item") return !!listProjectId;
  if (!chosenLensId) return false;
  if (w.type === "resource") return !!w.parentProjectId;
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
  if (w.type === "list-item") return "→ add to simple list";
  return `→ ${w.kind} filed under ${parentName ?? "—"}`;
}

export function formatPriority(priority: ParsedPriority): string {
  if (priority === "LOW") return "Low";
  if (priority === "IMPORTANT") return "Important";
  return "Normal";
}
