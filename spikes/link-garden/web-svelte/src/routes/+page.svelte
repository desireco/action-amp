<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../lib/stores/session.svelte";
  import { links } from "../lib/stores/links.svelte";
  import { createKeyHandler } from "../lib/keyboard";
  import AuthCard from "../lib/components/AuthCard.svelte";
  import AppHeader from "../lib/components/AppHeader.svelte";
  import CaptureBar from "../lib/components/CaptureBar.svelte";
  import StatusTabs from "../lib/components/StatusTabs.svelte";
  import LinkList from "../lib/components/LinkList.svelte";
  import KeysFooter from "../lib/components/KeysFooter.svelte";

  let captureOpen = $state(false);
  let captureText = $state("");
  let captureBar = $state<CaptureBar | undefined>(undefined);

  const onKey = createKeyHandler({
    openCapture: () => {
      captureOpen = true;
      setTimeout(() => captureBar?.focus(), 0);
    },
    move: (delta) => links.move(delta),
    keep: () => void links.setStatus("KEPT"),
    dismiss: () => void links.setStatus("DISMISSED"),
    tag: () => {
      links.tagTarget = links.shown[links.selected]?.id ?? null;
    },
    escape: () => {
      captureOpen = false;
      links.tagFilter = null;
      links.tagTarget = null;
    },
  });

  async function submitCapture() {
    const error = await links.capture(captureText);
    if (error) {
      links.error = error;
      return;
    }
    captureText = "";
    captureOpen = false;
  }

  onMount(async () => {
    await session.init();
    if (session.user) await links.load();
  });

  $effect(() => {
    if (links.selected >= links.shown.length) links.selected = Math.max(0, links.shown.length - 1);
  });
</script>

<svelte:window onkeydown={onKey} />

{#if !session.user}
  <AuthCard />
{:else}
  <main class="app">
    <AppHeader />
    <CaptureBar bind:open={captureOpen} bind:text={captureText} onSubmit={submitCapture} />
    <StatusTabs />
    <LinkList />
    <KeysFooter />
    {#if links.error}<p class="error">{links.error}</p>{/if}
  </main>
{/if}

<style>
  .app {
    max-width: 42rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 4rem;
  }
  .error {
    color: var(--aa-amber-text, var(--aa-amber));
    font-size: var(--aa-text-sm);
    margin-top: 0.75rem;
  }
</style>
