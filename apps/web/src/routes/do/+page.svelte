<script lang="ts">
  // The app home at /do — the What Now chooser, the same screen the root
  // "/" route hosts. /do is the path every existing surface already points
  // at (the PWA manifest's start_url, the auth returnTo default, the shell
  // links) and the webapp's home path; / stays live for the seeded deep
  // links and the onboarding funnel's landing assertion. Both entries run
  // the same host so picked-task and capture-query links work at either.
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import WhatNow from "../../lib/components/WhatNow.svelte";
  import { capture } from "../../lib/stores/capture.svelte";

  const taskToken = $derived(($page.url.searchParams.get("task") ?? "") || null);

  $effect(() => {
    if (taskToken) {
      void goto(`/do/today/${encodeURIComponent(taskToken)}`, { replaceState: true });
    }
  });

  // The PWA manifest's Capture shortcut lands here (`/do?capture=1`): open
  // the global capture, then clear the param so a refresh doesn't reopen it
  // (the inbox page's identical contract).
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
