<script lang="ts">
  // The picked-task path (`/do/today/:permalink`) — a chosen alternative or
  // overflow "Do" takes the stage; same What Now screen.
  import { page } from "$app/stores";
  import WhatNow from "../../../../lib/components/WhatNow.svelte";

  const picked = $derived(($page.params.permalink ?? "") || null);
</script>

<WhatNow pickedToken={picked} />
