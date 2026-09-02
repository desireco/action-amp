<script lang="ts">
  // Focus route — a mode, not an address for a specific task: the server
  // exposes the user's single started task; this page renders it and bounces
  // to /do when none (never on a stale empty cache — the store refreshes
  // before deciding).
  import { goto } from "$app/navigation";
  import FocusView from "../../../lib/components/FocusView.svelte";
  import { whatNow } from "../../../lib/stores/whatNow.svelte";

  let ready = $state(false);
  whatNow.focused = null;
  void whatNow.loadFocused().then(() => (ready = true));

  $effect(() => {
    if (ready && !whatNow.focused) void goto("/do", { replaceState: true });
  });
</script>

{#if !ready}
  <div class="aa-focus-loading">
    <div class="aa-focus-loading__eyebrow">Focus</div>
    <h1>...</h1>
  </div>
{:else if whatNow.focused}
  <FocusView task={whatNow.focused} />
{/if}

<style>
  .aa-focus-loading {
    padding: 3rem 1rem;
    text-align: center;
  }
  .aa-focus-loading__eyebrow {
    font-size: var(--aa-text-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
  }
  .aa-focus-loading h1 {
    font-size: var(--aa-text-2xl);
    margin: 0.4rem 0 0;
  }
</style>
