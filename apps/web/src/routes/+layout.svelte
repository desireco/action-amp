<script lang="ts">
  import "../app.css";
  import "../lib/tokens.css";
  // Global overlays + the lens switcher: the shell chrome. ⌘K capture,
  // / search and ⌘\ command palette work on every page; the switcher scopes
  // every lens-aware screen. Mount lines come from the slices' wiring notes
  // (docs/plans/slices/s9-wiring.md §2, s7-s11-wiring.md "shell mount").
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import CapturePopover from "../lib/components/CapturePopover.svelte";
  import CommandPalette from "../lib/components/search/CommandPalette.svelte";
  import ProGate from "../lib/components/ProGate.svelte";
  import LensSwitcher from "../lib/components/LensSwitcher.svelte";
  import { capture } from "../lib/stores/capture.svelte";
  import { search } from "../lib/stores/search.svelte";
  import { lenses } from "../lib/stores/lenses.svelte";
  import { prefs } from "../lib/stores/prefs.svelte";
  let { children } = $props();
  const captureHostedByPage = $derived($page.url.pathname === "/do/inbox");

  let showGate = $state(false);
  $effect(() => {
    if (!lenses.appData) void lenses.loadAppData();
    if (!prefs.account) void prefs.loadAccount();
  });
  const lensOptions = $derived(
    lenses.lenses.map((l) => ({
      id: l.id,
      label: l.name,
      color: l.color,
      purpose: l.purpose,
      proLocked: !prefs.account?.entitled && !l.isIncluded,
    })),
  );
</script>

<!-- Chords above the typing guard (⌘K capture, ⌘\ command); slash below it. -->
<svelte:window
  onkeydown={(e) => {
    capture.onGlobalKey(e);
    search.onGlobalKey(e);
  }}
/>

<!-- Single screen container: the app is modal — modes re-render in place,
     navigation never spawns new chrome around this container. -->
<div class="screen-container">
  <div class="shell-lens">
    <LensSwitcher
      options={lensOptions}
      active={lenses.activeLensId ?? ""}
      onSelect={(id) => void lenses.switch(id, prefs.account)}
      onClose={() => (showGate = false)}
      onNewLens={() => goto("/do/settings/lenses")}
      newLensProLocked={!prefs.account?.entitled}
    />
  </div>
  {@render children()}
</div>

{#if showGate && lenses.gate}
  <div
    class="shell-gate-backdrop"
    role="button"
    tabindex="-1"
    aria-label="Dismiss"
    onclick={(e) => {
      if (e.target === e.currentTarget) showGate = false;
    }}
    onkeydown={(e) => e.key === "Escape" && (showGate = false)}
  >
    <div class="shell-gate" role="alert">
      <ProGate feature={lenses.gate.feature} reason={lenses.gate.reason} />
    </div>
  </div>
{/if}
{#if capture.open && !captureHostedByPage}
  <CapturePopover />
{/if}
{#if search.open}
  <CommandPalette />
{/if}

<style>
  .screen-container {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .shell-lens {
    padding: var(--aa-space-3) var(--aa-space-4) 0;
  }

  .shell-gate-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--aa-bg) 70%, transparent);
  }

  .shell-gate {
    max-width: 26rem;
  }
</style>
