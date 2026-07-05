import { Chip } from "../ui";
import { formatRelativeDue } from "../../shared/dateFormat";
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
  /** Lighter visual weight (for Someday / Done) */
  muted?: boolean;
  /** Open the task detail on row click */
  onOpen?: (task: TaskRowTask) => void;
  className?: string;
}

const SIZE_LABEL: Record<string, string> = { S: "S", M: "M", L: "L", XL: "XL" };

/**
 * TaskRow — the universal task list row. Title + meta chips.
 *
 * Used by Today, Upcoming, Someday, Project, Goal, and the Today bench. There
 * is no completion control here — completing a task happens in focus mode, not
 * by ticking a row. A done task reads as such via the `--done` class (struck
 * through, muted), driven by `task.isDone`.
 */
export function TaskRow({ task, muted = false, onOpen, className = "" }: TaskRowProps) {
  const done = task.isDone ?? false;

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
      <div className="aa-task-row__main">
        <span className="aa-task-row__title">{task.description}</span>
        {(task.project || task.dueDate || task.size || task.priority === "IMPORTANT") && (
          <div className="aa-task-row__meta">
            {task.priority === "IMPORTANT" && <Chip variant="amber" small>★</Chip>}
            {task.project && <Chip variant="violet" small>{task.project.name}</Chip>}
            {task.dueDate && (
              <Chip variant="teal" small>
                {formatRelativeDue(task.dueDate)}
              </Chip>
            )}
            {task.size && <span className="aa-task-row__size">{SIZE_LABEL[task.size]}</span>}
          </div>
        )}
      </div>
    </li>
  );
}
