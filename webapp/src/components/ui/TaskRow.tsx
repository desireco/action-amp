import { useState } from "react";
import { Chip, CompletionCircle } from "../ui";
import "./TaskRow.css";

export interface TaskRowTask {
  id: string;
  description: string;
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
  /** Called when the completion circle is clicked. Mutates the task. */
  onToggleDone?: (task: TaskRowTask) => void;
  /** Lighter visual weight (for Someday) */
  muted?: boolean;
  /** Open the task detail on row click */
  onOpen?: (task: TaskRowTask) => void;
  className?: string;
}

const SIZE_LABEL: Record<string, string> = { S: "S", M: "M", L: "L", XL: "XL" };

/**
 * TaskRow — the universal task list row. Completion circle + title + meta chips.
 *
 * Used by Today, Upcoming, Someday, and Logbook. The circle optimistically
 * flips and the row animates out (Logbook rows are read-only — pass no
 * onToggleDone).
 */
export function TaskRow({ task, onToggleDone, muted = false, onOpen, className = "" }: TaskRowProps) {
  const [optimisticDone, setOptimisticDone] = useState<boolean | null>(null);
  const done = optimisticDone ?? task.isDone ?? false;

  const handleCircle = () => {
    setOptimisticDone(!done);
    onToggleDone?.({ ...task, isDone: !done });
  };

  return (
    <li
      className={[
        "aa-task-row",
        done ? "aa-task-row--done" : "",
        muted ? "aa-task-row--muted" : "",
        onOpen ? "aa-task-row--clickable" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onOpen ? () => onOpen(task) : undefined}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => e.key === "Enter" && onOpen(task) : undefined}
    >
      <div className="aa-task-row__circle">
        <CompletionCircle
          size="sm"
          filled={done}
          onClick={onToggleDone ? handleCircle : undefined}
        />
      </div>
      <div className="aa-task-row__main">
        <span className="aa-task-row__title">{task.description}</span>
        {(task.project || task.dueDate || task.size || task.priority === "IMPORTANT") && (
          <div className="aa-task-row__meta">
            {task.priority === "IMPORTANT" && <Chip variant="amber" small>★</Chip>}
            {task.project && <Chip variant="violet" small>{task.project.name}</Chip>}
            {task.dueDate && (
              <Chip variant="teal" small>
                {formatDue(task.dueDate)}
              </Chip>
            )}
            {task.size && <span className="aa-task-row__size">{SIZE_LABEL[task.size]}</span>}
          </div>
        )}
      </div>
    </li>
  );
}

function formatDue(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
