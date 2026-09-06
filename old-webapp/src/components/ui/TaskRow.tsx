import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { TaskStatus } from "@prisma/client";
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
  // WONT_DO is included so a row can render in restore-from-logbook contexts;
  // active-list queries never produce it (positive status filters exclude it).
  status?: TaskStatus;
  scheduledDate?: Date | string | null;
  snoozedUntil?: Date | string | null;
  project?: { id: string; name: string } | null;
  goal?: { id: string; name: string } | null;
  /** Provenance lens — set by global Today so each row can show a lens pill. */
  lens?: { id: string; name: string; color: string | null } | null;
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
  /**
   * Render the leading lens pill. Opt-in (Today/Done-today turn it on when
   * the user has 2+ lenses); the lens-scoped lists pass nothing and stay as
   * they were.
   */
  showLens?: boolean;
  className?: string;
  /** Right-aligned action slot — promote, Edit, Move, etc. Hover-revealed. */
  children?: ReactNode;
  /** Full-width slot rendered under the row when `expanded` — the inline
   *  property editor (TaskRowEditor) lives here, below the task title
   *  instead of crowded beside it. */
  below?: ReactNode;
  /** Leading media slot — sits between the status dot and the title (e.g.
   * captured-image thumbs in front of the row). Callers own its click
   * behavior; it renders OUTSIDE the row's clickable main region. */
  leading?: ReactNode;
}

/**
 * Builds the click/keyboard/a11y props for a clickable region (the root row or
 * its main area). Centralized so the same logic doesn't get re-derived in two
 * places — both regions toggle on click + Enter, and expose role/tabIndex only
 * when interactive.
 */
type ClickableProps = {
  onClick?: (e: MouseEvent) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  role?: "button";
  tabIndex?: number;
};

function clickableProps(
  active: boolean,
  onActivate: () => void,
): ClickableProps {
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
  showLens = false,
  className = "",
  children,
  below,
  leading,
}: TaskRowProps) {
  const done = task.isDone ?? false;
  const hasChildren = Boolean(children);
  const clickableOnRoot = Boolean(onOpen && !hasChildren);
  const mainClickable = Boolean(onOpen && hasChildren);
  const openTask = () => onOpen?.(task);

  const dotClass = dotClassFor(task);
  // The due chip is scheduling signal — it matters on the bench (Upcoming:
  // overdue vs today vs later). Once a task is committed (status TODAY) the
  // date is redundant — every committed task reads as "today" — and a stale
  // past date would only guilt-trip. Hide it there so two TODAY tasks never
  // render different chip sets just because one kept its scheduledDate.
  const due =
    task.scheduledDate && task.status !== "TODAY"
      ? formatDueChip(task.scheduledDate)
      : null;
  const showLensPill = Boolean(showLens && task.lens);
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
    below && expanded ? "aa-task-row--has-below" : "",
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
      // Root-clickable rows (no action children) still expose expansion when
      // they carry a below-slot editor.
      aria-expanded={clickableOnRoot && below ? expanded : undefined}
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
      {leading && (
        <span
          className="aa-task-row__leading"
          onClick={(e) => e.stopPropagation()}
        >
          {leading}
        </span>
      )}
      <div
        className={mainClass}
        {...clickableProps(mainClickable, openTask)}
        aria-expanded={mainClickable ? expanded : undefined}
      >
        <span className="aa-task-row__title">
          {showLensPill && task.lens && (
            <span
              className="aa-task-row__lens"
              data-lens-color={task.lens.color ?? undefined}
              title={`Lens: ${task.lens.name}`}
            >
              <span className="aa-task-row__lens-dot" aria-hidden="true" />
              {task.lens.name}
            </span>
          )}
          {task.description}
        </span>
        {/* Summary pills hide while the below-editor is open — it shows the
            same properties as editors, so an expanded row would say M twice
            and pill some properties but not others. Collapse brings the
            summary back. */}
        {hasMeta && !(below && expanded) && (
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
      {below && expanded && (
        <div className="aa-task-row__below">{below}</div>
      )}
    </Element>
  );
}
