import { useEffect, useState } from "react";
import { Button } from "./index";
import "./Overlays.css";

export type TaskUpdateKind = "NOTE" | "COMPLETED";

export interface TaskUpdateEntry {
  id: string;
  body: string;
  createdAt: Date;
  kind: TaskUpdateKind;
}

export interface FocusTask {
  id: string;
  title: string;
  project?: string | null;
  due?: string | null;
  size?: string | null;
  content?: string | null;
  updates: TaskUpdateEntry[];
}

/**
 * FocusMode — full-screen single-task view. No sidebar, no list, no counts.
 *
 * Overlay pattern #01: takes over the viewport. Entered via `F` on a task (or
 * from Next's "Do this"). Esc exits, returning to Next.
 * From FEATURES.md F13. The activity thread + composer come from
 * docs/specs/task-notes-completion-log.md.
 */
export function FocusMode({
  task,
  onClose,
  onComplete,
  onAddNote,
  onSaveContent,
}: {
  task: FocusTask;
  onClose: () => void;
  onComplete?: () => void;
  onAddNote?: (body: string) => Promise<void> | void;
  onSaveContent?: (content: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState(task.content ?? "");
  const [contentDraft, setContentDraft] = useState(task.content ?? "");
  const [editingContent, setEditingContent] = useState(false);
  const [savingContent, setSavingContent] = useState(false);

  useEffect(() => {
    const nextContent = task.content ?? "";
    setContent(nextContent);
    setContentDraft(nextContent);
    setEditingContent(false);
  }, [task.id, task.content]);

  // Esc exits focus mode (scoped handler — the global handler only knows about
  // capture/cheatsheet since focus mode is page-rendered).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Enter posts the note; Shift+Enter inserts a newline. Plain Enter never
  // reaches the textarea (we preventDefault), so it can't accidentally submit
  // a half-finished thought via blur.
  const handleComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitNote();
    }
  };

  const submitNote = async () => {
    if (!onAddNote) return;
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      await onAddNote(body);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  };

  const saveContent = async () => {
    if (!onSaveContent || savingContent) return;
    const nextContent = contentDraft.trim();
    setSavingContent(true);
    try {
      await onSaveContent(nextContent);
      setContent(nextContent);
      setContentDraft(nextContent);
      setEditingContent(false);
    } finally {
      setSavingContent(false);
    }
  };

  return (
    <div className="aa-focus" role="dialog" aria-modal="true" aria-label={`Focus: ${task.title}`}>
      <div className="aa-focus__top">
        <button type="button" className="aa-overlay__close" onClick={onClose} aria-label="Exit focus mode (Esc)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="aa-focus__body">
        <h1 className="aa-focus__title">{task.title}</h1>
        {(task.project || task.due || task.size) && (
          <p className="aa-focus__meta">
            {[task.project, task.due, task.size].filter(Boolean).join(" · ")}
          </p>
        )}
        <section className="aa-focus__notes" aria-label="Notes">
          <div className="aa-focus__notes-top">
            <span className="aa-focus__notes-label">Notes</span>
            {onSaveContent && !editingContent && (
              <button
                type="button"
                className="aa-focus__notes-action"
                onClick={() => setEditingContent(true)}
              >
                {content ? "Edit notes" : "Add notes"}
              </button>
            )}
          </div>

          {editingContent ? (
            <div className="aa-focus__notes-editor">
              <textarea
                className="aa-focus__content-editor"
                aria-label="Task notes"
                value={contentDraft}
                onChange={(e) => setContentDraft(e.target.value)}
                rows={5}
                disabled={savingContent}
              />
              <div className="aa-focus__notes-actions">
                <Button variant="primary" onClick={saveContent} disabled={savingContent}>
                  Save notes
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setContentDraft(content);
                    setEditingContent(false);
                  }}
                  disabled={savingContent}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : content ? (
            <div className="aa-focus__content">{content}</div>
          ) : (
            <p className="aa-focus__content-empty">No task notes yet.</p>
          )}
        </section>

        <ol className="aa-focus__thread" aria-label="Activity">
          {task.updates.length === 0 && (
            <li className="aa-focus__thread-empty">No notes yet.</li>
          )}
          {task.updates.map((u) =>
            u.kind === "COMPLETED" ? (
              <li key={u.id} className="aa-focus__event">
                Completed · {formatTime(u.createdAt)}
              </li>
            ) : (
              <li key={u.id} className="aa-focus__note">
                <div className="aa-focus__note-body">{u.body}</div>
                <div className="aa-focus__note-time">{formatTime(u.createdAt)}</div>
              </li>
            ),
          )}
        </ol>

        {onAddNote && (
          <textarea
            className="aa-focus__composer"
            placeholder="Add a note — Enter to post, Shift+Enter for a new line"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleComposerKey}
            rows={1}
            disabled={submitting}
          />
        )}

        <div className="aa-focus__actions">
          <Button variant="primary" onClick={onComplete}>Complete</Button>
          <Button variant="secondary" onClick={onClose}>Exit focus</Button>
        </div>
      </div>
    </div>
  );
}

// Compact time label for a thread entry: "9:41 AM". Stays calm — no seconds,
// no relative-time verbosity.
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
