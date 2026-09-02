<script lang="ts">
  // SettingsLayout — shared shell for the settings sub-routes, ported from
  // webapp/src/app/SettingsLayout.tsx: back link "Next" → /do, h1, and the
  // sub-nav tabs (Account · Billing · Preferences · Lenses · Access tokens).
  // "Account" is exact-match active; the rest prefix-match. Billing and
  // Access tokens are stub links until S16/S18 compose their surfaces.
  import { page } from "$app/state";
  import "../../../lib/styles/settings.css";

  let { children } = $props();

  const TABS = [
    { label: "Account", to: "/do/settings", exact: true },
    { label: "Billing", to: "/do/settings/billing", exact: false },
    { label: "Preferences", to: "/do/settings/preferences", exact: false },
    { label: "Lenses", to: "/do/settings/lenses", exact: false },
    { label: "Access tokens", to: "/do/settings/pat", exact: false },
  ];
</script>

<div class="aa-settings-hub">
  <a class="aa-settings-back" href="/do">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10 3l-5 5 5 5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    Next
  </a>

  <h1 class="aa-settings-h">Settings</h1>

  <nav class="aa-settings-tabs" aria-label="Settings">
    {#each TABS as tab (tab.to)}
      {@const active = tab.exact
        ? page.url.pathname === tab.to
        : page.url.pathname.startsWith(tab.to)}
      <a
        href={tab.to}
        class="aa-settings-tab {active ? "active" : ""}"
        aria-current={active ? "page" : undefined}
      >
        {tab.label}
      </a>
    {/each}
  </nav>

  <div class="aa-settings-body">
    {@render children()}
  </div>
</div>
