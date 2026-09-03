<script lang="ts">
  // ConfirmDialog — the small centered confirmation overlay (pattern #04),
  // for destructive or irreversible actions, rarely. Ported from webapp
  // ui/ConfirmDialog: the overlay shell classes live in Overlays.css
  // (.aa-overlay / .aa-overlay-card / .aa-overlay-card--sm) and the actions
  // are real Button primitives — no hand-rolled duplicates.
  import "./Overlays.css";
  import Button from "./Button.svelte";
  import CloseButton from "./CloseButton.svelte";
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
    /** Use the rose danger style for the confirm button (destructive actions). */
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
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="aa-overlay-card aa-overlay-card--sm aa-confirm" onclick={(e) => e.stopPropagation()}>
    <div class="aa-confirm__head">
      <h2 class="aa-confirm__title">{title}</h2>
      <CloseButton onClose={onClose} />
    </div>

    <div class="aa-confirm__body">
      {#if typeof message === "string"}{message}{:else}{@render message()}{/if}
    </div>

    <div class="aa-confirm__foot">
      {#if cancelLabel !== null}
        <Button variant="secondary" size="sm" onclick={onClose}>
          {cancelLabel}
        </Button>
      {/if}
      <Button
        variant={danger ? "danger" : "primary"}
        size="sm"
        disabled={confirmDisabled}
        onclick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </div>
  </div>
</div>
