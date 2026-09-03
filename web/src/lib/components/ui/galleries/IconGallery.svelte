<script lang="ts">
  // Icon gallery — every icon in the web set (ported from webapp ui/icons),
  // rendered at its in-app size with the name under it.
  import Icon from "../Icon.svelte";

  const icons = [
    "star",
    "box",
    "logbook",
    "trash",
    "projects",
    "calendar",
    "hash",
    "arrow-right",
    "chevron",
  ];
</script>

<div class="gallery">
  {#each icons as name (name)}
    <figure class="cell">
      <Icon name={name} size={16} />
      <figcaption>{name}</figcaption>
    </figure>
  {/each}
</div>

<style>
  .gallery {
    display: flex;
    flex-wrap: wrap;
    gap: var(--aa-space-lg);
    padding: var(--aa-space-lg);
    background: var(--aa-surface);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-lg);
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--aa-text-2);
  }
  figcaption {
    font-size: var(--aa-text-xs);
    color: var(--aa-text-4);
    font-family: var(--aa-font-mono);
  }
</style>
