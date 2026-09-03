<script lang="ts">
  /**
   * CloseButton — the X affordance at the top-right of every overlay
   * (modal, popover, sheet). Ported from webapp ui/CloseButton: backed by
   * the shared `.aa-overlay__close` style in Overlays.css. The 16×16 X-icon
   * uses a 1.8 stroke (heavier than nav icons) so it reads as a control.
   */
  import "./Overlays.css";

  let {
    onClose,
    label = "Close",
    title,
    class: className = "",
  }: {
    onClose: () => void;
    /** Accessible label (defaults to "Close"; override for context copy). */
    label?: string;
    title?: string;
    class?: string;
  } = $props();

  const cls = $derived(["aa-overlay__close", className].filter(Boolean).join(" "));
</script>

<button type="button" class={cls} onclick={onClose} aria-label={label} {title}>
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M4 4l8 8M12 4l-8 8"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
    />
  </svg>
</button>
