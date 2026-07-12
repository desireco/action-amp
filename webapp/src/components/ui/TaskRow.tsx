import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Chip } from "./Chip";
import { formatDueChip } from "../../shared/dateFormat";
import "./TaskRow.css";

export interface TaskRowTask {
  id: string;
  permalink?: string | null;
  description: string;
  content?: string | null;
  isDone?: boolean;
  priority?: "LOW" | "NORMAL" | "IMPORTANT";
  size?: "S" | "M" | "L" | "XL";
  status?: "TODAY" | "UPCOMING" | "SOMEDAY";
  dueDate?: Date | string | null;
  project?: { id: string; name: string } | null;
  goal?: { id: string; name: string } | null;
}

interface TaskRowProps {
  task: TaskRowTask;
  as?: "li" | "div";
  variant?: "plain" | "surface" | "list";
  /** Lighter visual weight (for Someday / Done) */
  muted?: boolean;
  /** Run the row's primary click action. */
  onOpen?: (task: TaskRowTask) => void;
  /** Whether a row-click action menu is currently expanded. */
  expanded?: boolean;
  className?: string;
  /** Right-aligned action slot — promote, Edit, Move, etc. Hover-revealed. */
  children?: ReactNode;
}

/**
 * Builds the click/keyboard/a11y props for a clickable region (the root row or
 * its main area). Centralized so the same logic doesn't get re-derived in two
 * places — both regions toggle on click + Enter, and expose role/tabIndex only
 * when interactive.
 */
function clickableProps(
  active: boolean,
  onActivate: () => void,
): {
  onClick?: (e: MouseEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  role?: "button";
  tabIndex?: number;
} {
  if (!active) return {};
  return {
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter") onActivate();
    },
    role: "button",
    tabIndex: 0,
  };
}

/** Status → leading dot class. Done renders a filled checkmark. */
function dotClassFor(task: TaskRowTask): string | null {
  if (task.isDone) return "aa-task-row__dot--done";
  switch (task.status) {
    case "TODAY":
      return "aa-task-row__dot--today";
    case "UPCOMING":
      return "aa-task-row__dot--upcoming";
    case "SOMEDAY":
      return "aa-task-row__dot--someday";
    default:
      return null;
  }
}

/**
 * TaskRow — the universal task list row (variant: HoverCompact). Title leads,
 * meta chips wrap below; status is a leading dot; actions hover-reveal on the
 * right (always shown on touch).
 *
 * Used by Today, Upcoming, Someday, and Project. There is no completion control
 * here — completing a task happens in focus mode, not by ticking a row. A done
 * task reads as such via the `--done` class (struck through, muted), driven by
 * `task.isDone`. Notes/content are not edited here — the Edit affordance opens
 * the task detail page where the full chip-popover editor lives.
 */
export function TaskRow({
  task,
  as: Element = "li",
  variant = "plain",
  muted = false,
  onOpen,
  expanded = false,
  className = "",
  children,
}: TaskRowProps) {
  const done = task.isDone ?? false;
  const hasChildren = Boolean(children);
  const clickableOnRoot = Boolean(onOpen && !hasChildren);
  const mainClickable = Boolean(onOpen && hasChildren);
  const openTask = () => onOpen?.(task);

  const dotClass = dotClassFor(task);
  const due = task.dueDate ? formatDueChip(task.dueDate) : null;
  const hasMeta =
    task.priority === "IMPORTANT" ||
    Boolean(task.project) ||
    Boolean(due) ||
    Boolean(task.size);

  const rootClass = [
    "aa-task-row",
    variant === "surface" ? "aa-task-row--surface" : "",
    variant === "list" ? "aa-task-row--list" : "",
    done ? "aa-task-row--done" : "",
    muted ? "aa-task-row--muted" : "",
    clickableOnRoot ? "aa-task-row--clickable" : "",
    onOpen && hasChildren ? "aa-task-row--split" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const mainClass = [
    "aa-task-row__main",
    mainClickable ? "aa-task-row__main--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Element
      className={rootClass}
      {...clickableProps(clickableOnRoot, openTask)}
    >
      {dotClass && (
        <span
          className={`aa-task-row__dot ${dotClass}`}
          aria-hidden="true"
          // Done-dot carries a checkmark glyph; status dots are purely visual.
        >
          {done ? "✓" : ""}
        </span>
      )}
      <div
        className={mainClass}
        {...clickableProps(mainClickable, openTask)}
        aria-expanded={mainClickable ? expanded : undefined}
      >
        <span className="aa-task-row__title">{task.description}</span>
        {hasMeta && (
          <div className="aa-task-row__meta">
            {task.priority === "IMPORTANT" && (
              <Chip variant="amber" small>
                ★
              </Chip>
            )}
            {task.project && (
              <Chip variant="violet" small>
                {task.project.name}
              </Chip>
            )}
            {due && (
              <Chip variant={due.overdue ? "rose" : "teal"} small>
                {due.label}
              </Chip>
            )}
            {task.size && (
              <Chip variant="muted" small className="aa-task-row__size-chip">
                {task.size}
              </Chip>
            )}
          </div>
        )}
      </div>
      {hasChildren && (
        <div className="aa-task-row__actions">{children}</div>
      )}
    </Element>
  );
}
