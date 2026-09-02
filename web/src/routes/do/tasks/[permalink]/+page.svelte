<script lang="ts">
  // Task detail (`/do/tasks/:permalink`) — prose edit only: title + Context
  // buffered locally; Save writes both. Done tasks read-only with an
  // editable Outcome. "Won't do" is one-way from here (restore in Logbook).
  // Property-key shortcuts stay live: [ / ] size, - / = priority, H When.
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { client } from "../../../../lib/api";
  import ConfirmDialog from "../../../../lib/components/ConfirmDialog.svelte";
  import PropertyChips from "../../../../lib/components/PropertyChips.svelte";
  import {
    taskPropertyFields,
    cycle,
    SIZE_ORDER,
    PRIORITY_ORDER,
    WHEN_ORDER,
  } from "../../../../lib/taskView";
  import type { TaskFull } from "../../../../lib/dto";

  /** The `tasks.task` detail shape: scalars + tags/thread/refs. */
  type TaskDetailDto = TaskFull & {
    tags: { id: string; name: string }[];
    updates: { id: string; body: string; kind: string; createdAt: string }[];
    project: { id: string; permalink: string; name: string } | null;
    goal: { id: string; permalink: string; name: string } | null;
    attachments: { id: string; filename: string; mimeType: string }[];
  };

  const permalink = $derived($page.params.permalink ?? "");

  let task = $state<TaskDetailDto | null>(null);
  let loading = $state(true);
  let description = $state("");
  let content = $state("");
  let outcomeDraft = $state("");
  let outcomeEditing = $state(false);
  let outcomeSaving = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let wontDoConfirmOpen = $state(false);
  let chipsOpen = $state(false);

  // returnTo is guarded to /do-prefixed paths (history state would need
  // navigation state; the webapp parity default is /do).
  const returnTo = "/do";

  $effect(() => {
    loading = true;
    void client.tasks
      .task({ id: permalink })
      .then((row) => {
        task = row;
        if (row) {
          description = row.description;
          content = row.content ?? "";
          outcomeDraft = row.outcome ?? "";
        }
      })
      .catch(() => (task = null))
      .finally(() => (loading = false));
  });

  const canSave = $derived(
    !!task &&
      !task.isDone &&
      description.trim().length > 0 &&
      !saving &&
      (description.trim() !== task.description || content.trim() !== (task.content ?? "")),
  );

  async function saveTask() {
    if (!task || !canSave) return;
    saving = true;
    saveError = null;
    try {
      await client.tasks.updateDetails({ taskId: task.id, description, content });
      void goto(returnTo);
    } catch {
      saveError = "Could not save task.";
    } finally {
      saving = false;
    }
  }

  async function markWontDo() {
    if (!task || task.isDone || task.status === "WONT_DO") return;
    try {
      await client.tasks.updateStatus({ id: task.id, status: "WONT_DO" });
      void goto(returnTo);
    } catch {
      saveError = "Could not mark as won't-do.";
    }
  }

  async function saveOutcome() {
    if (!task || outcomeSaving) return;
    outcomeSaving = true;
    try {
      const row = await client.tasks.setOutcome({ taskId: task.id, outcome: outcomeDraft });
      if (task) task = { ...task, outcome: row.outcome };
      outcomeEditing = false;
    } catch {
      saveError = "Could not save outcome.";
    } finally {
      outcomeSaving = false;
    }
  }

  // Structural chip writes (property keys + the read-only chip refresh).
  async function writeTaskPatch(patch: {
    status?: "TODAY" | "UPCOMING" | "SOMEDAY";
    priority?: "LOW" | "NORMAL" | "IMPORTANT";
    size?: "S" | "M" | "L" | "XL";
  }) {
    if (!task) return;
    try {
      await client.tasks.updateDetails({ taskId: task.id, ...patch });
      task = await client.tasks.task({ id: task.id });
    } catch {
      // Property-key shortcuts are silent writes; the refetch keeps the
      // display honest either way.
    }
  }

  // Property-key shortcuts (TRIAGE.md §7.4/§7.6) — no-op while typing, while
  // a chip popover is open, under a modifier, or when the task is done.
  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);
    if (!task || task.isDone || typing || chipsOpen) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case "[":
        e.preventDefault();
        void writeTaskPatch({ size: cycle(task.size, SIZE_ORDER, -1) as "S" | "M" | "L" | "XL" });
        break;
      case "]":
        e.preventDefault();
        void writeTaskPatch({ size: cycle(task.size, SIZE_ORDER, 1) as "S" | "M" | "L" | "XL" });
        break;
      case "-":
        e.preventDefault();
        void writeTaskPatch({ priority: cycle(task.priority, PRIORITY_ORDER, -1) as "LOW" | "NORMAL" | "IMPORTANT" });
        break;
      case "=":
      case "+":
        e.preventDefault();
        void writeTaskPatch({ priority: cycle(task.priority, PRIORITY_ORDER, 1) as "LOW" | "NORMAL" | "IMPORTANT" });
        break;
      case "h":
      case "H":
        e.preventDefault();
        void writeTaskPatch({
          status: cycle(
            task.status === "WONT_DO" ? "UPCOMING" : task.status,
            WHEN_ORDER,
            1,
          ) as "TODAY" | "UPCOMING" | "SOMEDAY",
        });
        break;
    }
  }

  function outcomeKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void saveOutcome();
    }
  }

  const createdLabel = $derived(
    task
      ? new Date(task.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "",
  );

  const chips = $derived(
    task
      ? taskPropertyFields({
          task: {
            status: task.status === "WONT_DO" ? "UPCOMING" : task.status,
            priority: task.priority,
            size: task.size,
            scheduledDate: task.scheduledDate,
            project: task.project ? { id: task.project.id, name: task.project.name } : null,
            goal: task.goal ? { id: task.goal.id, name: task.goal.name } : null,
          },
          projects: [],
          goals: [],
        })
      : [],
  );
</script>

<svelte:window onkeydown={onKey} />

<div class="aa-task-edit">
  <header class="aa-task-edit__topbar">
    <a href={returnTo} class="aa-task-edit__back">← Back</a>
    {#if task}
      <span class="aa-task-edit__permalink">/tasks/{task.permalink}</span>
    {/if}
  </header>

  {#if loading}
    <p class="aa-task-edit__state">Loading…</p>
  {:else if task}
    <div class="aa-task-edit__form">
      <section class="aa-task-edit__hero">
        <div class="aa-task-edit__kicker">
          <span>{task.isDone ? "Done task" : "Edit task"}</span>
          <span>Added {createdLabel}</span>
        </div>
        {#if task.isDone}
          <h1 class="aa-task-readonly-title">{task.description}</h1>
        {:else}
          <input
            class="aa-task-input"
            aria-label="Task title"
            bind:value={description}
          />
        {/if}

        {#if task.isDone}
          <PropertyChips fields={chips} readOnly />
        {/if}
      </section>

      {#if task.isDone}
        <section class="aa-task-done-panel" aria-label="Completed task feedback">
          <p class="aa-task-done-panel__notice">
            Completed tasks are closed; leave feedback about your experience doing it.
          </p>
          {#if content}
            <div class="aa-task-done-panel__notes">
              <span class="aa-task-label">Context</span>
              <p class="aa-task-done-panel__context">{content}</p>
            </div>
          {/if}
          <div class="aa-task-done-panel__outcome">
            <div class="aa-task-done-panel__outcome-head">
              <span class="aa-task-label">Outcome</span>
              {#if !outcomeEditing}
                <button
                  type="button"
                  class="aa-task-done-panel__outcome-toggle"
                  onclick={() => (outcomeEditing = true)}
                >
                  {task.outcome ? "Edit" : "Add outcome"}
                </button>
              {/if}
            </div>
            {#if outcomeEditing}
              <div class="aa-task-done-panel__outcome-editor">
                <textarea
                  class="aa-task-textarea"
                  aria-label="Task outcome"
                  bind:value={outcomeDraft}
                  onkeydown={outcomeKeydown}
                  placeholder="What happened?"
                  rows="4"
                  disabled={outcomeSaving}
                ></textarea>
                <div class="aa-task-done-panel__outcome-actions">
                  <button type="button" class="aa-btn aa-btn--primary" onclick={() => void saveOutcome()} disabled={outcomeSaving}>
                    {outcomeSaving ? "Saving" : "Save outcome"}
                  </button>
                  <button
                    type="button"
                    class="aa-btn aa-btn--secondary"
                    onclick={() => {
                      outcomeDraft = task?.outcome ?? "";
                      outcomeEditing = false;
                    }}
                    disabled={outcomeSaving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else if task.outcome}
              <p class="aa-task-done-panel__outcome-text">{task.outcome}</p>
            {/if}
          </div>
        </section>
      {:else}
        <section class="aa-task-edit__notes">
          <label class="aa-task-label" for="task-notes">Context</label>
          <textarea
            id="task-notes"
            class="aa-task-textarea"
            bind:value={content}
            placeholder="Add details, links, or next steps."
          ></textarea>
        </section>
      {/if}

      {#if saveError}<p class="aa-task-edit__err">{saveError}</p>{/if}

      <div class="aa-task-edit__actions">
        {#if !task.isDone && task.status !== "WONT_DO"}
          <button
            type="button"
            class="aa-task-edit__wont-do"
            aria-label="Mark as won't do"
            title="Mark as won't do"
            onclick={() => (wontDoConfirmOpen = true)}
          >
            ×
          </button>
        {/if}
        <div class="aa-task-edit__actions-main">
          <button type="button" class="aa-btn aa-btn--secondary" onclick={() => void goto(returnTo)}>
            {task.isDone ? "Back" : "Cancel"}
          </button>
          {#if !task.isDone}
            <button type="button" class="aa-btn aa-btn--primary" disabled={!canSave} onclick={() => void saveTask()}>
              {saving ? "Saving" : "Save task"}
            </button>
          {/if}
        </div>
      </div>
      {#if !task.isDone}<p class="aa-task-edit__help">Save writes the title and notes.</p>{/if}

      {#if wontDoConfirmOpen}
        <ConfirmDialog
          title="Mark as won't do?"
          message="It leaves your lists and surfaces in the Logbook, where you can restore it."
          confirmLabel="Mark won't do"
          cancelLabel="Keep task"
          danger
          onConfirm={() => {
            wontDoConfirmOpen = false;
            void markWontDo();
          }}
          onClose={() => (wontDoConfirmOpen = false)}
        />
      {/if}
    </div>
  {:else}
    <p class="aa-task-edit__state">This task doesn't exist — or isn't yours.</p>
  {/if}
</div>

<style>
  .aa-task-edit {
    padding: 1.25rem 1rem 3rem;
    max-width: 38rem;
    margin: 0 auto;
  }
  .aa-task-edit__topbar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .aa-task-edit__back {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    text-decoration: none;
    font-size: var(--aa-text-sm);
  }
  .aa-task-edit__back:hover {
    color: var(--aa-teal-cta);
  }
  .aa-task-edit__permalink {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-task-edit__state {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    text-align: center;
    padding: 2rem 0;
  }
  .aa-task-edit__form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    margin-top: 1rem;
  }
  .aa-task-edit__kicker {
    display: flex;
    justify-content: space-between;
    font-size: var(--aa-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    margin-bottom: 0.5rem;
  }
  .aa-task-input {
    width: 100%;
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-semibold);
    border: 1px solid var(--aa-border-strong, oklch(0.85 0.006 240));
    border-radius: 10px;
    padding: 0.5rem 0.7rem;
    font-family: inherit;
  }
  .aa-task-readonly-title {
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-semibold);
    margin: 0;
  }
  .aa-task-label {
    font-size: var(--aa-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    display: block;
    margin-bottom: 0.3rem;
  }
  .aa-task-textarea {
    width: 100%;
    border: 1px solid var(--aa-border-strong, oklch(0.85 0.006 240));
    border-radius: 10px;
    padding: 0.55rem 0.7rem;
    font: inherit;
    min-height: 7rem;
    resize: vertical;
  }
  .aa-task-done-panel__notice {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-sm);
    margin: 0 0 0.75rem;
  }
  .aa-task-done-panel__outcome-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .aa-task-done-panel__outcome-toggle {
    background: none;
    border: none;
    color: var(--aa-teal-cta);
    cursor: pointer;
    font-size: var(--aa-text-sm);
  }
  .aa-task-done-panel__outcome-text {
    white-space: pre-wrap;
    margin: 0.3rem 0 0;
  }
  .aa-task-done-panel__outcome-editor {
    margin-top: 0.3rem;
  }
  .aa-task-done-panel__outcome-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .aa-task-edit__err {
    color: var(--aa-rose-text);
    font-size: var(--aa-text-sm);
    margin: 0;
  }
  .aa-task-edit__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .aa-task-edit__wont-do {
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 999px;
    border: 1px solid var(--aa-border-strong, oklch(0.85 0.006 240));
    background: transparent;
    color: var(--aa-rose-text);
    font-size: 1rem;
    cursor: pointer;
  }
  .aa-task-edit__actions-main {
    display: flex;
    gap: 0.6rem;
    margin-left: auto;
  }
  .aa-task-edit__help {
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    font-size: var(--aa-text-xs);
    margin: -0.75rem 0 0;
    text-align: right;
  }
  .aa-btn {
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
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
  .aa-btn--primary:hover:not(:disabled) {
    background: var(--aa-primary-hover);
  }
  .aa-btn--secondary {
    background: transparent;
    border-color: var(--aa-border-strong, oklch(0.85 0.006 240));
    color: var(--aa-text);
  }
</style>
