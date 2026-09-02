<!--
  StatusSelect — the inline feedback-status picker for the admin tables,
  ported from webapp/src/admin/StatusSelect.tsx (S17). A chip trigger opens a
  small absolute-positioned list of the 4 statuses; while a save is in flight
  the trigger is disabled (per-row, calm — no global "saving" UI). Outside-
  click + Escape close without changing. Delete is a separated danger option
  with a confirm dialog (destructive, even though the row stays in the DB).
-->
<script lang="ts">
  import Chip from "../Chip.svelte";
  import ConfirmDialog from "../ConfirmDialog.svelte";
  import {
    FEEDBACK_STATUSES,
    type FeedbackStatus,
  } from "../../stores/admin.svelte";

  const STATUS_DISPLAY: Record<
    FeedbackStatus,
    { label: string; variant: "default" | "amber" | "teal" | "muted" }
  > = {
    OPEN: { label: "open", variant: "default" },
    IN_PROGRESS: { label: "in progress", variant: "amber" },
    RESOLVED: { label: "resolved", variant: "teal" },
    CLOSED: { label: "closed", variant: "muted" },
  };

  let {
    status,
    onStatusChange,
    onDelete,
  }: {
    status: FeedbackStatus;
    onStatusChange: (status: FeedbackStatus) => Promise<void>;
    onDelete?: () => Promise<void>;
  } = $props();

  let open = $state(false);
  let saving = $state(false);
  let confirmDelete = $state(false);

  // Escape closes without changing (only while the panel is open).
  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === "Escape") open = false;
  }

  async function choose(next: FeedbackStatus) {
    if (next === status || saving) {
      open = false;
      return;
    }
    saving = true;
    open = false;
    try {
      await onStatusChange(next);
    } finally {
      saving = false;
    }
  }

  function requestDelete() {
    if (saving) return;
    open = false;
    confirmDelete = true;
  }

  async function confirmDeleteAction() {
    saving = true;
    confirmDelete = false;
    try {
      await onDelete?.();
    } finally {
      saving = false;
    }
  }

  const display = $derived(STATUS_DISPLAY[status]);
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="aa-status-select">
  {#if saving}
    <span class="aa-status-select__trigger aa-status-select__trigger--saving">
      <Chip variant={display.variant} small>{display.label}</Chip>
    </span>
  {:else}
    <button
      type="button"
      class="aa-status-select__trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <Chip variant={display.variant} small>{display.label}</Chip>
      <svg class="aa-status-select__caret" width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  {/if}

  {#if open}
    <button
      type="button"
      class="aa-status-select__backdrop"
      aria-label="Close"
      onclick={() => (open = false)}
      tabindex="-1"
    ></button>
    <ul class="aa-status-select__panel" role="listbox" aria-label="Feedback status">
      {#each FEEDBACK_STATUSES as s (s)}
        {@const d = STATUS_DISPLAY[s]}
        {@const current = s === status}
        <li role="option" aria-selected={current}>
          <button
            type="button"
            class="aa-status-select__option aa-chip--{d.variant} {current ? "aa-status-select__option--current" : ""}"
            onclick={() => void choose(s)}
            disabled={saving}
          >
            <span class="aa-status-select__option-label">{d.label}</span>
            {#if current}
              <svg class="aa-status-select__check" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {/if}
          </button>
        </li>
      {/each}
      {#if onDelete}
        <li class="aa-status-select__divider" role="separator"></li>
        <li>
          <button
            type="button"
            class="aa-status-select__option aa-status-select__option--danger"
            onclick={requestDelete}
            disabled={saving}
          >
            <span class="aa-status-select__option-label">Delete</span>
          </button>
        </li>
      {/if}
    </ul>
  {/if}

  {#if confirmDelete}
    <ConfirmDialog
      title="Delete feedback?"
      message="This hides the row from the admin dashboard and CLI. The record stays in the database (soft-delete) but won't appear in any triage view."
      confirmLabel="Delete"
      danger
      onConfirm={() => void confirmDeleteAction()}
      onClose={() => (confirmDelete = false)}
    />
  {/if}
</div>
