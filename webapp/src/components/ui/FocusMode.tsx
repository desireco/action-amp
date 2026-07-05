import { useEffect, useRef, useState } from "react";
import { Button, CompletionCircle, ConfirmDialog, Kbd, submitOnModEnter } from "./index";
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
  startedAt?: Date | null;
  updates: TaskUpdateEntry[];
}

/**
 * FocusMode — full-screen single-task view (Variant F, locked 2026-07-05).
 *
 * The task is the protagonist; the clock is chrome. Layout:
 *   - top-left margin clock (elapsed time, never a countdown)
 *   - centered hero completion circle (static at rest, fills on completion)
 *   - task title + meta beneath the circle
 *   - append-only progress thread (newest first)
 *   - bottom rail of subtle keyboard hints
 *
 * Interactions: `n` summons the notes composer, `Enter` (or clicking the
 * circle) opens a confirm dialog before completing, `Esc` exits. The
 * keyboard map is the only chrome. See `docs/mockups/focus-f-final.html`
 * and `docs/specs/focus-engine-v2.md` § "Focus screen — RESOLVED
 * 2026-07-05".
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
  // Composer state — summoned via `n`, posts via ⌘↵.
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Durable content editor — separate from the append-only thread. Kept
  // inline-summoned like the composer, toggled from the notes section.
  const [content, setContent] = useState(task.content ?? "");
  const [contentDraft, setContentDraft] = useState(task.content ?? "");
  const [editingContent, setEditingContent] = useState(false);
  const [savingContent, setSavingContent] = useState(false);

  // Confirm dialog before completion — the payoff animation is optimistic.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completedLocally, setCompletedLocally] = useState(false);

  // Elapsed-time tick — informational, 15s cadence (slow enough to ignore,
  // fast enough to feel alive). Derived from `task.startedAt`.
  const [, setTick] = useState(0);

  // Reset transient state when the task changes.
  useEffect(() => {
    const nextContent = task.content ?? "";
    setContent(nextContent);
    setContentDraft(nextContent);
    setEditingContent(false);
    setComposerOpen(false);
    setDraft("");
    setConfirmOpen(false);
    setCompletedLocally(false);
  }, [task.id, task.content]);

  // Elapsed clock ticker.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Focus the composer when it opens.
  useEffect(() => {
    if (composerOpen) {
      const id = setTimeout(() => composerRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [composerOpen]);

  const elapsedMin = task.startedAt
    ? Math.max(0, Math.floor((Date.now() - task.startedAt.getTime()) / 60_000))
    : null;

  // Window-scoped keyboard handler. Order matters: composer/confirm swallow
  // Esc before it falls through to exit. The global handler in AppShell
  // also listens for Esc but only closes AppShell-level overlays (capture,
  // cheatsheet, lens) — it's a no-op for focus state, so the two coexist.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc — close the topmost layer first.
      if (e.key === "Escape") {
        if (confirmOpen) {
          setConfirmOpen(false);
          return;
        }
        if (composerOpen) {
          setComposerOpen(false);
          return;
        }
        if (editingContent) {
          setContentDraft(content);
          setEditingContent(false);
          return;
        }
        onClose();
        return;
      }

      // While typing in a field, only the above Esc applies — `n`/Enter
      // must not steal keystrokes from the composer/editor.
      const target = e.target as HTMLElement | null;
      if (isTypingTarget(target)) return;
      if (confirmOpen) return;

      // `n` → toggle the summoned composer.
      if (e.key === "n" || e.key === "N") {
        if (!onAddNote) return;
        e.preventDefault();
        setComposerOpen((v) => !v);
        return;
      }

      // Enter → open the completion confirm.
      if (e.key === "Enter" && onComplete) {
        e.preventDefault();
        setConfirmOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onComplete, onAddNote, composerOpen, confirmOpen, editingContent, content]);

  // Composer: ⌘↵ / Ctrl+↵ posts (shared helper). Plain Enter inserts a
  // newline — the composer is summoned and dedicated, so multi-line input
  // is expected.
  const handleComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    submitOnModEnter(e, () => void submitNote());
  };

  const submitNote = async () => {
    if (!onAddNote) return;
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      await onAddNote(body);
      setDraft("");
      setComposerOpen(false);
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

  const handleConfirm = () => {
    // Optimistic payoff: circle fills, title strikes. The parent's
    // onComplete then awaits the server + navigates; if it's slow the
    // user sees the payoff, if fast they're already moving.
    setConfirmOpen(false);
    setCompletedLocally(true);
    onComplete?.();
  };

  const openConfirm = () => {
    if (!onComplete) return;
    setComposerOpen(false);
    setConfirmOpen(true);
  };

  return (
    <div
      className={`aa-focus${completedLocally ? " aa-focus--done" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${task.title}`}
    >
      <div className="aa-focus__top">
        {/* LEFT: margin clock — informational elapsed time, peripheral. */}
        <div className="aa-clock">
          <div className="aa-clock__row">
            <span className="aa-clock__num">{elapsedMin ?? "—"}</span>
            <span className="aa-clock__unit">min in</span>
          </div>
          <div className="aa-clock__label">
            <span className="aa-clock__dot" aria-hidden="true" />
            in focus
          </div>
        </div>

        {/* RIGHT: session footprint + close. */}
        <div className="aa-focus__top-right">
          {task.startedAt && (
            <div className="aa-session">
              started {formatTime(task.startedAt)}
              {task.project ? (
                <>
                  <span className="aa-session__sep">·</span>
                  on {task.project}
                </>
              ) : null}
            </div>
          )}
          <button
            type="button"
            className="aa-focus__close"
            onClick={onClose}
            aria-label="Exit focus mode (Esc)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="aa-focus__body">
        <div className="aa-presence">
          <div className="aa-presence__halo" aria-hidden="true" />
          <div className="aa-presence__circle">
            <CompletionCircle
              filled={completedLocally}
              size="lg"
              onClick={onComplete ? openConfirm : undefined}
              className={completedLocally ? "aa-cc--burst" : undefined}
            />
          </div>
        </div>

        <h1 className="aa-title">{task.title}</h1>

        {(task.project || task.due || task.size) && (
          <p className="aa-meta">
            {[task.project, task.due, task.size].filter(Boolean).map((part, i) => (
              <span key={i} className="aa-meta__part">
                {i > 0 && <span className="aa-meta__sep"> · </span>}
                {part}
              </span>
            ))}
          </p>
        )}

        {/* Durable content (working notes) — separate from the thread. */}
        <section className="aa-focus__notes" aria-label="Notes">
          <div className="aa-focus__notes-top">
            <span className="aa-focus__notes-label">Working notes</span>
            {onSaveContent && !editingContent && (
              <button
                type="button"
                className="aa-focus__notes-action"
                onClick={() => setEditingContent(true)}
              >
                {content ? "Edit" : "Add notes"}
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

        {/* Append-only progress thread — newest first (column-reverse). */}
        <ol className="aa-thread" aria-label="Activity">
          {task.updates.length === 0 && (
            <li className="aa-thread__empty">
              {onAddNote ? (
                <>
                  press <Kbd>n</Kbd> to add a note
                </>
              ) : (
                "No notes yet."
              )}
            </li>
          )}
          {task.updates.map((u) =>
            u.kind === "COMPLETED" ? (
              <li key={u.id} className="aa-thread__event">
                <span className="aa-thread__event-dot" aria-hidden="true" />
                <span className="aa-thread__event-text">Completed</span>
                <span className="aa-thread__time">{formatTime(u.createdAt)}</span>
              </li>
            ) : (
              <li key={u.id} className="aa-thread__note">
                <div className="aa-thread__note-body">{u.body}</div>
                <div className="aa-thread__time">{formatTime(u.createdAt)}</div>
              </li>
            ),
          )}
        </ol>
      </div>

      {/* Bottom rail: subtle keyboard map. Low opacity until hovered. */}
      <div className="aa-focus__rail">
        {onAddNote && (
          <button
            type="button"
            className="aa-hint"
            onClick={() => setComposerOpen((v) => !v)}
          >
            <Kbd>n</Kbd> note
          </button>
        )}
        {onComplete && (
          <button type="button" className="aa-hint" onClick={openConfirm}>
            <Kbd>↵</Kbd> complete
          </button>
        )}
        <button type="button" className="aa-hint" onClick={onClose}>
          <Kbd>esc</Kbd> exit
        </button>
      </div>

      {/* Summoned notes composer — slides up when open. */}
      {composerOpen && (
        <div className="aa-composer" role="region" aria-label="Progress note">
          <div className="aa-composer__label">
            <span>Progress note</span>
            <button
              type="button"
              className="aa-composer__dismiss"
              onClick={() => setComposerOpen(false)}
              aria-label="Dismiss"
            >
              <Kbd>esc</Kbd>
            </button>
          </div>
          <textarea
            ref={composerRef}
            className="aa-composer__text"
            placeholder="What did you learn, decide, or get stuck on?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleComposerKey}
            rows={3}
            disabled={submitting}
          />
          <div className="aa-composer__foot">
            <span className="aa-composer__hint">
              <Kbd>⌘↵</Kbd> to post
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={submitNote}
              disabled={!draft.trim() || submitting}
            >
              Post note
            </Button>
          </div>
        </div>
      )}

      {/* Completion confirm — calm, never blocking. */}
      {confirmOpen && (
        <ConfirmDialog
          title="Mark this done?"
          message={
            elapsedMin !== null
              ? `You've been at it for ${elapsedMin} min.`
              : "This will mark the task complete."
          }
          confirmLabel="Complete"
          cancelLabel="Not yet"
          onConfirm={handleConfirm}
          onClose={() => setConfirmOpen(false)}
        />
      )}
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

// True when keystrokes should go to a field, not a global handler. Mirrors
// the helper in app/useKeyboardShortcuts.ts so the composer doesn't steal
// `n`/Enter while the user is mid-thought.
function isTypingTarget(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}
