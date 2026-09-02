<script lang="ts">
  // FocusView — full-screen single-task view (the FocusMode port, centered
  // session layout). One large countdown ring; pause/resume inside the ring;
  // Add note / Pause / Wrap up actions; append-only thread (newest first);
  // n / p / d / Esc / ⌘↵ keyboard; the clock freezes while the wrap-up
  // composer is open.
  import SnoozeSheet from "./SnoozeSheet.svelte";
  import { formatDuration } from "../taskView";
  import { goto } from "$app/navigation";
  import { whatNow } from "../stores/whatNow.svelte";
  import type { FocusedTask } from "../dto";

  type ComposerMode = "note" | "completion" | null;

  let { task }: { task: FocusedTask } = $props();

  let composerMode = $state<ComposerMode>(null);
  let draft = $state("");
  let submitting = $state(false);
  let completingTask = $state(false);
  let completionError = $state<string | null>(null);
  let composerEl = $state<HTMLTextAreaElement | null>(null);
  let clockFrozenAt = $state<number | null>(null);
  let completedLocally = $state(false);
  let snoozeOpen = $state(false);
  let completingSession = $state(false);
  let outcomeDraft = $state("");
  let content = $state("");
  let contentDraft = $state("");
  let editingContent = $state(false);
  let savingContent = $state(false);
  let tick = $state(0);

  // Outcome draft resets per task; content drafts follow the server field.
  $effect(() => {
    content = task.content ?? "";
    contentDraft = task.content ?? "";
    editingContent = false;
    composerMode = null;
    draft = "";
    completedLocally = false;
    completingTask = false;
    completionError = null;
    snoozeOpen = false;
    clockFrozenAt = null;
  });
  $effect(() => {
    void task.id;
    outcomeDraft = task.outcome ?? "";
  });

  // Countdown ticker (one-second cadence keeps the large center time honest).
  $effect(() => {
    const id = setInterval(() => (tick += 1), 1_000);
    return () => clearInterval(id);
  });
  $effect(() => {
    void tick;
    if (composerMode) {
      const id = setTimeout(() => composerEl?.focus({ preventScroll: true }), 60);
      return () => clearTimeout(id);
    }
  });

  // Session clock — elapsed since the current open session began; falls back
  // to startedAt (legacy pointer-without-session rows). Frozen while the
  // wrap-up composer is open.
  const openSession = $derived(task.sessions?.find((s) => s.endedAt === null) ?? null);
  const sessionStartedAt = $derived(
    openSession ? new Date(openSession.startedAt).getTime() : null,
  );
  const clockNowMs = $derived(clockFrozenAt ?? Date.now());
  const sessionElapsedMs = $derived(
    sessionStartedAt !== null
      ? Math.max(0, clockNowMs - sessionStartedAt)
      : task.startedAt
        ? Math.max(0, clockNowMs - new Date(task.startedAt).getTime())
        : null,
  );
  const sessionDurationMs = $derived(task.focusSessionMinutes * 60_000);
  const completedFocusSessions = $derived(
    Math.max(0, Math.floor(task.sessions?.filter((s) => s.completed).length ?? 0)),
  );
  const sessionComplete = $derived(
    !openSession && (task.sessions?.at(-1)?.completed ?? false),
  );
  const sessionRunning = $derived(!!openSession && !sessionComplete);
  const remainingMs = $derived(
    sessionComplete ? 0 : Math.max(0, sessionDurationMs - (sessionElapsedMs ?? 0)),
  );
  const remainingPercent = $derived(
    sessionDurationMs ? (remainingMs / sessionDurationMs) * 100 : 0,
  );
  const goalContext = $derived(
    task.project?.goal ?? (task.goal ? { name: task.goal.name, description: task.goal.description } : null),
  );

  // Reaching zero records the Pomodoro but leaves the Task in focus; guard
  // against double submission while the query refreshes.
  $effect(() => {
    if (!sessionRunning || remainingMs > 0 || completingSession) return;
    completingSession = true;
    void whatNow.completeSession(task.id).catch(() => {}).finally(() => {
      completingSession = false;
    });
  });

  function completeTask() {
    if (completingTask) return;
    const originalDraft = outcomeDraft;
    const note = originalDraft.trim();
    completionError = null;
    composerMode = null;
    completedLocally = true;
    completingTask = true;
    outcomeDraft = "";
    void (async () => {
      await whatNow.complete(task.id, note);
      goto("/do");
    })().catch(() => {
      completedLocally = false;
      completingTask = false;
      outcomeDraft = originalDraft;
      composerMode = "completion";
      completionError = "Could not complete the task. Try again.";
    });
  }

  function openCompletionComposer() {
    if (task.isOnboardingSample) {
      completeTask();
      return;
    }
    completionError = null;
    clockFrozenAt = Date.now();
    composerMode = "completion";
  }

  function closeComposer() {
    composerMode = null;
    clockFrozenAt = null;
  }

  async function keepWorking() {
    if (completingTask) return;
    const note = outcomeDraft.trim();
    composerMode = null;
    clockFrozenAt = null;
    if (!note) return;
    outcomeDraft = "";
    submitting = true;
    try {
      await whatNow.addNote(task.id, note);
    } finally {
      submitting = false;
    }
  }

  async function submitNote() {
    const body = draft.trim();
    if (!body || submitting) return;
    submitting = true;
    try {
      await whatNow.addNote(task.id, body);
      draft = "";
      composerMode = null;
    } finally {
      submitting = false;
    }
  }

  async function saveContent() {
    if (savingContent) return;
    const nextContent = contentDraft.trim();
    savingContent = true;
    try {
      await whatNow.saveContent(task.id, nextContent);
      content = nextContent;
      contentDraft = nextContent;
      editingContent = false;
    } finally {
      savingContent = false;
    }
  }

  async function exitFocus() {
    await whatNow.pause(task.id);
    goto("/do");
  }

  // Window-scoped keyboard. Esc — layered: snooze sheet → composer → cancel
  // content editor → exit focus. Typing targets swallow everything but Esc.
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (snoozeOpen) {
        snoozeOpen = false;
        return;
      }
      if (composerMode) {
        closeComposer();
        return;
      }
      if (editingContent) {
        contentDraft = content;
        editingContent = false;
        return;
      }
      void exitFocus();
      return;
    }
    const target = e.target as HTMLElement | null;
    if (isTypingTarget(target)) return;
    if (snoozeOpen) return;

    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      composerMode = composerMode === "note" ? null : "note";
      return;
    }
    // p / Space — pause + exit focus.
    if (e.key === "p" || e.key === "P" || e.key === " ") {
      e.preventDefault();
      void exitFocus();
      return;
    }
    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      openCompletionComposer();
    }
  }

  function composerKeydown(e: KeyboardEvent) {
    // ⌘↵ / Ctrl↵ submits; plain Enter inserts a newline.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (composerMode === "completion") completeTask();
      else void submitNote();
    }
  }

  function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatTime(date: string): string {
    return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function isTypingTarget(el: HTMLElement | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  const thread = $derived([...task.updates].reverse()); // newest first visually
</script>

<svelte:window onkeydown={onKey} />

<div
  class="aa-focus {completedLocally ? "aa-focus--done" : ""}"
  role="dialog"
  aria-modal="true"
  aria-label="Focus: {task.description}"
>
  <button
    type="button"
    class="aa-focus__close"
    aria-label="Pause and exit focus"
    title="Pause and exit focus (Esc)"
    onclick={() => void exitFocus()}
  >
    ×
  </button>

  <div class="aa-focus__body">
    <section
      class="aa-focus-timer {composerMode === "completion" ? "aa-focus-timer--faded" : ""}"
      aria-label="Focus session timer"
    >
      <div class="aa-focus-timer__ring">
        <svg viewBox="0 0 100 100" class="aa-focus-timer__svg">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="var(--aa-border-strong, oklch(0.88 0.006 240))"
            stroke-width="1.6"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="var(--aa-teal)"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-dasharray={2 * Math.PI * 45}
            stroke-dashoffset={2 * Math.PI * 45 * (1 - remainingPercent / 100)}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div class="aa-focus-timer__center">
          <time class="aa-focus-timer__time" aria-live="off">
            {formatCountdown(remainingMs)}
          </time>
          <span class="aa-focus-timer__label">
            {sessionComplete ? "session complete" : `${task.focusSessionMinutes} min focus`}
          </span>
          {#if completedFocusSessions > 0}
            <span
              class="aa-focus-timer__cycles"
              aria-label="{completedFocusSessions} completed focus {completedFocusSessions === 1
                ? "session"
                : "sessions"}"
            >
              ◷ {completedFocusSessions}
            </span>
          {/if}
          <button
            type="button"
            class="aa-focus-timer__control"
            aria-label={sessionComplete ? "Start another focus session" : "Pause focus session"}
            onclick={() => {
              if (sessionComplete) void whatNow.startSession(task.id);
              else void exitFocus();
            }}
          >
            {sessionComplete ? "▶" : "❚❚"}
          </button>
        </div>
      </div>
    </section>

    <h1 class="aa-title" class:strike={completedLocally}>{task.description}</h1>

    {#if goalContext}
      <section class="aa-focus__goal" aria-label="Goal context">
        <p class="aa-focus__goal-question">Why does this matter?</p>
        <p class="aa-focus__goal-answer">
          {goalContext.description ?? `Toward ${goalContext.name}.`}
        </p>
        {#if goalContext.description}
          <p class="aa-focus__goal-attribution">Goal · {goalContext.name}</p>
        {/if}
      </section>
    {/if}

    <section class="aa-focus__clarification" aria-label="Task details">
      {#if editingContent}
        <div class="aa-focus__notes-editor">
          <textarea
            class="aa-focus__content-editor"
            aria-label="Task details"
            bind:value={contentDraft}
            rows="5"
            disabled={savingContent}
          ></textarea>
          <div class="aa-focus__notes-actions">
            <button type="button" class="aa-btn aa-btn--primary" onclick={() => void saveContent()} disabled={savingContent}>
              Save details
            </button>
            <button
              type="button"
              class="aa-btn aa-btn--secondary"
              onclick={() => {
                contentDraft = content;
                editingContent = false;
              }}
              disabled={savingContent}
            >
              Cancel
            </button>
          </div>
        </div>
      {:else if content}
        <div class="aa-focus__content">
          <p class="aa-focus__content-text">{content}</p>
          <button type="button" class="aa-focus__details-edit" onclick={() => (editingContent = true)}>
            Edit details
          </button>
        </div>
      {:else}
        <button type="button" class="aa-focus__details-empty" onclick={() => (editingContent = true)}>
          Add task details to clarify what done looks like.
        </button>
      {/if}
    </section>

    {#if !composerMode}
      <div class="aa-focus__primary-actions" aria-label="Task actions">
        <button type="button" class="aa-focus-action aa-focus-action--note" onclick={() => (composerMode = "note")}>
          ✎ <span>Add note</span>
        </button>
        <button type="button" class="aa-focus-action aa-focus-action--pause" onclick={() => void exitFocus()}>
          ❚❚ <span>Pause</span>
        </button>
        <button
          type="button"
          class="aa-focus-action aa-focus-action--complete"
          aria-expanded={task.isOnboardingSample ? undefined : composerMode === "completion"}
          aria-controls={task.isOnboardingSample ? undefined : "aa-focus-completion-composer"}
          onclick={openCompletionComposer}
        >
          Wrap up
        </button>
      </div>
    {/if}

    {#if composerMode}
      <section
        id={composerMode === "completion" ? "aa-focus-completion-composer" : "aa-focus-note-composer"}
        class="aa-focus-composer"
        aria-label={composerMode === "completion" ? "Complete task reflection" : "Progress note"}
      >
        <div class="aa-focus-composer__head">
          <div>
            <h2 class="aa-focus-composer__title">
              {composerMode === "completion" ? "How did it go?" : "Add a note"}
            </h2>
            <p class="aa-focus-composer__prompt">
              {#if composerMode === "completion"}
                {sessionElapsedMs !== null ? `You focused for ${formatDuration(sessionElapsedMs)}. ` : ""}
                Capture a result, decision, learning, or next step.
                <span class="aa-focus-composer__optional">Optional</span>
              {:else}
                Capture a decision, blocker, or next step without leaving focus.
              {/if}
            </p>
          </div>
          <button
            type="button"
            class="aa-focus-composer__dismiss"
            aria-label={composerMode === "completion" ? "Close completion reflection" : "Close progress note"}
            onclick={closeComposer}
          >
            esc
          </button>
        </div>

        <textarea
          bind:this={composerEl}
          class="aa-focus-composer__text"
          aria-label={composerMode === "completion" ? "Completion note optional" : "Progress note"}
          placeholder={composerMode === "completion"
            ? "A result, decision, learning, or next step…"
            : "What did you learn, decide, or get stuck on?"}
          bind:value={
            () => (composerMode === "completion" ? outcomeDraft : draft),
            (v) => (composerMode === "completion" ? (outcomeDraft = v) : (draft = v))
          }
          onkeydown={composerKeydown}
          rows="3"
          disabled={submitting || completingTask}
        ></textarea>

        {#if composerMode === "completion" && completionError}
          <p class="aa-focus-composer__error" role="alert">{completionError}</p>
        {/if}

        <div class="aa-focus-composer__foot">
          <span class="aa-focus-composer__hint">⌘↵ {composerMode === "completion" ? "mark complete" : "save note"}</span>
          <div class="aa-focus-composer__actions">
            {#if composerMode === "completion"}
              <button type="button" class="aa-btn aa-btn--secondary" onclick={() => void keepWorking()} disabled={completingTask}>
                Keep working
              </button>
            {/if}
            <button
              type="button"
              class="aa-btn aa-btn--primary"
              onclick={() => (composerMode === "completion" ? completeTask() : void submitNote())}
              disabled={composerMode === "completion" ? completingTask : !draft.trim() || submitting}
            >
              {composerMode === "completion" ? "Mark complete" : "Save note"}
            </button>
          </div>
        </div>
      </section>
    {/if}

    <ol class="aa-thread" aria-label="Activity">
      {#if task.updates.length === 0}
        <li class="aa-thread__empty">No notes yet.</li>
      {/if}
      {#each thread as u (u.id)}
        {#if u.kind === "COMPLETED"}
          <li class="aa-thread__event">
            <span class="aa-thread__event-dot" aria-hidden="true"></span>
            <span class="aa-thread__event-text">Completed</span>
            <span class="aa-thread__time">{formatTime(u.createdAt)}</span>
          </li>
        {:else}
          <li class="aa-thread__note">
            <div class="aa-thread__note-body">{u.body}</div>
            <div class="aa-thread__time">{formatTime(u.createdAt)}</div>
          </li>
        {/if}
      {/each}
    </ol>

    <button type="button" class="aa-focus__not-now" onclick={() => (snoozeOpen = true)}>
      Not now
    </button>
  </div>

  {#if snoozeOpen}
    <SnoozeSheet
      taskTitle={task.description}
      onSnooze={async (preset) => {
        await whatNow.snooze(task.id, preset);
        goto("/do");
      }}
      onClose={() => (snoozeOpen = false)}
    />
  {/if}
</div>

<style>
  .aa-focus {
    position: relative;
    min-height: 100dvh;
    padding: 3.5rem 1rem 2.5rem;
  }
  .aa-focus__close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    background: transparent;
    font-size: 1.1rem;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    cursor: pointer;
  }
  .aa-focus__body {
    max-width: 34rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }
  .aa-focus-timer--faded {
    opacity: 0.45;
  }
  .aa-focus-timer__ring {
    position: relative;
    width: min(16rem, 70vw);
    margin: 0 auto;
  }
  .aa-focus-timer__svg {
    display: block;
    width: 100%;
  }
  .aa-focus-timer__center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
  }
  .aa-focus-timer__time {
    font-size: 2.2rem;
    font-weight: var(--aa-weight-semibold);
    font-variant-numeric: tabular-nums;
    color: var(--aa-text);
  }
  .aa-focus-timer__label {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-focus-timer__cycles {
    font-size: var(--aa-text-xs);
    color: var(--aa-teal-cta);
  }
  .aa-focus-timer__control {
    margin-top: 0.4rem;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 999px;
    border: 1px solid var(--aa-border-strong, oklch(0.85 0.006 240));
    background: var(--aa-surface, white);
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--aa-text);
  }
  .aa-title {
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-semibold);
    text-align: center;
    margin: 0;
  }
  .aa-title.strike {
    text-decoration: line-through;
    color: var(--aa-text-muted, oklch(0.55 0.01 240));
  }
  .aa-focus__goal {
    text-align: center;
  }
  .aa-focus__goal-question {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin: 0;
  }
  .aa-focus__goal-answer {
    margin: 0.15rem 0 0;
    line-height: var(--aa-leading-normal);
  }
  .aa-focus__goal-attribution {
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin: 0.2rem 0 0;
  }
  .aa-focus__clarification {
    text-align: center;
  }
  .aa-focus__content-text {
    white-space: pre-wrap;
    margin: 0 0 0.3rem;
    color: var(--aa-text);
  }
  .aa-focus__details-edit,
  .aa-focus__details-empty {
    background: none;
    border: none;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-sm);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .aa-focus__content-editor {
    width: 100%;
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    border-radius: 8px;
    padding: 0.5rem;
    font: inherit;
  }
  .aa-focus__notes-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .aa-focus__primary-actions {
    display: flex;
    gap: 0.6rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  .aa-focus-action {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 8px;
    padding: 0.5rem 0.95rem;
    font-size: var(--aa-text-md);
    cursor: pointer;
    border: 1px solid var(--aa-border-strong, oklch(0.85 0.006 240));
    background: transparent;
    color: var(--aa-text);
  }
  .aa-focus-action--complete {
    background: var(--aa-primary);
    border-color: transparent;
    color: white;
    padding: 0.5rem 1.3rem;
  }
  .aa-focus-action--complete:hover {
    background: var(--aa-primary-hover);
  }
  .aa-focus-composer {
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    border-radius: 12px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .aa-focus-composer__head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .aa-focus-composer__title {
    margin: 0;
    font-size: var(--aa-text-md);
  }
  .aa-focus-composer__prompt {
    margin: 0.15rem 0 0;
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-focus-composer__optional {
    color: var(--aa-amber-text);
  }
  .aa-focus-composer__dismiss {
    background: none;
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    border-radius: 6px;
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    cursor: pointer;
    align-self: flex-start;
  }
  .aa-focus-composer__text {
    width: 100%;
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    border-radius: 8px;
    padding: 0.5rem;
    font: inherit;
    resize: vertical;
  }
  .aa-focus-composer__error {
    margin: 0;
    color: var(--aa-rose-text);
    font-size: var(--aa-text-sm);
  }
  .aa-focus-composer__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .aa-focus-composer__hint {
    font-size: var(--aa-text-xs);
    font-family: var(--aa-font-mono);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-focus-composer__actions {
    display: flex;
    gap: 0.5rem;
  }
  .aa-btn {
    border-radius: 8px;
    padding: 0.4rem 0.85rem;
    font-size: var(--aa-text-sm);
    cursor: pointer;
    border: 1px solid transparent;
  }
  .aa-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .aa-btn--primary {
    background: var(--aa-primary);
    color: white;
  }
  .aa-btn--secondary {
    background: transparent;
    border-color: var(--aa-border-strong, oklch(0.85 0.006 240));
    color: var(--aa-text);
  }
  .aa-thread {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column-reverse; /* newest first visually */
    gap: 0.55rem;
  }
  .aa-thread__empty {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-sm);
    text-align: center;
  }
  .aa-thread__note-body {
    white-space: pre-wrap;
    font-size: var(--aa-text-base);
  }
  .aa-thread__time {
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-thread__event {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: var(--aa-text-sm);
    color: var(--aa-teal-cta);
  }
  .aa-thread__event-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--aa-teal);
  }
  .aa-focus__not-now {
    display: none;
    background: none;
    border: none;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    cursor: pointer;
    font-size: var(--aa-text-sm);
  }
  @media (max-width: 40rem) {
    .aa-focus__not-now {
      display: block;
      margin: 0 auto;
    }
  }
</style>
