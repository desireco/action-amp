<script lang="ts">
  // The home screen — What Now. One task card, not a list. A `?task=<token>`
  // query rides the picked-task path: it redirects to /today/:permalink
  // (replace) exactly like the webapp route.
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import WhatNow from "../lib/components/WhatNow.svelte";
  import { capture } from "../lib/stores/capture.svelte";

  const taskToken = $derived(($page.url.searchParams.get("task") ?? "") || null);

  $effect(() => {
    if (taskToken) {
      void goto(`/today/${encodeURIComponent(taskToken)}`, { replaceState: true });
    }
  });

  // The PWA manifest's Capture shortcut lands here (`/?capture=1`): open the
  // global capture, then clear the param so a refresh doesn't reopen it (the
  // inbox page's identical contract).
  $effect(() => {
    if (new URL($page.url.href).searchParams.get("capture") === "1") {
      void capture.show();
      const url = new URL($page.url.href);
      url.searchParams.delete("capture");
      history.replaceState(history.state, "", url.href);
    }
  });
</script>

{#if !taskToken}
  <WhatNow />
{/if}
