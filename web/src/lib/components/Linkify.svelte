<script lang="ts">
  /**
   * Linkify — ported from webapp/src/components/ui/Linkify.tsx (S3): bare
   * URLs in captured text render as real links (new tab, hardened). Segment
   * logic lives in lib/format/linkify.ts; styles from styles/Linkify.css.
   */
  import { linkifySegments } from "../format/linkify";

  let { text }: { text: string } = $props();

  const segments = $derived(linkifySegments(text));
  const hasUrls = $derived(segments.some((s) => s.kind === "url"));
</script>

{#if !hasUrls}
  {text}
{:else}
  {#each segments as segment, i (i)}
    {#if segment.kind === "url"}
      <a class="aa-linkify" href={segment.href} target="_blank" rel="noopener noreferrer">
        {segment.value}
      </a>
    {:else}
      {segment.value}
    {/if}
  {/each}
{/if}
