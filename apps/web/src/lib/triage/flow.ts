/**
 * Triage flow — ported from webapp/src/inbox/triageFlow.ts +
 * projectResolver.ts + triagePropertyFields.ts (S3). Pure client logic: the
 * Working draft, the outcome→exit map, payload building, completion gates,
 * summary strings, parsed-token chips, and the capture-resolver. Property
 * fields build on the shared PropertyField type (lib/taskView.ts) with
 * BUILT-IN pickers where webapp triage used external sheets — same
 * interaction (chip click → bottom sheet → pick), one editor component.
 */

import type { PropertyField, PropertyPickerItem } from "../taskView";
import { formatRelativeDay } from "../format/dates";

export type Outcome =
  | "task-today"
  | "upcoming"
  | "someday"
  | "project"
  | "resource"
  | "list-item"
  | "delete";
export type ChosenType = "task" | "project" | "resource" | "list-item" | "delete";
export type Step = "classify" | "spec";
export type TriageExit = "right" | "left" | "up" | "down" | null;

export const OUTCOME_EXIT: Record<Outcome, Exclude<TriageExit, null>> = {
  "task-today": "right",
  upcoming: "right",
  someday: "left",
  project: "up",
  resource: "left",
  "list-item": "right",
  delete: "down",
};

export const WHEN_OPTS = ["Today", "Upcoming", "Someday"] as const;
export const SIZE_OPTS = ["S", "M", "L", "XL"] as const;
export const PRIORITY_OPTS = ["LOW", "NORMAL", "IMPORTANT"] as const;
export const KIND_OPTS = ["Link", "Note"] as const;
export const DUE_OPTS = ["—", "This week", "Next week", "Next month"] as const;

export type ParsedPriority = "LOW" | "NORMAL" | "IMPORTANT";
export type ParsedSize = "S" | "M" | "L" | "XL";

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

export interface TriageChip {
  tone: "date" | "priority" | "tag";
  label: string;
}

interface ParsedChipSource {
  parsedScheduledDate: Date | string | null;
  parsedSnoozedUntil: Date | string | null;
  parsedLens: string | null;
  parsedProject: string | null;
  parsedPriority: ParsedPriority | string | null;
  parsedSize: ParsedSize | string | null;
  parsedTags: string[];
}

export function buildTriageChips(item: ParsedChipSource | null): TriageChip[] {
  if (!item) return [];
  const chips: TriageChip[] = [];
  if (item.parsedScheduledDate)
    chips.push({
      tone: "date",
      label: `📅 ${formatRelativeDay(item.parsedScheduledDate)}`,
    });
  if (item.parsedSnoozedUntil) chips.push({ tone: "date", label: "Snoozed" });
  if (item.parsedLens) chips.push({ tone: "tag", label: `[[${item.parsedLens}]]` });
  if (item.parsedProject) chips.push({ tone: "tag", label: `▣ ${item.parsedProject}` });
  if (item.parsedPriority === "IMPORTANT") chips.push({ tone: "priority", label: "★ Important" });
  if (item.parsedPriority === "LOW") chips.push({ tone: "priority", label: "low" });
  if (item.parsedSize) chips.push({ tone: "tag", label: item.parsedSize });
  for (const tag of item.parsedTags) chips.push({ tone: "tag", label: tag });
  return chips;
}

function buildOutcome(w: Working): Outcome {
  if (w.type === "delete") return "delete";
  if (w.type === "project") return "project";
  if (w.type === "resource") return "resource";
  if (w.type === "list-item") return "list-item";
  return w.when === "Today" ? "task-today" : w.when === "Upcoming" ? "upcoming" : "someday";
}

/** The triageInboxItem args payload a dispatch builds. */
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
    return { ...base, name, projectId: w.parentProjectId ?? undefined };
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

// ----------------------------------------------------------------
// Project resolver (webapp/src/inbox/projectResolver.ts — verbatim rules)
// ----------------------------------------------------------------

export type ProjectCandidate = {
  id: string;
  name: string;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function projectNamePattern(name: string): RegExp {
  return new RegExp(`(^|\\s)${escapeRegex(name)}(?=$|\\s|[.,!?;:])`, "i");
}

export function resolveProjectCandidate<T extends ProjectCandidate>(
  projects: readonly T[],
  item: { parsedProject?: string | null; text?: string | null },
): T | null {
  const hint = item.parsedProject?.trim();
  if (hint) {
    return projects.find((p) => p.name.toLowerCase() === hint.toLowerCase()) ?? null;
  }

  const text = item.text ?? "";
  if (!text.trim()) return null;

  const matches = projects.filter((p) => {
    const name = p.name.trim();
    if (!name) return false;
    return projectNamePattern(name).test(text);
  });
  if (matches.length === 0) return null;

  return [...matches].sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

// ----------------------------------------------------------------
// Property fields (webapp/src/inbox/triagePropertyFields.ts, adapted to the
// shared PropertyField: Project/Goal/Parent ride the BUILT-IN picker sheet
// instead of an external one — same chip → sheet → pick interaction).
// ----------------------------------------------------------------

export interface TriagePropertyArgs {
  working: Working;
  structuredProjects: ProjectCandidate[];
  goals: { id: string; name: string }[];
  projectName: string | null;
  projectGoalName: string | null;
  parentName: string | null;
  projectIsDefault: boolean;
}

function pickerItems(projects: ProjectCandidate[]): PropertyPickerItem[] {
  return projects.map((p) => ({ id: p.id, label: p.name }));
}

/** When/Size/Priority/Project fields for a Task spec. */
export function taskFields({
  working,
  structuredProjects,
  projectName,
  projectIsDefault,
}: TriagePropertyArgs): PropertyField[] {
  return [
    {
      key: "when",
      variant: "when",
      value: working.when,
      displayValue: working.when,
      options: WHEN_OPTS.map((o) => ({ value: o, label: o })),
    },
    {
      key: "size",
      variant: "size",
      value: working.size,
      displayValue: working.size,
      options: SIZE_OPTS.map((o) => ({ value: o, label: o })),
    },
    {
      key: "priority",
      variant: working.priority === "IMPORTANT" ? "important" : "normal",
      value: working.priority,
      displayValue: formatPriority(working.priority),
      options: PRIORITY_OPTS.map((o) => ({ value: o, label: formatPriority(o) })),
    },
    {
      key: "project",
      variant: "project",
      value: working.projectId,
      displayValue: projectName ?? "General",
      unset: projectIsDefault,
      addLabel: "Project",
      picker: { title: "File into project…", items: pickerItems(structuredProjects) },
    },
  ];
}

/** Supports-goal + Due fields for a Project spec. */
export function projectFields({
  working,
  goals,
  projectGoalName,
}: TriagePropertyArgs): PropertyField[] {
  return [
    {
      key: "goal",
      variant: "goal",
      value: working.projectGoalId,
      displayValue: projectGoalName ?? "—",
      unset: !working.projectGoalId,
      addLabel: "Goal",
      picker: {
        title: "Choose goal…",
        items: goals.map((g) => ({ id: g.id, label: g.name })),
      },
    },
    {
      key: "due",
      variant: "due",
      value: working.due,
      displayValue: working.due === "—" ? "No due date" : working.due,
      unset: working.due === "—",
      addLabel: "Due",
      options: DUE_OPTS.filter((o) => o !== "—").map((o) => ({ value: o, label: o })),
    },
  ];
}

/** Required Project + Kind fields for a Resource spec. */
export function resourceFields({
  working,
  structuredProjects,
  parentName,
}: TriagePropertyArgs): PropertyField[] {
  return [
    {
      key: "parent",
      variant: "project",
      value: working.parentProjectId,
      displayValue: parentName ?? "Pick project…",
      unset: !working.parentProjectId,
      addLabel: "Project",
      picker: {
        title: "File resource under a project…",
        items: pickerItems(structuredProjects),
      },
    },
    {
      key: "kind",
      variant: "due",
      value: working.kind,
      displayValue: working.kind,
      options: KIND_OPTS.map((o) => ({ value: o, label: o })),
    },
  ];
}

/** Map a PropertyChips onPick to a Working patch. */
export function chipPickToWorkingPatch(fieldKey: string, value: string): Partial<Working> {
  switch (fieldKey) {
    case "when":
      return { when: value as Working["when"] };
    case "size":
      return { size: value as Working["size"] };
    case "priority":
      return { priority: value as Working["priority"] };
    case "due":
      return { due: value as Working["due"] };
    case "kind":
      return { kind: value as Working["kind"] };
    default:
      return {};
  }
}
