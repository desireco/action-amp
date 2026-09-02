<script lang="ts">
  import { MODES, shell } from "../stores/shell.svelte";
</script>

<!-- Keys footer: the always-visible keyset so keyboard nav is discoverable
     without `?` (INTERACTION §6). Shows the active mode. -->
<footer class="keys">
  {#each MODES as m (m.id)}
    <span class:key-active={shell.mode === m.id}><kbd>{m.key}</kbd> {m.label}</span>
  {/each}
  <span class="sep" aria-hidden="true">·</span>
  <span><kbd>Esc</kbd> home</span>
  <span><kbd>?</kbd> {shell.keysHint ? "hide" : "keyset"}</span>
</footer>

<style>
  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    padding: 0.75rem 1.25rem 2rem;
    font-size: var(--aa-text-xs);
    color: var(--aa-text-3);
  }

  .key-active {
    color: var(--aa-primary);
    font-weight: var(--aa-weight-medium);
  }

  .sep {
    opacity: 0.5;
  }

  kbd {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    border: 1px solid var(--aa-border-strong);
    border-radius: var(--aa-radius-sm);
    padding: 0 0.25rem;
  }
</style>
