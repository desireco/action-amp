<script lang="ts">
  // BottomSheet — mobile-first overlay anchored to the bottom edge (overlay
  // pattern #03). Esc / backdrop click dismiss. Ported from webapp
  // ui/BottomSheet; the shell classes (.aa-overlay, .aa-bottom-sheet*) live
  // in Overlays.css — verbatim with the legacy app's.
  import "./Overlays.css";
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
