<script lang="ts">
  /**
   * CaptureFab — the lower-right floating capture button (webapp AppShell
   * parity). Mounted once by Shell.svelte so it pervades every app route;
   * opens the global ⌘K overlay. Styles come from styles/app-shell.css
   * (`.aa-app-capture-fab`, the verbatim port) — no scoped styles here.
   *
   * The webapp FAB's drag-images-onto-the-FAB intake is not ported: the new
   * stack's capture contract is text-only (no attachment upload yet).
   */
  import { capture } from "../stores/capture.svelte";
</script>

<button
  type="button"
  class="aa-app-capture-fab"
  title="Capture (⌘K)"
  aria-label="Capture"
  onclick={() => void capture.show()}
>
  <!-- PlusIcon (webapp icons.tsx, verbatim path). -->
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 3v10M3 8h10"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
    />
  </svg>
  <span>Capture</span>
  <kbd>⌘K</kbd>
</button>
