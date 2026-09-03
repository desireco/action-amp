<script lang="ts">
  // Card gallery — variants + padding presets on the token background.
  import Card from "../Card.svelte";
  import { createRawSnippet } from "svelte";

  const label = (text: string) => createRawSnippet(() => ({ render: () => text }));

  const variants = ["default", "elevated", "interactive", "highlighted"] as const;
  const paddings = ["none", "sm", "md", "lg"] as const;
</script>

<div class="gallery">
  <div class="grid">
    {#each variants as v (v)}
      <Card variant={v} onclick={v === "interactive" ? () => {} : undefined}>
        {label(v)}<span class="hint">variant</span>
      </Card>
    {/each}
  </div>
  <div class="grid">
    {#each paddings as p (p)}
      <Card padding={p}>
        {#if p === "none"}<span class="hint">padding none</span>{:else}{label("padding " + p)}{/if}
      </Card>
    {/each}
  </div>
</div>

<style>
  .gallery {
    padding: var(--aa-space-lg);
    background: var(--aa-bg);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-lg);
    font-family: var(--aa-font);
    display: flex;
    flex-direction: column;
    gap: var(--aa-space-lg);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--aa-space-md);
    font-size: var(--aa-text-sm);
    color: var(--aa-text-2);
  }
  .hint {
    display: block;
    margin-top: 4px;
    font-size: var(--aa-text-xs);
    color: var(--aa-text-4);
  }
</style>
