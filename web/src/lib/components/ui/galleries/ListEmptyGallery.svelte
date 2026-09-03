<script lang="ts">
  // ListEmpty gallery — the shell as lists embed it: full width, with an
  // action Button in the action slot.
  import ListEmpty from "../ListEmpty.svelte";
  import Button from "../Button.svelte";
  import { createRawSnippet } from "svelte";

  const icon = createRawSnippet(() => ({
    render: () =>
      `<svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.5h11v9h-11zM2.5 4.5L4 2.5h8l1.5 2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  }));
</script>

<div class="gallery">
  <ListEmpty {icon} title="Nothing due" text="Everything with a date has been handled.">
    {#snippet action()}
      <Button variant="secondary">Capture something</Button>
    {/snippet}
  </ListEmpty>
</div>

<style>
  .gallery {
    width: 100%;
    padding: var(--aa-space-xl);
    background: var(--aa-bg);
    border: 1px solid var(--aa-border);
    border-radius: var(--aa-radius-lg);
    font-family: var(--aa-font);
  }
</style>
