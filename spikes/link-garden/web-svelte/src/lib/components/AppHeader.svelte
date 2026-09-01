<script lang="ts">
  import { initialTheme, toggleTheme } from "../theme";
  import { links } from "../stores/links.svelte";

  let dark = $state(initialTheme());
</script>

<header>
  <h1>Link Garden</h1>
  <span class="meta">{links.statsText}</span>
  <span class="spacer"></span>
  <button class="ghost" onclick={() => (dark = toggleTheme())} title="toggle theme">{dark ? "☀" : "☾"}</button>
</header>

<style>
  header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  h1 {
    font-size: var(--aa-text-lg);
    font-weight: var(--aa-weight-semibold);
    margin: 0;
  }
  .meta {
    font-size: var(--aa-text-sm);
    opacity: 0.7;
  }
  .spacer { flex: 1; }
  .ghost {
    background: none;
    border: 1px solid var(--aa-border);
    border-radius: 6px;
    color: inherit;
    cursor: pointer;
    padding: 0.15rem 0.5rem;
    font-size: var(--aa-text-sm);
  }
</style>
