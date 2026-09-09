<!--
  AdminLayout — the route-level browser gate. The shared app shell owns
  navigation, including the admin-only group below Review; this layout owns
  only loading, redirect, and the calm access-denied state. Server gates on
  every admin operation remain the real boundary.
-->
<script lang="ts">
  import "../../lib/styles/admin.css";
  import { goto } from "$app/navigation";
  import { admin } from "../../lib/stores/admin.svelte";

  let { children } = $props();

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

</script>

{#if loading}
  <!-- Calm while resolving: render nothing (webapp parity). -->
{:else if !user}
  <!-- Navigating to /login; render nothing in the meantime. -->
{:else if !user.isAdmin}
  <div class="aa-admin-denied">
    <h1>Admin access required.</h1>
    <p>This area is only available to ActionAmp administrators.</p>
    <a href="/">Back to Next</a>
  </div>
{:else}
  <main class="aa-admin-content">
    {@render children()}
  </main>
{/if}
