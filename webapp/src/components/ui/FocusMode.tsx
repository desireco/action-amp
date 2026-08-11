import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircularProgressbarWithChildren,
  buildStyles,
} from "react-circular-progressbar";
import { NotePencil, Pause, Play, Timer } from "@phosphor-icons/react";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { Kbd, submitOnModEnter } from "./keyboard";
import { Markdown } from "./Markdown";
import { SnoozeSheet, type SnoozePreset } from "./SnoozeSheet";
import { formatDuration } from "../../shared/timeFormat";
import type { GoalContext } from "../../app/taskContext";
import "react-circular-progressbar/dist/styles.css";
import "./Overlays.css";

export type TaskUpdateKind = "NOTE" | "COMPLETED";
type ComposerMode = "note" | "completion" | null;

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
  outcome?: string | null;
  /** Optional Goal rationale (null when the Task has no resolved Goal). */
  goalContext?: GoalContext | null;
  startedAt?: Date | null;
  /** When the current open session began (drives the live session clock). */
  sessionStartedAt?: Date | null;
  /** Duration selected when this session opened. */
  focusSessionMinutes: 25 | 45;
  /** Latest session reached its countdown and was recorded successfully. */
  sessionComplete?: boolean;
  /** Completed countdowns recorded against this Task. */
  completedFocusSessions?: number;
  updates: TaskUpdateEntry[];
}

/**
 * FocusMode — full-screen single-task view (centered session, 2026-08-07).
 *
 * The task is the protagonist; the clock is chrome. Layout:
 *   - centered Pomodoro countdown ring with pause/resume
 *   - task title + clarification beneath the ring
 *   - explicit Add note / Pause / Complete task actions
 *   - append-only progress thread (newest first)
 *   - bottom rail of subtle keyboard hints
 *
 * Interactions: `n` summons the notes composer, `d` opens the completion
 * reflection in that same area, and `Esc` exits. The keyboard map is the only
 * chrome.
 * and `docs/specs/focus-engine-v2.md` § "Focus screen — RESOLVED
 * 2026-07-05".
 */
export function FocusMode({
  task,
  onClose,
  onComplete,
  onCompleteSession,
  onStartSession,
  onAddNote,
  onSaveContent,
  onSnooze,
  skipCompletionReflection = false,
}: {
  task: FocusTask;
  onClose: () => void;
  /** Called when the user completes from the inline reflection. Receives any
   *  Outcome note the user typed (empty string = skipped). The parent
   *  persists it alongside the done toggle. */
  onComplete?: (outcome: string) => Promise<void> | void;
  /** Records a countdown reaching zero without completing the Task. */
  onCompleteSession?: () => Promise<void> | void;
  /** Opens another recorded countdown on the same focused Task. */
  onStartSession?: () => Promise<void> | void;
  onAddNote?: (body: string) => Promise<void> | void;
  onSaveContent?: (content: string) => Promise<void> | void;
  /** Completes immediately for disposable practice tasks that have no useful
   * outcome to reflect on. Ordinary work keeps the inline reflection. */
  skipCompletionReflection?: boolean;
  /** Called when the user picks a snooze preset from the "Not now" sheet. The
   *  parent runs snoozeTask (the task leaves the focus queue) and navigates
   *  away. Only reachable from the mobile action bar. */
  onSnooze?: (preset: SnoozePreset) => Promise<void> | void;
}) {
  // One notes-area composer handles both progress notes and completion
  // reflection. Completion stays in the task flow instead of opening a modal.
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completingTask, setCompletingTask] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Durable content editor — separate from the append-only thread. Kept
  // inline-summoned like the composer, toggled from the notes section.
  const [content, setContent] = useState(task.content ?? "");
  const [contentDraft, setContentDraft] = useState(task.content ?? "");
  const [editingContent, setEditingContent] = useState(false);
  const [savingContent, setSavingContent] = useState(false);

  const [completedLocally, setCompletedLocally] = useState(false);

  // Snooze sheet ("Not now") — opened from the mobile action bar. Esc closes it
  // before falling through to exit.
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const completingSessionRef = useRef(false);

  // Outcome draft captured in the notes area at completion (task-fields §F).
  // Non-blocking: the user can type or skip; either way the task completes.
  const [outcomeDraft, setOutcomeDraft] = useState("");

  // Countdown tick. One-second cadence keeps the large center time honest.
  const [, setTick] = useState(0);

  const completeTask = useCallback(() => {
    if (!onComplete || completingTask) return;
    // Optimistic payoff: title strikes. The parent's onComplete then awaits
    // server + navigation; if slow, user sees payoff. If fast, they move on.
    const originalDraft = outcomeDraft;
    const note = originalDraft.trim();
    setCompletionError(null);
    setComposerMode(null);
    setCompletedLocally(true);
    setCompletingTask(true);
    setOutcomeDraft("");
    void Promise.resolve(onComplete(note)).catch(() => {
      setCompletedLocally(false);
      setCompletingTask(false);
      setOutcomeDraft(originalDraft);
      setComposerMode("completion");
      setCompletionError("Could not complete the task. Try again.");
    });
  }, [completingTask, onComplete, outcomeDraft]);

  const openCompletionComposer = useCallback(() => {
    if (!onComplete) return;
    if (skipCompletionReflection) {
      completeTask();
      return;
    }
    setCompletionError(null);
    setComposerMode("completion");
  }, [completeTask, onComplete, skipCompletionReflection]);

  // Reset transient state when the task changes. Content drafts key off
  // task.content (they reflect a server-backed field that can change); outcome
  // keys off task.id only — outcome is a completion-time field, so an
  // in-focus (active) task carries null outcome and the draft shouldn't wipe
  // on a content refetch mid-edit.
  useEffect(() => {
    const nextContent = task.content ?? "";
    setContent(nextContent);
    setContentDraft(nextContent);
    setEditingContent(false);
    setComposerMode(null);
    setDraft("");
    setCompletedLocally(false);
    setCompletingTask(false);
    setCompletionError(null);
    setSnoozeOpen(false);
    completingSessionRef.current = false;
  }, [task.id, task.content]);

  // Outcome reset is split out so it doesn't re-run on every content change
  // (which would clobber an in-progress draft if the server refetched).
  useEffect(() => {
    setOutcomeDraft(task.outcome ?? "");
  }, [task.id]);

  // Countdown ticker.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // Focus whichever notes-area composer opens.
  useEffect(() => {
    if (composerMode) {
      const id = setTimeout(() => {
        const field = composerRef.current;
        field?.focus({ preventScroll: true });
        field?.scrollIntoView?.({ block: "center" });
      }, 60);
      return () => clearTimeout(id);
    }
  }, [composerMode]);

  // Session clock — elapsed since the current open session began (resets on
  // each Start). Falls back to startedAt for the rare case where a task has
  // the pointer but no matching session row (e.g. migration legacy).
  const sessionElapsedMs = task.sessionStartedAt
    ? Math.max(0, Date.now() - task.sessionStartedAt.getTime())
    : task.startedAt
      ? Math.max(0, Date.now() - task.startedAt.getTime())
      : null;
  const sessionDurationMs = task.focusSessionMinutes * 60_000;
  const completedFocusSessions = Math.max(
    0,
    Math.floor(task.completedFocusSessions ?? 0),
  );
  const sessionRunning =
    Boolean(task.sessionStartedAt) && !task.sessionComplete;
  const remainingMs = task.sessionComplete
    ? 0
    : Math.max(0, sessionDurationMs - (sessionElapsedMs ?? 0));
  const remainingPercent = sessionDurationMs
    ? (remainingMs / sessionDurationMs) * 100
    : 0;

  // Reaching zero records the Pomodoro but leaves the Task in focus. Guard the
  // request so render ticks cannot submit it twice while the query refreshes.
  useEffect(() => {
    if (
      !sessionRunning ||
      remainingMs > 0 ||
      completingSessionRef.current ||
      !onCompleteSession
    ) {
      return;
    }
    completingSessionRef.current = true;
    void Promise.resolve(onCompleteSession()).catch(() => {
      completingSessionRef.current = false;
    });
  }, [onCompleteSession, remainingMs, sessionRunning]);

  // Window-scoped keyboard handler. Order matters: composer/snooze swallow Esc
  // before it falls through to exit. The global handler in AppShell
  // also listens for Esc but only closes AppShell-level overlays (capture,
  // cheatsheet, lens) — it's a no-op for focus state, so the two coexist.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc — close the topmost layer first.
      if (e.key === "Escape") {
        if (snoozeOpen) {
          setSnoozeOpen(false);
          return;
        }
        if (composerMode) {
          setComposerMode(null);
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
      if (snoozeOpen) return;

      // `n` → toggle the summoned composer.
      if (e.key === "n" || e.key === "N") {
        if (!onAddNote) return;
        e.preventDefault();
        setComposerMode((mode) => (mode === "note" ? null : "note"));
        return;
      }

      // `p` / Space → pause (exit focus, stop the clock).
      if (e.key === "p" || e.key === "P" || e.key === " ") {
        e.preventDefault();
        onClose();
        return;
      }

      // `d` → open the inline completion reflection. Enter is intentionally
      // free: the timer and Task completion are separate controls.
      if ((e.key === "d" || e.key === "D") && onComplete) {
        e.preventDefault();
        openCompletionComposer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    onClose,
    onComplete,
    onAddNote,
    composerMode,
    snoozeOpen,
    editingContent,
    content,
    openCompletionComposer,
  ]);

  // Composer: ⌘↵ / Ctrl+↵ posts (shared helper). Plain Enter inserts a
  // newline — the composer is summoned and dedicated, so multi-line input
  // is expected.
  const handleComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    submitOnModEnter(e, () =>
      composerMode === "completion" ? void completeTask() : void submitNote(),
    );
  };

  const submitNote = async () => {
    if (!onAddNote) return;
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      await onAddNote(body);
      setDraft("");
      setComposerMode(null);
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
    <div
      className={`aa-focus${completedLocally ? " aa-focus--done" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${task.title}`}
    >
      <CloseButton
        onClose={onClose}
        label="Pause and exit focus"
        title="Pause and exit focus (Esc)"
        className="aa-focus__close"
      />

      <div className="aa-focus__body">
        <section className="aa-focus-timer" aria-label="Focus session timer">
          <div className="aa-focus-timer__glow" aria-hidden="true" />
          <div className="aa-focus-timer__ring">
            <CircularProgressbarWithChildren
              value={remainingPercent}
              strokeWidth={1.6}
              styles={buildStyles({
                pathColor: "var(--aa-teal)",
                trailColor: "var(--aa-border-strong)",
                strokeLinecap: "round",
                pathTransitionDuration: 0.8,
              })}
            >
              <time
                className="aa-focus-timer__time"
                dateTime={`PT${Math.ceil(remainingMs / 1000)}S`}
                aria-live="off"
              >
                {formatCountdown(remainingMs)}
              </time>
              <span className="aa-focus-timer__label">
                {task.sessionComplete
                  ? "session complete"
                  : `${task.focusSessionMinutes} min focus`}
              </span>
              {completedFocusSessions > 0 && (
                <span
                  className="aa-focus-timer__cycles"
                  aria-label={`${completedFocusSessions} completed focus ${
                    completedFocusSessions === 1 ? "session" : "sessions"
                  }`}
                  title={`${completedFocusSessions} completed focus ${
                    completedFocusSessions === 1 ? "session" : "sessions"
                  }`}
                >
                  <Timer size={16} weight="fill" aria-hidden />
                  <span aria-hidden>{completedFocusSessions}</span>
                </span>
              )}
              <button
                type="button"
                className="aa-focus-timer__control"
                onClick={() =>
                  task.sessionComplete ? void onStartSession?.() : onClose()
                }
                aria-label={
                  task.sessionComplete
                    ? "Start another focus session"
                    : "Pause focus session"
                }
              >
                {task.sessionComplete ? (
                  <Play size={24} weight="fill" aria-hidden />
                ) : (
                  <Pause size={24} weight="fill" aria-hidden />
                )}
              </button>
            </CircularProgressbarWithChildren>
          </div>
        </section>

        <h1 className="aa-title">{task.title}</h1>

        {task.goalContext && (
          <section className="aa-focus__goal" aria-label="Goal context">
            <p className="aa-focus__goal-question">Why does this matter?</p>
            <p className="aa-focus__goal-answer">
              {task.goalContext.description ?? `Toward ${task.goalContext.name}.`}
            </p>
            {task.goalContext.description && (
              <p className="aa-focus__goal-attribution">
                Goal · {task.goalContext.name}
              </p>
            )}
          </section>
        )}

        <section className="aa-focus__clarification" aria-label="Task details">
          {editingContent ? (
            <div className="aa-focus__notes-editor">
              <textarea
                className="aa-focus__content-editor"
                aria-label="Task details"
                value={contentDraft}
                onChange={(e) => setContentDraft(e.target.value)}
                rows={5}
                disabled={savingContent}
              />
              <div className="aa-focus__notes-actions">
                <Button
                  variant="primary"
                  onClick={saveContent}
                  disabled={savingContent}
                >
                  Save details
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
            <div className="aa-focus__content">
              <Markdown>{content}</Markdown>
              {onSaveContent && (
                <button
                  type="button"
                  className="aa-focus__details-edit"
                  onClick={() => setEditingContent(true)}
                >
                  Edit details
                </button>
              )}
            </div>
          ) : (
            onSaveContent && (
              <button
                type="button"
                className="aa-focus__details-empty"
                onClick={() => setEditingContent(true)}
              >
                Add task details to clarify what done looks like.
              </button>
            )
          )}
        </section>

        <div className="aa-focus__primary-actions" aria-label="Task actions">
          {onAddNote && (
            <button
              type="button"
              className="aa-focus-action aa-focus-action--note"
              onClick={() => setComposerMode("note")}
            >
              <NotePencil size={20} aria-hidden />
              <span>Add note</span>
            </button>
          )}
          <button
            type="button"
            className="aa-focus-action aa-focus-action--pause"
            onClick={onClose}
          >
            <Pause size={20} weight="fill" aria-hidden />
            <span>Pause</span>
          </button>
          {onComplete && (
            <Button
              variant="primary"
              size="lg"
              onClick={openCompletionComposer}
              aria-expanded={
                skipCompletionReflection
                  ? undefined
                  : composerMode === "completion"
              }
              aria-controls={
                skipCompletionReflection
                  ? undefined
                  : "aa-focus-completion-composer"
              }
              className="aa-focus-action aa-focus-action--complete"
            >
              Complete task
            </Button>
          )}
        </div>

        {composerMode && (
          <section
            id={
              composerMode === "completion"
                ? "aa-focus-completion-composer"
                : "aa-focus-note-composer"
            }
            className={`aa-focus-composer aa-focus-composer--${composerMode}`}
            aria-label={
              composerMode === "completion"
                ? "Complete task reflection"
                : "Progress note"
            }
          >
            <div className="aa-focus-composer__head">
              <div>
                <h2 className="aa-focus-composer__title">
                  {composerMode === "completion"
                    ? "How did it go?"
                    : "Add a note"}
                </h2>
                <p className="aa-focus-composer__prompt">
                  {composerMode === "completion"
                    ? `${
                        sessionElapsedMs !== null
                          ? `You focused for ${formatDuration(sessionElapsedMs)}. `
                          : ""
                      }Capture what changed, what you learned, or the next step.`
                    : "Capture a decision, blocker, or next step without leaving focus."}
                </p>
              </div>
              <button
                type="button"
                className="aa-focus-composer__dismiss"
                onClick={() => setComposerMode(null)}
                aria-label={
                  composerMode === "completion"
                    ? "Close completion reflection"
                    : "Close progress note"
                }
              >
                <Kbd>esc</Kbd>
              </button>
            </div>

            <textarea
              ref={composerRef}
              className="aa-focus-composer__text"
              aria-label={
                composerMode === "completion"
                  ? "Completion note optional"
                  : "Progress note"
              }
              placeholder={
                composerMode === "completion"
                  ? "A result, decision, learning, or next step…"
                  : "What did you learn, decide, or get stuck on?"
              }
              value={composerMode === "completion" ? outcomeDraft : draft}
              onChange={(event) =>
                composerMode === "completion"
                  ? setOutcomeDraft(event.target.value)
                  : setDraft(event.target.value)
              }
              onKeyDown={handleComposerKey}
              rows={3}
              disabled={submitting || completingTask}
            />

            {composerMode === "completion" && completionError && (
              <p className="aa-focus-composer__error" role="alert">
                {completionError}
              </p>
            )}

            <div className="aa-focus-composer__foot">
              <span className="aa-focus-composer__hint">
                <Kbd>⌘↵</Kbd>{" "}
                {composerMode === "completion" ? "complete" : "post note"}
              </span>
              <div className="aa-focus-composer__actions">
                {composerMode === "completion" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setComposerMode(null)}
                    disabled={completingTask}
                  >
                    Keep working
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={
                    composerMode === "completion" ? completeTask : submitNote
                  }
                  disabled={
                    composerMode === "completion"
                      ? completingTask
                      : !draft.trim() || submitting
                  }
                >
                  {composerMode === "completion"
                    ? "Complete task"
                    : "Post note"}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Append-only progress thread — newest first (column-reverse). */}
        <ol className="aa-thread" aria-label="Activity">
          {task.updates.length === 0 && (
            <li className="aa-thread__empty">No notes yet.</li>
          )}
          {task.updates.map((u) =>
            u.kind === "COMPLETED" ? (
              <li key={u.id} className="aa-thread__event">
                <span className="aa-thread__event-dot" aria-hidden="true" />
                <span className="aa-thread__event-text">Completed</span>
                <span className="aa-thread__time">
                  {formatTime(u.createdAt)}
                </span>
              </li>
            ) : (
              <li key={u.id} className="aa-thread__note">
                <div className="aa-thread__note-body">{u.body}</div>
                <div className="aa-thread__time">{formatTime(u.createdAt)}</div>
              </li>
            ),
          )}
        </ol>

        {onSnooze && (
          <button
            type="button"
            className="aa-focus__not-now"
            onClick={() => setSnoozeOpen(true)}
          >
            Not now
          </button>
        )}
      </div>

      {/* Snooze sheet — "Not now" from the mobile action bar. Reuses the same
          SnoozeSheet the home screen uses (5 presets). The parent's onSnooze
          runs snoozeTask and navigates away. */}
      {snoozeOpen && onSnooze && (
        <SnoozeSheet
          taskTitle={task.title}
          onSnooze={onSnooze}
          onClose={() => setSnoozeOpen(false)}
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

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
