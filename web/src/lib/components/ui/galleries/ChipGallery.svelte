<script lang="ts">
  // Chip gallery — every tone at both sizes, on the token background.
  import Chip from "../Chip.svelte";
  import { createRawSnippet } from "svelte";

  const label = (text: string) => createRawSnippet(() => ({ render: () => text }));

  const tones = [
    { variant: "default", text: "Today" },
    { variant: "teal", text: "Due Fri" },
    { variant: "amber", text: "Important" },
    { variant: "violet", text: "Garage cleanup" },
    { variant: "rose", text: "Overdue" },
    { variant: "muted", text: "Someday" },
  ] as const;
</script>

<div class="gallery">
  {#each tones as t (t.variant)}
    <div class="row">
      <Chip variant={t.variant}>{label(t.text)}</Chip>
      <Chip variant={t.variant} small>{label(t.text)}</Chip>
      <code>aa-chip--{t.variant}</code>
    </div>
  {/each}
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
    gap: var(--aa-space-sm);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--aa-space-sm);
  }
  code {
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    color: var(--aa-text-4);
    margin-left: var(--aa-space-sm);
  }
</style>
