<!--
  OnboardingGate — the S13 first-run gate, ported from webapp/src/App.tsx
  (packages/contract/src/s13-onboarding/README.md §1).

  An authed user with `hasSeenOnboarding === false` on the app home ("/" —
  this stack's What Now screen; "/do*" once the /do move composes) is
  redirected to /welcome exactly once per account. Scoped to the app home
  ONLY — never yanks an un-onboarded user off /founding-100, /welcome, or any
  future public path. Skips while the status read is still resolving, and
  goes inert without a session (401) — the webapp gate ran under the auth
  provider; here 401 is the "not applicable" answer.

  WIRING (shared file, additive): mounted once from the root +layout.svelte —
  the webapp kept this logic in App.tsx, its equivalent spot. See
  docs/plans/slices/s13-s15-wiring.md §3.

  This component also fires the once-per-session `ensureOnboarded` bootstrap
  (the webapp's AppShell call) once the status read proves a session.
-->
<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onboarding } from "../stores/onboarding.svelte";

  // The app home: "/" today (this stack's What Now screen; the webapp's /do),
  // plus exact "/do" for when that move composes. Deliberately NOT the whole
  // /do subtree — the webapp ran the bootstrap from AppShell on every /do*
  // route, but firing on deep links (e.g. /do/settings) seeds the General
  // projects under fixtures that predate onboarding; a fresh session always
  // passes the home, which is where the bootstrap belongs (wiring doc §3).
  const isAppHome = $derived(
    // "/do" doesn't exist as a route yet: pathname is typed as the union of
    // real routes, so the cast is what keeps the future branch compilable
    // (the webapp's home path, ready for the /do move).
    $page.url.pathname === "/" || $page.url.pathname === ("/do" as string),
  );

  $effect(() => {
    // Kick the status read as soon as the shell mounts (any route).
    void onboarding.load();
  });

  $effect(() => {
    if (!isAppHome) return;
    // Resolving (or unauthed) → do nothing; public behavior unchanged.
    if (!onboarding.resolved || onboarding.unauthenticated) return;
    if (onboarding.status?.hasSeenOnboarding === false) {
      // First-run: bounce to the carousel BEFORE any shell bootstrap — the
      // webapp's gate rendered <Navigate> instead of AppShell, so
      // ensureOnboarded did not fire pre-completion (and the sample-task seed
      // waits for the post-completion pass, stage=SAMPLE_TASK by then).
      void goto("/welcome", { replaceState: true });
    } else if (onboarding.status?.hasSeenOnboarding === true) {
      // App-shell bootstrap (the webapp AppShell call): default lenses +
      // General projects for every user, the sample task when the stage asks.
      // Idempotent server-side; once per session client-side.
      onboarding.ensureOnboarded();
    }
  });
</script>
