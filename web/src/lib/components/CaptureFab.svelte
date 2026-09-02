<script lang="ts">
  /**
   * CaptureFab — the lower-right floating capture button (webapp AppShell
   * parity). Opens the global ⌘K overlay; the drop-files-onto-FAB intake is
   * S12's PWA slice and is intentionally absent here.
   */
  import { capture } from "../stores/capture.svelte";
</script>

<button type="button" class="aa-capture-fab" onclick={() => void capture.show()} aria-label="Capture">
  <span class="aa-capture-fab__icon" aria-hidden="true">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
  <span class="aa-capture-fab__label">Capture</span>
  <kbd class="aa-capture-fab__kbd">⌘K</kbd>
</button>

<style>
  .aa-capture-fab {
    position: fixed;
    right: 1.5rem;
    bottom: 1.5rem;
    z-index: 30;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: inherit;
    font-size: var(--aa-text-sm);
    font-weight: var(--aa-weight-semibold);
    color: var(--aa-surface);
    background: var(--aa-teal-cta);
    border: none;
    border-radius: var(--aa-radius-full);
    padding: 0.6rem 1.1rem;
    cursor: pointer;
    box-shadow: var(--aa-shadow-md, 0 6px 20px oklch(0 0 0 / 0.16));
    transition: box-shadow 0.15s var(--aa-ease-out), transform 0.08s var(--aa-ease-out);
  }

  .aa-capture-fab:hover {
    box-shadow: 0 8px 24px oklch(0 0 0 / 0.2);
  }

  .aa-capture-fab:active {
    transform: scale(0.97);
  }

  .aa-capture-fab:focus-visible {
    outline: 2px solid var(--aa-teal);
    outline-offset: 2px;
  }

  .aa-capture-fab__kbd {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    background: oklch(1 0 0 / 0.16);
    border-radius: var(--aa-radius-xs);
    padding: 0.05rem 0.3rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .aa-capture-fab {
      transition-duration: 0.01ms;
    }
  }
</style>
