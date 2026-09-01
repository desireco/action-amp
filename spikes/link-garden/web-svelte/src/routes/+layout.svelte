<script lang="ts">
  import "../lib/tokens.css";
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(body) {
    margin: 0;
    background: var(--aa-bg);
    color: var(--aa-text);
    font-family: var(--aa-font);
    font-size: var(--aa-text-base);
    line-height: var(--aa-leading-snug);
  }
  :global(button) {
    font-family: inherit;
  }
</style>
