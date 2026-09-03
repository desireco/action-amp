<script lang="ts">
  import "../app.css";
  import "../lib/tokens.css";
  // Global overlays + the app shell. ⌘K capture, / search and ⌘\ command
  // palette work on every page; the shell (lib/components/Shell.svelte — the
  // AppShell.tsx port) frames the app home "/" (this stack's What Now screen)
  // and every /do route. Flow pages — /welcome, /login, /signup,
  // /founding-100, /share, /cli — stay outside it (the webapp framed only the
  // authed app). The shell owns the lens switch + the data loads it needs.
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import CapturePopover from "../lib/components/CapturePopover.svelte";
  import CommandPalette from "../lib/components/search/CommandPalette.svelte";
  import Shell from "../lib/components/Shell.svelte";
  import { capture } from "../lib/stores/capture.svelte";
  import { search } from "../lib/stores/search.svelte";
  // S13 slice wiring — the first-run onboarding gate (the webapp kept this in
  // App.tsx; this mount is its equivalent spot). See
  // docs/plans/slices/s13-s15-wiring.md §3.
  import OnboardingGate from "../lib/components/OnboardingGate.svelte";
  // S12 slice wiring — the PWA worker (push + share target; caches NOTHING).
  // Registration failure is non-fatal (AppShell parity). The waiting-worker
  // protocol lives in the SW itself: install → wait → (banner's SKIP_WAITING)
  // → activate; the reload side rides controllerchange below.
  import { registerServiceWorker } from "../lib/push";
  let { children }: { children: Snippet } = $props();

  // The app shell's territory: "/" + the whole /do subtree.
  const inApp = $derived(
    page.url.pathname === "/" || page.url.pathname.startsWith("/do"),
  );

  let swRegistered = false;
  $effect(() => {
    if (swRegistered) return;
    swRegistered = true;
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
     navigation never spawns new chrome around this container. The shell
     frames it on the app routes; flow pages render it bare. -->
{#if inApp}
  <Shell>
    <div class="screen-container">
      {@render children()}
    </div>
  </Shell>
{:else}
  <div class="screen-container">
    {@render children()}
  </div>
{/if}

{#if capture.open}
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
</style>
