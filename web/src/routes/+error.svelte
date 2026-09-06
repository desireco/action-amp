<script lang="ts">
  // +error.svelte — the root error boundary (SPA: ssr = false, so this is a
  // client-side render). The 404 face is the bookmarked-route case: an
  // unknown path (an old-webapp route like /task/xyz, a stale link) is
  // served index.html by the API's catch-all and then 404s in the client
  // router. Without this file that fell through to SvelteKit's default
  // error page; now it's a calm card with a way out — home for signed-in
  // users, sign-in for everyone else. Non-404 statuses get the same card
  // with generic copy and a reload.
  //
  // Visual note: reuses the auth stage classes (lib/styles/auth.css, global)
  // so the page reads as a first-party surface — same card, brand mark, and
  // teal CTA as /login, light + dark. Local styles are scoped and tokenized.
  import { page } from "$app/state";
  import { fetchAuthUser } from "../lib/auth";

  const notFound = $derived(page.status === 404);

  // Signed-in users get the app as the way out; everyone else gets sign-in
  // (the login page routes authed users home anyway). A failed session read
  // (API unreachable) reads as signed-out — the safe default.
  let signedIn = $state(false);
  $effect(() => {
    let live = true;
    fetchAuthUser()
      .then((user) => {
        if (live) signedIn = user !== null;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  });

  const primaryHref = $derived(signedIn ? "/" : "/login");
  const primaryLabel = $derived(signedIn ? "Go to your tasks" : "Sign in");
</script>

<svelte:head>
  <title>{notFound ? "Page not found" : "Something went wrong"} · ActionAmp</title>
</svelte:head>

<div class="aa-auth">
  <div class="aa-auth-card">
    <div class="aa-auth-mark" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="white"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <h1 class="aa-auth-title">{notFound ? "Page not found" : "Something went wrong"}</h1>
    <p class="aa-auth-subtitle">
      {#if notFound}
        This page doesn't exist — it may have moved, or the bookmark may be out of date.
      {:else}
        An unexpected error occurred. Start again from the beginning.
      {/if}
    </p>

    <a class="aa-auth-submit err-cta" href={primaryHref}>{primaryLabel}</a>

    {#if notFound && !signedIn}
      <a class="err-secondary" href="/signup">New here? Start free</a>
    {:else if !notFound}
      <button class="err-secondary" type="button" onclick={() => window.location.reload()}>
        Reload this page
      </button>
    {/if}

    <!-- The quiet diagnostic: which path 404ed, so a report is actionable. -->
    <p class="err-path">{page.url.pathname}</p>
    {#if !notFound && page.error?.message && import.meta.env.DEV}
      <p class="err-detail">{page.error.message}</p>
    {/if}
  </div>
</div>

<style>
  .err-cta {
    display: block;
    text-align: center;
    text-decoration: none;
    margin-top: var(--aa-space-xl);
  }

  .err-secondary {
    display: block;
    margin-top: var(--aa-space-md);
    background: none;
    border: none;
    padding: 0;
    width: 100%;
    text-align: center;
    font: inherit;
    font-size: var(--aa-text-base);
    font-weight: var(--aa-weight-medium);
    color: var(--aa-teal-cta);
    text-decoration: none;
    cursor: pointer;
  }

  .err-secondary:hover {
    color: var(--aa-teal-cta-hover);
    text-decoration: underline;
  }

  .err-path {
    margin: var(--aa-space-lg) 0 0;
    text-align: center;
    font-family: var(--aa-font-mono);
    font-size: var(--aa-text-xs);
    color: var(--aa-text-4);
    word-break: break-all;
  }

  .err-detail {
    margin: var(--aa-space-sm) 0 0;
    text-align: center;
    font-size: var(--aa-text-sm);
    line-height: var(--aa-leading-snug);
    color: var(--aa-rose-text);
    word-break: break-word;
  }
</style>
