<script lang="ts">
  // ConfirmDialog — the small centered confirmation overlay (pattern #04),
  // for destructive or irreversible actions, rarely.
  import type { Snippet } from "svelte";

  let {
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    confirmDisabled = false,
    onConfirm,
    onClose,
  }: {
    title: string;
    message: Snippet | string;
    confirmLabel?: string;
    cancelLabel?: string | null;
    danger?: boolean;
    confirmDisabled?: boolean;
    onConfirm: () => void;
    onClose: () => void;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
  class="aa-overlay"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={title}
  onclick={onClose}
  onkeydown={(e) => e.stopPropagation()}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="aa-confirm" onclick={(e) => e.stopPropagation()}>
    <div class="aa-confirm__head">
      <h2 class="aa-confirm__title">{title}</h2>
      <button type="button" class="aa-confirm__close" aria-label="Close" onclick={onClose}>×</button>
    </div>
    <div class="aa-confirm__body">
      {#if typeof message === "string"}{message}{:else}{@render message()}{/if}
    </div>
    <div class="aa-confirm__foot">
      {#if cancelLabel !== null}
        <button type="button" class="aa-btn aa-btn--secondary" onclick={onClose}>{cancelLabel}</button>
      {/if}
      <button
        type="button"
        class="aa-btn {danger ? "aa-btn--danger" : "aa-btn--primary"}"
        disabled={confirmDisabled}
        onclick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .aa-overlay {
    position: fixed;
    inset: 0;
    background: oklch(0.2 0.01 240 / 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 70;
  }
  .aa-confirm {
    width: min(26rem, calc(100vw - 2rem));
    background: var(--aa-surface, white);
    border-radius: 14px;
    padding: 1rem 1.25rem;
    box-shadow: 0 18px 50px oklch(0.2 0.01 240 / 0.25);
  }
  .aa-confirm__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .aa-confirm__title {
    font-size: var(--aa-text-md);
    font-weight: var(--aa-weight-semibold);
    margin: 0;
  }
  .aa-confirm__close {
    background: none;
    border: none;
    font-size: 1.2rem;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    cursor: pointer;
    line-height: 1;
  }
  .aa-confirm__body {
    margin: 0.6rem 0 1rem;
    color: var(--aa-text-muted, oklch(0.45 0.01 240));
    line-height: var(--aa-leading-normal);
  }
  .aa-confirm__foot {
    display: flex;
    justify-content: flex-end;
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
  .aa-btn--secondary {
    background: transparent;
    border-color: var(--aa-border-strong, oklch(0.85 0.006 240));
    color: var(--aa-text);
  }
  .aa-btn--primary {
    background: var(--aa-primary);
    color: white;
  }
  .aa-btn--primary:hover:not(:disabled) {
    background: var(--aa-primary-hover);
  }
  .aa-btn--danger {
    background: var(--aa-rose);
    color: white;
  }
</style>
