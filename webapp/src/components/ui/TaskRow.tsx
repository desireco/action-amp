import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { formatRelativeDue } from "../../shared/dateFormat";
import "./TaskRow.css";

export interface TaskRowTask {
  id: string;
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
  variant?: "plain" | "surface";
  /** Lighter visual weight (for Someday / Done) */
  muted?: boolean;
  /** Open the task detail on row click */
  onOpen?: (task: TaskRowTask) => void;
  /** Save durable task notes/body inline */
  onSaveContent?: (task: TaskRowTask, content: string) => Promise<void> | void;
  notesToggleLabel?: string;
  notesTogglePlacement?: "inline" | "actions";
  className?: string;
  children?: ReactNode;
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
export function TaskRow({
  task,
  as: Element = "li",
  variant = "plain",
  muted = false,
  onOpen,
  onSaveContent,
  notesToggleLabel,
  notesTogglePlacement = "inline",
  className = "",
  children,
}: TaskRowProps) {
  const done = task.isDone ?? false;
  const hasChildren = Boolean(children);
  const hasInlineNotes = Boolean(onSaveContent);
  const clickableOnRoot = Boolean(onOpen && !hasChildren && !hasInlineNotes);
  const openTask = () => onOpen?.(task);
  const openTaskOnEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") openTask();
  };
  const [content, setContent] = useState(task.content ?? "");
  const [draft, setDraft] = useState(task.content ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    const nextContent = task.content ?? "";
    setContent(nextContent);
    setDraft(nextContent);
    setEditingNotes(false);
  }, [task.id, task.content]);

  const stopRowClick = (event: MouseEvent) => {
    event.stopPropagation();
  };
  const stopRowKey = (event: KeyboardEvent) => {
    event.stopPropagation();
  };

  const saveNotes = async () => {
    if (!onSaveContent || savingNotes) return;
    const nextContent = draft.trim();
    setSavingNotes(true);
    try {
      await onSaveContent(task, nextContent);
      setContent(nextContent);
      setDraft(nextContent);
      setEditingNotes(false);
    } finally {
      setSavingNotes(false);
    }
  };
  const showNotesToggle = hasInlineNotes && !editingNotes;
  const notesToggleText =
    notesToggleLabel ?? (content ? "Edit notes" : "Add notes");
  const notesToggle = showNotesToggle ? (
    <button
      type="button"
      className="aa-task-row__notes-toggle"
      onClick={() => setEditingNotes(true)}
    >
      {notesToggleText}
    </button>
  ) : null;

  return (
    <Element
      className={[
        "aa-task-row",
        variant === "surface" ? "aa-task-row--surface" : "",
        done ? "aa-task-row--done" : "",
        muted ? "aa-task-row--muted" : "",
        clickableOnRoot ? "aa-task-row--clickable" : "",
        onOpen && hasChildren ? "aa-task-row--split" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={clickableOnRoot ? openTask : undefined}
      role={clickableOnRoot ? "button" : undefined}
      tabIndex={clickableOnRoot ? 0 : undefined}
      onKeyDown={clickableOnRoot ? openTaskOnEnter : undefined}
    >
      <div
        className={[
          "aa-task-row__main",
          onOpen && (hasChildren || hasInlineNotes)
            ? "aa-task-row__main--clickable"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={
          onOpen && (hasChildren || hasInlineNotes) ? openTask : undefined
        }
        role={onOpen && (hasChildren || hasInlineNotes) ? "button" : undefined}
        tabIndex={onOpen && (hasChildren || hasInlineNotes) ? 0 : undefined}
        onKeyDown={
          onOpen && (hasChildren || hasInlineNotes)
            ? openTaskOnEnter
            : undefined
        }
      >
        <span className="aa-task-row__title">{task.description}</span>
        {(task.project ||
          task.dueDate ||
          task.size ||
          task.priority === "IMPORTANT") && (
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
            {task.dueDate && (
              <Chip variant="teal" small>
                {formatRelativeDue(task.dueDate)}
              </Chip>
            )}
            {task.size && (
              <span className="aa-task-row__size">{SIZE_LABEL[task.size]}</span>
            )}
          </div>
        )}
        {hasInlineNotes && (
          <div
            className="aa-task-row__notes"
            onClick={stopRowClick}
            onKeyDown={stopRowKey}
          >
            {editingNotes ? (
              <>
                <textarea
                  className="aa-task-row__notes-editor"
                  aria-label="Task notes"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  disabled={savingNotes}
                />
                <div className="aa-task-row__notes-actions">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={saveNotes}
                    disabled={savingNotes}
                  >
                    Save notes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDraft(content);
                      setEditingNotes(false);
                    }}
                    disabled={savingNotes}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                {content && (
                  <p className="aa-task-row__notes-preview">{content}</p>
                )}
                {notesTogglePlacement === "inline" && notesToggle}
              </>
            )}
          </div>
        )}
      </div>
      {(children || (notesTogglePlacement === "actions" && notesToggle)) && (
        <div
          className="aa-task-row__actions"
          onClick={stopRowClick}
          onKeyDown={stopRowKey}
        >
          {children}
          {notesTogglePlacement === "actions" && notesToggle}
        </div>
      )}
    </Element>
  );
}
