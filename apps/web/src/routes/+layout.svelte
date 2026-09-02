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
  // S13 slice wiring — the first-run onboarding gate (the webapp kept this in
  // App.tsx; this mount is its equivalent spot). See
  // docs/plans/slices/s13-s15-wiring.md §3.
  import OnboardingGate from "../lib/components/OnboardingGate.svelte";
  // S12 slice wiring — the PWA worker (push + share target; caches NOTHING).
  // Registration failure is non-fatal (AppShell parity). The waiting-worker
  // protocol lives in the SW itself: install → wait → (banner's SKIP_WAITING)
  // → activate; the reload side rides controllerchange below. The banner UI
  // is S12 long-tail (s12-s14-wiring.md).
  import { registerServiceWorker } from "../lib/push";
  let { children } = $props();
  const captureHostedByPage = $derived($page.url.pathname === "/do/inbox");

  let showGate = $state(false);
  $effect(() => {
    if (!lenses.appData) void lenses.loadAppData();
    if (!prefs.account) void prefs.loadAccount();
    registerServiceWorker();
    if ("serviceWorker" in navigator) {
      // Reload only on a REAL update activation (webapp useServiceWorkerUpdate
      // parity: a null controller is the FIRST-ever install — an initial
      // claim, not an update; the SW claims the page silently and no reload
      // fires). The update path is: banner's SKIP_WAITING → activate →
      // controllerchange → reload.
      if (navigator.serviceWorker.controller) {
        const onChange = () => window.location.reload();
        navigator.serviceWorker.addEventListener("controllerchange", onChange);
        return () =>
          navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      }
    }
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

<!-- S12 slice wiring — the PWA head (webapp main.wasp.ts `head`, verbatim).
     `display: standalone` in the manifest is what exempts the installed PWA
     from WebKit ITP's 7-day localStorage cap — why install is promoted. -->
<svelte:head>
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="theme-color" content="#008AC0" />
</svelte:head>

<!-- S13 slice wiring — first-run gate: hasSeenOnboarding === false on the app
     home redirects to /welcome (component renders nothing itself). -->
<OnboardingGate />

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
