<script lang="ts">
  // The home screen — What Now (`/do`). One task card, not a list. A
  // `?task=<token>` query rides the picked-task path: it redirects to
  // /do/today/:permalink (replace) exactly like the webapp route.
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import WhatNow from "../lib/components/WhatNow.svelte";

  const taskToken = $derived(($page.url.searchParams.get("task") ?? "") || null);

  $effect(() => {
    if (taskToken) {
      void goto(`/do/today/${encodeURIComponent(taskToken)}`, { replaceState: true });
    }
  });
</script>

{#if !taskToken}
  <WhatNow />
{/if}
