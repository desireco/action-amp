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
  /** Open the task detail on row click */
  onOpen?: (task: TaskRowTask) => void;
  /** Save durable task notes/body inline */
  onSaveContent?: (task: TaskRowTask, content: string) => Promise<void> | void;
  showContent?: boolean;
  notesToggleLabel?: string;
  notesTogglePlacement?: "inline" | "actions";
  className?: string;
  children?: ReactNode;
}

const SIZE_LABEL: Record<string, string> = { S: "S", M: "M", L: "L", XL: "XL" };

/** Stop click/keyboard from bubbling into the parent row's onOpen handler. */
function stopRowEvent(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
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
  showContent = false,
  notesToggleLabel,
  notesTogglePlacement = "inline",
  className = "",
  children,
}: TaskRowProps) {
  const done = task.isDone ?? false;
  const hasChildren = Boolean(children);
  const hasInlineNotes = Boolean(onSaveContent);
  const clickableOnRoot = Boolean(onOpen && !hasChildren && !hasInlineNotes);
  const mainClickable = Boolean(onOpen && (hasChildren || hasInlineNotes));
  const openTask = () => onOpen?.(task);

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
      <div className={mainClass} {...clickableProps(mainClickable, openTask)}>
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
        {(hasInlineNotes || showContent) && (
          <TaskRowNotes
            content={content}
            draft={draft}
            editing={editingNotes}
            saving={savingNotes}
            editable={hasInlineNotes}
            showToggle={
              hasInlineNotes && !editingNotes && notesTogglePlacement === "inline"
            }
            toggleLabel={
              notesToggleLabel ?? (content ? "Edit notes" : "Add notes")
            }
            onDraftChange={setDraft}
            onStartEdit={() => setEditingNotes(true)}
            onCancel={() => {
              setDraft(content);
              setEditingNotes(false);
            }}
            onSave={async () => {
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
            }}
          />
        )}
      </div>
      {(children ||
        (notesTogglePlacement === "actions" &&
          hasInlineNotes &&
          !editingNotes)) && (
        <div
          className="aa-task-row__actions"
          onClick={stopRowEvent}
          onKeyDown={stopRowEvent}
        >
          {children}
          {notesTogglePlacement === "actions" && hasInlineNotes && !editingNotes && (
            <button
              type="button"
              className="aa-task-row__notes-toggle"
              onClick={() => setEditingNotes(true)}
            >
              {notesToggleLabel ?? (content ? "Edit notes" : "Add notes")}
            </button>
          )}
        </div>
      )}
    </Element>
  );
}

/**
 * The notes region of a TaskRow. Read-only preview, or an inline editor with
 * Save / Cancel. Extracted from the main render to keep the row's structural
 * logic (click regions, class composition) legible.
 */
function TaskRowNotes({
  content,
  draft,
  editing,
  saving,
  editable,
  showToggle,
  toggleLabel,
  onDraftChange,
  onStartEdit,
  onCancel,
  onSave,
}: {
  content: string;
  draft: string;
  editing: boolean;
  saving: boolean;
  editable: boolean;
  showToggle: boolean;
  toggleLabel: string;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => Promise<void> | void;
}) {
  return (
    <div className="aa-task-row__notes" onClick={stopRowEvent} onKeyDown={stopRowEvent}>
      {editable && editing ? (
        <>
          <textarea
            className="aa-task-row__notes-editor"
            aria-label="Task notes"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={3}
            disabled={saving}
          />
          <div className="aa-task-row__notes-actions">
            <Button variant="primary" size="sm" onClick={onSave} disabled={saving}>
              Save notes
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          {content && <p className="aa-task-row__notes-preview">{content}</p>}
          {showToggle && (
            <button
              type="button"
              className="aa-task-row__notes-toggle"
              onClick={onStartEdit}
            >
              {toggleLabel}
            </button>
          )}
        </>
      )}
    </div>
  );
}
