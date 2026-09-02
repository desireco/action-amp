<script lang="ts">
  import { shell } from "../stores/shell.svelte";

  const label = $derived(shell.info().label.toUpperCase());
</script>

<!-- Mode indicator, bottom-left, VIM-style (docs/INTERACTION.md §4):
     monospace, small, dim — present but not loud. -->
<div class="indicator" data-mode={shell.mode} role="status" aria-live="polite">
  -- {label} --
</div>

<style>
  .indicator {
    position: fixed;
    left: 1rem;
    bottom: 1rem;
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    color: var(--aa-text-3);
    user-select: none;
  }

  /* Teal while shifted (INTERACTION §4); the home base stays quiet. */
  .indicator[data-mode="plan"],
  .indicator[data-mode="review"] {
    color: var(--aa-accent);
  }
</style>
