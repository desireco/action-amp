<!--
  AdminLayout — the S17 workspace boundary, ported from webapp/src/admin/
  AdminLayout.tsx. Gate order: loading → render nothing; no user → /login;
  !user.isAdmin → the calm "Admin access required." panel (never a crash);
  otherwise the rail nav (Overview · Activity · Users · Funnel · Feedback).
  The server gate on every admin op is the real boundary — this is the
  browser half of it.
-->
<script lang="ts">
  import "../../../lib/styles/admin.css";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { admin } from "../../../lib/stores/admin.svelte";

  let { children } = $props();

  const NAV = [
    { label: "Overview", to: "/do/admin/overview", end: true },
    { label: "Activity", to: "/do/admin/activity", end: false },
    { label: "Users", to: "/do/admin/users", end: false },
    { label: "Funnel", to: "/do/admin/funnel", end: false },
    { label: "Feedback", to: "/do/admin/feedback", end: false },
  ];

  // Kick the session read once; the layout reacts to it below.
  $effect(() => {
    void admin.loadUser();
  });

  const user = $derived(admin.user);
  const loading = $derived(admin.userLoading);

  // No user at all → the login redirect (webapp <Navigate to="/login">).
  $effect(() => {
    if (!loading && !user) void goto("/login", { replaceState: true });
  });

  const isActive = (item: (typeof NAV)[number]) =>
    item.end
      ? page.url.pathname === item.to
      : page.url.pathname.startsWith(item.to);
</script>

{#if loading}
  <!-- Calm while resolving: render nothing (webapp parity). -->
{:else if !user}
  <!-- Navigating to /login; render nothing in the meantime. -->
{:else if !user.isAdmin}
  <div class="aa-admin-denied">
    <h1>Admin access required.</h1>
    <p>This area is only available to ActionAmp administrators.</p>
    <a href="/do">Back to Next</a>
  </div>
{:else}
  <div class="aa-admin-workspace">
    <aside class="aa-admin-rail">
      <a class="aa-admin-brand" href="/do" aria-label="Back to ActionAmp">
        <span class="aa-admin-brand__mark">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 13L13 3M13 3H6M13 3v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span>ActionAmp</span>
      </a>
      <div class="aa-admin-rail__title">Admin</div>
      <nav class="aa-admin-nav" aria-label="Admin">
        {#each NAV as item (item.to)}
          <a
            class="aa-admin-nav__item {isActive(item) ? "active" : ""}"
            aria-current={isActive(item) ? "page" : undefined}
            href={item.to}
          >
            {item.label}
          </a>
        {/each}
      </nav>
      <div class="aa-admin-rail__footer">
        <span>Internal workspace</span>
        <span>{user.fullName}</span>
      </div>
    </aside>
    <div class="aa-admin-main">
      <header class="aa-admin-mobile-head">
        <a class="aa-admin-mobile-brand" href="/do">
          <span class="aa-admin-brand__mark">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 13L13 3M13 3H6M13 3v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span>Admin</span>
        </a>
        <a class="aa-admin-back" href="/do">Back to Next</a>
      </header>
      <nav class="aa-admin-mobile-nav" aria-label="Admin">
        {#each NAV as item (item.to)}
          <a class={isActive(item) ? "active" : ""} href={item.to}>{item.label}</a>
        {/each}
      </nav>
      <main class="aa-admin-content">
        {@render children()}
      </main>
    </div>
  </div>
{/if}
