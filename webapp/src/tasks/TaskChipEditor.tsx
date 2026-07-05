import { useEffect, useRef, useState, type ReactNode } from "react";
import { PickerSheet } from "../components/ui";
import { TaskChevronIcon } from "./TaskChipIcons";
import "./TaskChipEditor.css";

/* ------------------------------------------------------------------
 * TaskChipEditor — the chip row on the task detail page.
 *
 * Each chip IS the editor for one property. Click a chip → a small popover
 * opens anchored to that chip with just that property's options. Pick one →
 * writes instantly via updateTaskDetails (live edit). Title + notes stay on
 * the page's Save footer (buffered prose).
 *
 * Closed state: a row of pills, color-coded by meaning (teal = when/today,
 * amber = important, violet = project, muted = normal/size). Unset properties
 * (Due, Goal) collapse into quiet "+ Due" / "+ Goal" dashed chips.
 *
 * The popover is anchored under its chip via CSS absolute positioning. Only
 * one popover is open at a time (the `openKey` controls which). Outside-click
 * and Escape close it.
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

interface TaskChipEditorProps {
  task: TaskChipState;
  /** Lens projects for the project picker (data-driven → bottom sheet). */
  projects: TaskChipPickerItem[];
  /** Lens goals for the goal picker (data-driven → bottom sheet). */
  goals: TaskChipPickerItem[];
  /** Whether the task is done — done tasks render static chips (no editors). */
  readOnly?: boolean;
  /** Live-save a single structural field. Called on every chip pick. */
  onChange: (patch: Omit<Partial<TaskChipState>, "project" | "goal" | "dueDate"> & {
    projectId?: string | null;
    goalId?: string | null;
    dueDate?: Date | null;
  }) => void;
}

type OpenKey =
  | "when"
  | "priority"
  | "size"
  | "due"
  | "project"
  | "goal"
  | "add"
  | null;

const WHEN_OPTS: { value: TaskStatus; label: string; hint: string }[] = [
  { value: "TODAY", label: "Today", hint: "on the table now" },
  { value: "UPCOMING", label: "Upcoming", hint: "the bench" },
  { value: "SOMEDAY", label: "Someday", hint: "maybe later" },
];
const PRIORITY_OPTS: { value: TaskPriority; label: string; hint: string }[] = [
  { value: "LOW", label: "Low", hint: "when you can" },
  { value: "NORMAL", label: "Normal", hint: "default" },
  { value: "IMPORTANT", label: "Important", hint: "today matters" },
];
const SIZE_OPTS: { value: TaskSize; label: string; hint: string }[] = [
  { value: "S", label: "S", hint: "15 min" },
  { value: "M", label: "M", hint: "30 min" },
  { value: "L", label: "L", hint: "1 hr" },
  { value: "XL", label: "XL", hint: "2 hr+" },
];
const DUE_OPTS: { value: string; label: string }[] = [
  { value: "none", label: "No due date" },
  { value: "this-week", label: "This week" },
  { value: "next-week", label: "Next week" },
  { value: "next-month", label: "Next month" },
];

/** Coarse due-presets → Date. Mirrors triage's DUE_OPTS semantics. */
function presetToDate(preset: string): Date | null {
  if (preset === "none") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (preset === "this-week") {
    // End of the current week (Sunday).
    const day = d.getDay(); // 0=Sun..6=Sat
    const daysToSunday = (7 - day) % 7;
    d.setDate(d.getDate() + daysToSunday);
    return d;
  }
  if (preset === "next-week") {
    const day = d.getDay();
    d.setDate(d.getDate() + 7 - day + 1); // next Monday
    return d;
  }
  if (preset === "next-month") {
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  return null;
}

/** Format the current dueDate for the chip label. */
function dueLabel(dueDate: Date | string | null): string | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - now.getTime()) / 86_400_000,
  );
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7)
    return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Pick the coarse-preset that best matches an existing dueDate. */
function duePreset(dueDate: Date | string | null): string {
  if (!dueDate) return "none";
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return "none";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - now.getTime()) / 86_400_000,
  );
  if (diffDays <= 0) return "this-week";
  if (diffDays <= 7) return "this-week";
  if (diffDays <= 14) return "next-week";
  return "next-month";
}

export function TaskChipEditor({
  task,
  projects,
  goals,
  readOnly = false,
  onChange,
}: TaskChipEditorProps) {
  const [openKey, setOpenKey] = useState<OpenKey>(null);
  // PickerSheet (bottom sheet) for project/goal — separate from inline popovers
  // because the lists are data-driven and unbounded.
  const [sheetTarget, setSheetTarget] = useState<"project" | "goal" | null>(
    null,
  );
  const rowRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside-click or Escape.
  useEffect(() => {
    if (!openKey || readOnly) return;
    const onPointer = (e: PointerEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setOpenKey(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKey, readOnly]);

  const toggle = (key: OpenKey) => setOpenKey((cur) => (cur === key ? null : key));

  // Done-task state: render static pills, no editors.
  if (readOnly) {
    return (
      <div className="aa-task-chips" ref={rowRef}>
        <span className="aa-task-chip aa-task-chip--today aa-task-chip--static">
          {task.status.toLowerCase()}
        </span>
        <span
          className={`aa-task-chip aa-task-chip--${task.priority === "IMPORTANT" ? "important" : "normal"} aa-task-chip--static`}
        >
          {task.priority === "IMPORTANT" ? "Important" : "Normal"}
        </span>
        <span className="aa-task-chip aa-task-chip--size aa-task-chip--static">
          {task.size}
        </span>
        {task.project && (
          <span className="aa-task-chip aa-task-chip--project aa-task-chip--static">
            {task.project.name}
          </span>
        )}
        {!task.project && task.goal && (
          <span className="aa-task-chip aa-task-chip--project aa-task-chip--static">
            {task.goal.name}
          </span>
        )}
      </div>
    );
  }

  const dueLabelNow = dueLabel(task.dueDate);
  // A goal chip is only meaningful when there's no project (one-parent rule:
  // a project carries the goal).
  const showGoalChip = !task.project;

  return (
    <>
      <div className="aa-task-chips" ref={rowRef}>
        {/* WHEN — teal, system/state */}
        <ChipButton
          variant="when"
          active={task.status === "TODAY"}
          open={openKey === "when"}
          onClick={() => toggle("when")}
          popover={
            openKey === "when" ? (
              <Popover title="When">
                {WHEN_OPTS.map((opt) => (
                  <PopoverOption
                    key={opt.value}
                    active={task.status === opt.value}
                    onClick={() => {
                      onChange({ status: opt.value });
                      setOpenKey(null);
                    }}
                  >
                    {opt.label}
                    <PopoverHint>{opt.hint}</PopoverHint>
                  </PopoverOption>
                ))}
              </Popover>
            ) : null
          }
        >
          {task.status === "TODAY" ? "Today" : task.status === "UPCOMING" ? "Upcoming" : "Someday"}
          <TaskChevronIcon />
        </ChipButton>

        {/* PRIORITY */}
        <ChipButton
          variant={task.priority === "IMPORTANT" ? "important" : "normal"}
          open={openKey === "priority"}
          onClick={() => toggle("priority")}
          popover={
            openKey === "priority" ? (
              <Popover title="Priority">
                {PRIORITY_OPTS.map((opt) => (
                  <PopoverOption
                    key={opt.value}
                    active={task.priority === opt.value}
                    onClick={() => {
                      onChange({ priority: opt.value });
                      setOpenKey(null);
                    }}
                  >
                    {opt.label}
                    <PopoverHint>{opt.hint}</PopoverHint>
                  </PopoverOption>
                ))}
              </Popover>
            ) : null
          }
        >
          {task.priority === "IMPORTANT" ? "Important" : task.priority === "NORMAL" ? "Normal" : "Low"}
          <TaskChevronIcon />
        </ChipButton>

        {/* SIZE */}
        <ChipButton
          variant="size"
          open={openKey === "size"}
          onClick={() => toggle("size")}
          popover={
            openKey === "size" ? (
              <Popover title="Size">
                {SIZE_OPTS.map((opt) => (
                  <PopoverOption
                    key={opt.value}
                    active={task.size === opt.value}
                    onClick={() => {
                      onChange({ size: opt.value });
                      setOpenKey(null);
                    }}
                  >
                    {opt.label}
                    <PopoverHint>{opt.hint}</PopoverHint>
                  </PopoverOption>
                ))}
              </Popover>
            ) : null
          }
        >
          {task.size}
          <TaskChevronIcon />
        </ChipButton>

        {/* PROJECT — picker-backed (data-driven → bottom sheet) */}
        <ChipButton
          variant="project"
          open={sheetTarget === "project"}
          onClick={() => {
            setOpenKey(null);
            setSheetTarget("project");
          }}
        >
          {task.project ? task.project.name : "No project"}
          <TaskChevronIcon />
        </ChipButton>

        {/* DUE — preset popover. Quiet "+ Due" when unset. */}
        {dueLabelNow ? (
          <ChipButton
            variant="when"
            open={openKey === "due"}
            onClick={() => toggle("due")}
            popover={
              openKey === "due" ? (
                <Popover title="Due">
                  {DUE_OPTS.map((opt) => (
                    <PopoverOption
                      key={opt.value}
                      active={duePreset(task.dueDate) === opt.value}
                      onClick={() => {
                        onChange({ dueDate: presetToDate(opt.value) });
                        setOpenKey(null);
                      }}
                    >
                      {opt.label}
                    </PopoverOption>
                  ))}
                </Popover>
              ) : null
            }
          >
            {dueLabelNow}
            <TaskChevronIcon />
          </ChipButton>
        ) : (
          <span className="aa-task-chip-slot">
            <button
              type="button"
              className="aa-task-chip aa-task-chip--add"
              aria-expanded={openKey === "due"}
              onClick={(e) => {
                e.stopPropagation();
                toggle("due");
              }}
            >
              + Due
            </button>
            {openKey === "due" && (
              <Popover title="Due">
                {DUE_OPTS.filter((o) => o.value !== "none").map((opt) => (
                  <PopoverOption
                    key={opt.value}
                    active={false}
                    onClick={() => {
                      onChange({ dueDate: presetToDate(opt.value) });
                      setOpenKey(null);
                    }}
                  >
                    {opt.label}
                  </PopoverOption>
                ))}
              </Popover>
            )}
          </span>
        )}

        {/* GOAL — picker-backed. Only when no project (one-parent rule). */}
        {showGoalChip &&
          (task.goal ? (
            <ChipButton
              variant="project"
              open={sheetTarget === "goal"}
              onClick={() => {
                setOpenKey(null);
                setSheetTarget("goal");
              }}
            >
              {task.goal.name}
              <TaskChevronIcon />
            </ChipButton>
          ) : (
            <button
              type="button"
              className="aa-task-chip aa-task-chip--add"
              onClick={() => {
                setOpenKey(null);
                setSheetTarget("goal");
              }}
            >
              + Goal
            </button>
          ))}
      </div>

      {/* Bottom-sheet pickers for the data-driven lists. */}
      {sheetTarget === "project" && (
        <PickerSheet
          title="Project"
          items={[
            { id: "__none__", label: "No project", current: !task.project },
            ...projects.map((p) => ({
              id: p.id,
              label: p.label,
              meta: p.meta,
              current: task.project?.id === p.id,
            })),
          ]}
          onPick={(id) => {
            onChange({ projectId: id === "__none__" ? null : id });
            setSheetTarget(null);
          }}
          onClose={() => setSheetTarget(null)}
        />
      )}
      {sheetTarget === "goal" && (
        <PickerSheet
          title="Goal"
          items={[
            { id: "__none__", label: "No goal", current: !task.goal },
            ...goals.map((g) => ({
              id: g.id,
              label: g.label,
              meta: g.meta,
              current: task.goal?.id === g.id,
            })),
          ]}
          onPick={(id) => {
            onChange({ goalId: id === "__none__" ? null : id });
            setSheetTarget(null);
          }}
          onClose={() => setSheetTarget(null)}
        />
      )}
    </>
  );
}

/* ---- Sub-components (file-local) ---- */

type ChipVariant =
  | "when"
  | "today"
  | "important"
  | "normal"
  | "size"
  | "project";

function ChipButton({
  variant,
  active,
  open,
  onClick,
  children,
  popover,
}: {
  variant: ChipVariant;
  active?: boolean;
  open?: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Optional popover rendered as a SIBLING (not a child) of the chip button —
      avoids invalid <button>-in-<button> nesting. Both sit in a positioning span. */
  popover?: ReactNode;
}) {
  return (
    <span className="aa-task-chip-slot">
      <button
        type="button"
        className={[
          "aa-task-chip",
          `aa-task-chip--${variant}`,
          active ? "is-active" : "",
          open ? "is-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {children}
      </button>
      {popover}
    </span>
  );
}

function Popover({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="aa-task-chip-popover" onClick={(e) => e.stopPropagation()}>
      <div className="aa-task-chip-popover__title">{title}</div>
      {children}
    </div>
  );
}

function PopoverOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`aa-task-chip-opt ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>{children}</span>
      <svg
        className="aa-task-chip-check"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function PopoverHint({ children }: { children: ReactNode }) {
  return <span className="aa-task-chip-opt-hint">{children}</span>;
}
