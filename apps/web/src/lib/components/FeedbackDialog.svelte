<script lang="ts">
  /**
   * FeedbackDialog — the "Leave feedback" overlay, ported 1:1 from
   * webapp/src/app/FeedbackDialog.tsx (the .aa-feedback styles ship from
   * styles/Overlays.css, which this component owns the import for).
   *
   *   Enter        → newline (multi-line box)
   *   ⌘/Ctrl+Enter → submit
   *   Esc          → close
   *
   * Submit failures keep the dialog open with an error line — never lose a
   * half-written report.
   */
  import "../styles/Overlays.css";
  import "../styles/Button.css";
  import { feedback } from "../stores/feedback.svelte";

  const MAX_LENGTH = 4000;

  let message = $state("");
  let error = $state<string | null>(null);
  let taEl: HTMLTextAreaElement | null = $state(null);

  const canSubmit = $derived(message.trim().length > 0 && !feedback.submitting);

  // Autofocus on open (webapp's mount effect).
  $effect(() => {
    taEl?.focus();
  });

  function close() {
    feedback.hide();
  }

  async function submit() {
    if (!canSubmit) return;
    error = null;
    try {
      await feedback.submit(message.trim());
      close();
    } catch {
      error = "Could not send feedback. Try again.";
    }
  }

  function onTextareaKeydown(event: KeyboardEvent) {
    // ⌘/Ctrl+Enter submits; plain Enter inserts a newline (multi-line box).
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") close();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
  class="aa-overlay"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label="Leave feedback"
  onclick={close}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="aa-overlay-card aa-overlay-card--sm aa-feedback" onclick={(e) => e.stopPropagation()}>
    <div class="aa-feedback__head">
      <div>
        <h2 class="aa-feedback__title">Leave feedback</h2>
        <p class="aa-feedback__sub">Tell us what happened, what felt off, or what would help.</p>
      </div>
      <button type="button" class="aa-overlay__close" aria-label="Close" onclick={close}>×</button>
    </div>

    <textarea
      bind:this={taEl}
      class="aa-feedback__textarea"
      rows="5"
      bind:value={message}
      onkeydown={onTextareaKeydown}
      placeholder="What should we know?"
      maxlength={MAX_LENGTH}
      disabled={feedback.submitting}
    ></textarea>

    {#if error}
      <p class="aa-feedback__error" role="alert">{error}</p>
    {/if}

    <div class="aa-feedback__foot">
      <span class="aa-feedback__count">{message.length}/{MAX_LENGTH}</span>
      <div class="aa-feedback__actions">
        <kbd class="aa-kbd">⌘↵</kbd>
        <button
          type="button"
          class="aa-btn aa-btn--secondary aa-btn--sm"
          onclick={close}
          disabled={feedback.submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          class="aa-btn aa-btn--primary aa-btn--sm"
          onclick={() => void submit()}
          disabled={!canSubmit}
        >
          {feedback.submitting ? "Sending" : "Send"}
        </button>
      </div>
    </div>
  </div>
</div>
