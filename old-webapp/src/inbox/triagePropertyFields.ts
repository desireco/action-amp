import type { PropertyField, PropertyPickerItem } from "../components/ui";
import {
  DUE_OPTS,
  KIND_OPTS,
  PRIORITY_OPTS,
  SIZE_OPTS,
  WHEN_OPTS,
  formatPriority,
  type Working,
} from "./triageFlow";

/* ------------------------------------------------------------------
 * triagePropertyFields — build the PropertyChips field config for triage.
 *
 * Triage's Working draft uses string enums (`when: "Today"`, `priority:
 * "LOW"`, `size: "S"`, `due: "—"`, `kind: "Link"`). PropertyChips speaks
 * string values too, so most fields plug in directly. Project/Goal/resource
 * fields are `externalPicker` — triage keeps its own PickerSheets because
 * they have rich semantics (custom titles with item text, switch-project↔
 * goal action rows) that don't fit PropertyChips' built-in sheet.
 * ------------------------------------------------------------------ */

export interface TriagePropertyArgs {
  working: Working;
  projectName: string | null;
  projectGoalName: string | null;
  parentName: string | null;
  /** True when project "General" is the implicit default, not an explicit pick. */
  projectIsDefault: boolean;
}

/** When/Size/Priority/Project fields for a Task spec. */
export function taskFields({
  working,
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
      options: PRIORITY_OPTS.map((o) => ({
        value: o,
        label: formatPriority(o),
      })),
    },
    {
      key: "project",
      variant: "project",
      value: working.projectId,
      displayValue: projectName ?? "General",
      unset: projectIsDefault,
      addLabel: "Project",
      externalPicker: true,
    },
  ];
}

/** Supports-goal + Due fields for a Project spec. */
export function projectFields({
  working,
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
      externalPicker: true,
    },
    {
      key: "due",
      variant: "due",
      value: working.due,
      displayValue: working.due === "—" ? "No due date" : working.due,
      unset: working.due === "—",
      addLabel: "Due",
      options: DUE_OPTS.filter((o) => o !== "—").map((o) => ({
        value: o,
        label: o,
      })),
    },
  ];
}

/** Required Project + Kind fields for a Resource/Note spec. */
export function resourceFields({
  working,
  parentName,
}: TriagePropertyArgs): PropertyField[] {
  return [
    {
      key: "parent",
      variant: "parent",
      value: working.parentProjectId,
      displayValue: parentName ?? "Pick project…",
      unset: !working.parentProjectId,
      addLabel: "Project",
      externalPicker: true,
    },
    {
      key: "kind",
      variant: "kind",
      value: working.kind,
      displayValue: working.kind,
      options: KIND_OPTS.map((o) => ({ value: o, label: o })),
    },
  ];
}

/** Map a PropertyChips onPick to a Working patch. */
export function chipPickToWorkingPatch(
  fieldKey: string,
  value: string,
): Partial<Working> {
  switch (fieldKey) {
    case "when":
      // SAFETY: type assertion is safe — value is validated or from a trusted source.
      return { when: value as Working["when"] };
    case "size":
      // SAFETY: type assertion is safe — value is validated or from a trusted source.
      return { size: value as Working["size"] };
    case "priority":
      // SAFETY: type assertion is safe — value is validated or from a trusted source.
      return { priority: value as Working["priority"] };
    case "due":
      // SAFETY: type assertion is safe — value is validated or from a trusted source.
      return { due: value as Working["due"] };
    case "kind":
      // SAFETY: type assertion is safe — value is validated or from a trusted source.
      return { kind: value as Working["kind"] };
    default:
      return {};
  }
}

/** Re-export for the page's picker-item mapping. */
export type { PropertyPickerItem };
