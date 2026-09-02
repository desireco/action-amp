<script lang="ts">
  // BottomSheet — mobile-first overlay anchored to the bottom edge (overlay
  // pattern #03). Esc / backdrop click dismiss.
  import type { Snippet } from "svelte";

  let {
    title,
    onClose,
    children,
  }: {
    title?: string;
    onClose: () => void;
    children: Snippet;
  } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
  $effect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
  class="aa-overlay aa-bottom-sheet-overlay"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={title ?? "Sheet"}
  onclick={onClose}
  onkeydown={(e) => e.stopPropagation()}
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="aa-bottom-sheet" onclick={(e) => e.stopPropagation()}>
    <div class="aa-bottom-sheet__grabber" aria-hidden="true"></div>
    {#if title}<h2 class="aa-bottom-sheet__title">{title}</h2>{/if}
    <div class="aa-bottom-sheet__body">{@render children()}</div>
  </div>
</div>

<style>
  .aa-overlay {
    position: fixed;
    inset: 0;
    background: oklch(0.2 0.01 240 / 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 60;
  }
  .aa-bottom-sheet {
    width: 100%;
    max-width: 34rem;
    max-height: 80dvh;
    overflow-y: auto;
    background: var(--aa-surface, white);
    border-radius: 16px 16px 0 0;
    padding: 0.5rem 1.25rem 1.25rem;
  }
  .aa-bottom-sheet__grabber {
    width: 2.5rem;
    height: 4px;
    border-radius: 999px;
    background: var(--aa-border-strong, oklch(0.85 0.006 240));
    margin: 0.25rem auto 0.75rem;
  }
  .aa-bottom-sheet__title {
    font-size: var(--aa-text-md);
    font-weight: var(--aa-weight-semibold);
    margin: 0 0 0.75rem;
  }
</style>
