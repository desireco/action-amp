<script lang="ts">
  // CompletionCircle gallery — the full state row: three sizes, empty →
  // filled → disabled, plus the burst + pulse hero treatments.
  import CompletionCircle from "../CompletionCircle.svelte";

  const sizes = ["sm", "md", "lg"] as const;
</script>

<div class="gallery">
  <div class="group">
    <span class="label">empty</span>
    {#each sizes as s (s)}<CompletionCircle size={s} />{/each}
  </div>
  <div class="group">
    <span class="label">filled</span>
    {#each sizes as s (s)}<CompletionCircle size={s} filled />{/each}
  </div>
  <div class="group">
    <span class="label">disabled</span>
    {#each sizes as s (s)}<CompletionCircle size={s} disabled />{/each}
  </div>
  <div class="group">
    <span class="label">burst</span>
    <CompletionCircle size="lg" filled burst />
  </div>
  <div class="group">
    <span class="label">pulse</span>
    <CompletionCircle size="lg" pulse />
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
    flex-wrap: wrap;
    gap: var(--aa-space-lg);
  }
  .group {
    display: flex;
    align-items: center;
    gap: var(--aa-space-sm);
  }
  .label {
    font-size: var(--aa-text-xs);
    font-weight: var(--aa-weight-semibold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--aa-text-4);
    min-width: 56px;
  }
</style>
