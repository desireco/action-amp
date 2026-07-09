import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { CompletionCircle } from "./CompletionCircle";
import { Kbd, submitOnModEnter } from "./keyboard";
import { Markdown } from "./Markdown";
import { formatDuration } from "../../shared/timeFormat";
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
  outcome?: string | null;
  startedAt?: Date | null;
  /** When the current open session began (drives the live session clock). */
  sessionStartedAt?: Date | null;
  /** Total focused time across all sessions for this task, in ms. Includes
   *  elapsed-so-far on the open session so the total ticks alongside. */
  totalFocusedMs?: number;
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
  /** Called when the user confirms completion. Receives any Outcome note the
   *  user typed into the completion sheet (empty string = skipped). The parent
   *  persists it alongside the done toggle. */
  onComplete?: (outcome: string) => Promise<void> | void;
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

  // Hold-to-complete (touch only). Pressing and holding the hero circle fills a
  // ring around it over HOLD_MS; when the fill completes, the confirm dialog
  // opens. Releasing early cancels the fill. A short tap still opens confirm via
  // the circle's native click — so the gesture stays discoverable. Desktop
  // (mouse/trackpad) is unaffected: it keeps the instant click → confirm path.
  const [holding, setHolding] = useState(false);
  const holdCompletedRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HOLD_MS = 600;

  // Outcome draft captured at completion (task-fields §F). Non-blocking: the
  // field appears on the completion sheet, the user can type or skip; either
  // way the task completes. Preserved across the confirm toggle so opening the
  // sheet, typing half a thought, and dismissing doesn't lose it within this
  // focus session.
  const [outcomeDraft, setOutcomeDraft] = useState("");
  const outcomeRef = useRef<HTMLTextAreaElement>(null);

  // Elapsed-time tick — informational, 15s cadence (slow enough to ignore,
  // fast enough to feel alive). Derived from `task.startedAt`.
  const [, setTick] = useState(0);

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
    setComposerOpen(false);
    setDraft("");
    setConfirmOpen(false);
    setCompletedLocally(false);
    // Cancel any in-flight hold-to-complete when the task changes.
    clearHold();
  }, [task.id, task.content]);

  // Outcome reset is split out so it doesn't re-run on every content change
  // (which would clobber an in-progress draft if the server refetched).
  useEffect(() => {
    setOutcomeDraft(task.outcome ?? "");
  }, [task.id]);

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

  // Focus the Outcome field when the completion sheet opens — typing the note
  // is the expected path; the user can skip with Enter/Complete.
  useEffect(() => {
    if (confirmOpen) {
      const id = setTimeout(() => outcomeRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [confirmOpen]);

  // Session clock — elapsed since the current open session began (resets on
  // each Start). Falls back to startedAt for the rare case where a task has
  // the pointer but no matching session row (e.g. migration legacy).
  const sessionElapsedMs = task.sessionStartedAt
    ? Math.max(0, Date.now() - task.sessionStartedAt.getTime())
    : task.startedAt
      ? Math.max(0, Date.now() - task.startedAt.getTime())
      : null;
  const totalMs = task.totalFocusedMs ?? 0;

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

      // `p` → pause (exit focus, stop the clock). Same as Esc/X, but more
      // intentional and discoverable in the keyset alongside n/↵.
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        onClose();
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
    // user sees the payoff, if fast they're already moving. Pass the Outcome
    // draft (may be empty — skipped is a first-class choice).
    const note = outcomeDraft.trim();
    setConfirmOpen(false);
    setCompletedLocally(true);
    setOutcomeDraft("");
    void onComplete?.(note);
  };

  const openConfirm = () => {
    if (!onComplete) return;
    setComposerOpen(false);
    setConfirmOpen(true);
  };

  // ---- Hold-to-complete (touch) ----
  // Pointer Events cover both touch and mouse. We only arm the hold timer for
  // touch presses — mouse/trackpad keep the instant click. When the timer
  // fires we open the confirm and set a flag so the subsequent synthetic click
  // (browsers fire click after pointerup) is a no-op, preventing a double-open.
  const clearHold = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
  };
  const onCirclePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || !onComplete) return;
    holdCompletedRef.current = false;
    setHolding(true);
    holdTimerRef.current = setTimeout(() => {
      holdCompletedRef.current = true;
      clearHold();
      openConfirm();
    }, HOLD_MS);
  };
  const onCirclePointerUp = () => {
    if (holdTimerRef.current) clearHold();
  };
  // The fill animation runs only while `holding`; if it reaches the end before
  // the user releases, onAnimationEnd fires openConfirm (a backup to the
  // timer — whichever fires first wins, the other is a no-op via the flag).
  const onCircleAnimEnd = (e: React.AnimationEvent) => {
    if (e.animationName !== "aa-hold-fill" || !holding) return;
    if (holdCompletedRef.current) return;
    holdCompletedRef.current = true;
    clearHold();
    openConfirm();
  };
  // Circle click: if the hold already opened the confirm, swallow the click.
  const onCircleClick = () => {
    if (holdCompletedRef.current) {
      holdCompletedRef.current = false;
      return;
    }
    openConfirm();
  };

  return (
    <div
      className={`aa-focus${completedLocally ? " aa-focus--done" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${task.title}`}
    >
      <div className="aa-focus__top">
        {/* LEFT: margin clock — session (live, motivating) + total (honest record). */}
        <div className="aa-clock">
          <div className="aa-clock__row">
            <span className="aa-clock__num">
              {sessionElapsedMs !== null ? formatDuration(sessionElapsedMs) : "—"}
            </span>
            <span className="aa-clock__unit">in</span>
          </div>
          {totalMs > 0 && (
            <div className="aa-clock__total">
              total {formatDuration(totalMs)}
            </div>
          )}
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
            aria-label="Pause and exit focus (Esc or P)"
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
          <div
            className={`aa-presence__circle${holding ? " aa-presence__circle--holding" : ""}`}
            onPointerDown={onCirclePointerDown}
            onPointerUp={onCirclePointerUp}
            onPointerLeave={onCirclePointerUp}
            onPointerCancel={onCirclePointerUp}
            onAnimationEnd={onCircleAnimEnd}
          >
            <CompletionCircle
              filled={completedLocally}
              size="lg"
              onClick={onComplete ? onCircleClick : undefined}
              className={completedLocally ? "aa-cc--burst" : undefined}
            />
          </div>
        </div>

        <h1 className="aa-title">{task.title}</h1>

        {(task.project || task.due || task.size) && (
          <p className="aa-meta">
            {[task.project, task.due, task.size].filter(Boolean).join(" · ")}
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
            <div className="aa-focus__content">
              <Markdown>{content}</Markdown>
            </div>
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
          <Kbd>p</Kbd> pause
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

      {/* Completion sheet — Outcome capture at the moment of completion
          (task-fields §F). Non-blocking: the note is optional, Enter/Complete
          skips it in one keystroke; typing + ⌘↵ posts both in one motion. */}
      {confirmOpen && (
        <div
          className="aa-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Mark this done?"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="aa-overlay-card aa-overlay-card--sm aa-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aa-confirm__head">
              <h2 className="aa-confirm__title">Mark this done?</h2>
              <CloseButton onClose={() => setConfirmOpen(false)} />
            </div>

            <div className="aa-confirm__body">
              <p className="aa-confirm__meta">
                {sessionElapsedMs !== null
                  ? totalMs > 0
                    ? `${formatDuration(sessionElapsedMs)} this session · ${formatDuration(totalMs)} total`
                    : `${formatDuration(sessionElapsedMs)} this session`
                  : "This will mark the task complete."}
              </p>
              <div className="aa-confirm__outcome">
                <label
                  className="aa-confirm__outcome-label"
                  htmlFor="aa-focus-outcome"
                >
                  Outcome
                  <span className="aa-confirm__outcome-hint">optional</span>
                </label>
                <textarea
                  ref={outcomeRef}
                  id="aa-focus-outcome"
                  className="aa-confirm__outcome-input"
                  placeholder="What happened?"
                  value={outcomeDraft}
                  onChange={(e) => setOutcomeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // ⌘↵ / Ctrl+↵ always completes (with whatever's typed).
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleConfirm();
                      return;
                    }
                    // Bare Enter completes ONLY when the field is empty — so
                    // "skip" stays one keystroke (the spec's §F promise). Once
                    // the user has typed anything, Enter inserts a newline so
                    // multi-line outcomes work.
                    if (e.key === "Enter" && !outcomeDraft.trim()) {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                  rows={3}
                />
                <span className="aa-confirm__outcome-kbd">
                  <Kbd>⌘↵</Kbd> complete
                </span>
              </div>
            </div>

            <div className="aa-confirm__foot">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(false)}
              >
                Not yet
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirm}>
                Complete
              </Button>
            </div>
          </div>
        </div>
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
