<script lang="ts">
  import { links } from "../stores/links.svelte";
  import type { LinkStatus } from "../api";

  const tabs: LinkStatus[] = ["NEW", "KEPT", "DISMISSED"];
</script>

<nav class="tabs">
  {#each tabs as status (status)}
    <button
      class:active={links.tab === status}
      onclick={() => { links.tab = status; links.selected = 0; }}
    >
      {status.toLowerCase()} <span class="count">{links.countFor(status)}</span>
    </button>
  {/each}
  {#if links.tagFilter}
    <button class="filter" onclick={() => (links.tagFilter = null)}>#{links.tagFilter} ✕</button>
  {/if}
</nav>

<style>
  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }
  button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: inherit;
    cursor: pointer;
    font-size: var(--aa-text-sm);
    padding: 0.35rem 0.6rem;
    opacity: 0.65;
  }
  button.active {
    opacity: 1;
    border-bottom-color: var(--aa-accent);
  }
  .count {
    font-size: var(--aa-text-xs);
    opacity: 0.7;
  }
  .filter {
    margin-left: auto;
    color: var(--aa-primary);
    opacity: 1;
  }
</style>
