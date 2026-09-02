<script lang="ts">
  // AuthCard — the AuthLayout port (webapp/src/components/ui/AuthLayout.tsx):
  // full-screen calm stage wrapping a single centered card — brand mark,
  // on-voice headline, the auth form body, optional footer links. ONLY for
  // unauthenticated entry screens (login, signup); authenticated surfaces use
  // the app shell. Styles live in lib/styles/auth.css (the AuthLayout.css
  // port, global classes so the route pages share them).
  import "../../styles/auth.css";
  import type { Snippet } from "svelte";

  let {
    title,
    subtitle = undefined,
    children,
    footer = undefined,
  }: {
    title: string;
    subtitle?: string;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

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
    <h1 class="aa-auth-title">{title}</h1>
    {#if subtitle}<p class="aa-auth-subtitle">{subtitle}</p>{/if}
    {@render children()}
    {#if footer}
      <div class="aa-auth-footer">{@render footer()}</div>
    {/if}
  </div>
</div>
