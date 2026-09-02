<!--
  Founding100Page — S15 port of webapp/src/public/Founding100Page.tsx (same
  look; Founding100Page.css is the webapp file). /founding-100 is PUBLIC so
  logged-out visitors can read the offer.

  The live spots-remaining count comes from the founding-100 status query;
  while undefined the page shows the static fallback copy. The CTA handles
  auth (server op gated on context.user — this client guard is UX, not
  security): anonymous → /login?returnTo=%2Ffounding-100 (preserving intent
  through code entry + magic-link return); authed → checkout.

  WIRING NOTE (S16 — DONE): the authed CTA calls `createCheckoutSession({
  priceKey: "founder" })` and redirects to the returned Stripe URL; the 409
  at the public cap renders as the inline error (the server guard is the one
  place that matters). CHECKOUT_STARTED still fires before the money path.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PublicLayout from "../../lib/components/PublicLayout.svelte";
  import { publicStore, trackFunnelEvent } from "../../lib/stores/public.svelte";
  import { prefs } from "../../lib/stores/prefs.svelte";
  import { billing } from "../../lib/stores/billing.svelte";
  import "../../lib/styles/founding100.css";

  let loading = $state(false);
  let error = $state<string | null>(null);

  const status = $derived(publicStore.founding100Status);
  const remaining = $derived(status?.remaining);
  const isFull = $derived(status?.isFull ?? false);
  const alreadyFounder = $derived(prefs.account?.plan === "FOUNDER");
  // Webapp parity: `!user` — while the account read resolves, the anonymous
  // branch shows (the CTA recovers to the right state once it lands).
  const isAnonymous = $derived(!prefs.account);

  onMount(() => {
    void publicStore.loadFounding100Status();
    // Public page: a 401 just means "anonymous visitor" (account stays null).
    void prefs.loadAccount();
  });

  // CTA copy + state by situation
  let ctaLabel = $derived(
    isFull
      ? "All 100 spots claimed"
      : alreadyFounder
        ? "You're a Founding Member"
        : isAnonymous
          ? "Log in to Claim Your Spot"
          : "Secure Your Lifetime Spot for $99",
  );
  let ctaDisabled = $derived(isFull || alreadyFounder || loading);

  async function handleCheckout() {
    // Preserve purchase intent through code entry and emailed magic links.
    if (isAnonymous) {
      window.location.assign("/login?returnTo=%2Ffounding-100");
      return;
    }
    error = null;
    // Funnel event BEFORE the money path (webapp fired it on redirect).
    trackFunnelEvent("CHECKOUT_STARTED", { surface: "founding" });
    loading = true;
    try {
      // S16: the real checkout — the store redirects to the hosted Stripe
      // session; the server 409s at the public cap (98) before any Stripe
      // call, so the catch below renders the honest full-cap state.
      await billing.checkout("founder");
    } catch (err) {
      error =
        err instanceof Error ? err.message : "Could not open checkout.";
      loading = false;
    }
  }
</script>

<PublicLayout>
  <div class="aa-founding aa-markdown-body">
    <header class="aa-founding-intro">
      <p class="aa-founding-eyebrow">The Founding 100</p>
      <h1>Pro for the long run. One payment.</h1>
      <p class="aa-founding-sub">
        A small early-member group with lifetime Pro and a direct line to the people building ActionAmp.
      </p>
    </header>

    <section class="aa-founding-offer" aria-label="Founding membership offer">
      <div class="aa-founding-price">
        <span>$99</span>
        <strong>once</strong>
      </div>
      <p class="aa-founding-price-note">Regular Pro is $79.50 per year.</p>
      <p class="aa-founding-comparison">$19.50 more than year one. Breaks even after about 15 months.</p>

      <h2>What you get</h2>
      <ul class="aa-founding-includes">
        <li>Unlimited projects, goals, and Logbook history</li>
        <li>Work, personal, and custom Lenses</li>
        <li>Command palette, search, and multi-device sync</li>
        <li>Every future Pro feature, with no renewal</li>
        <li>A direct line for feedback and product input</li>
      </ul>

      <div class="aa-founding-cta">
        {#if error}<p class="aa-founding-error">{error}</p>{/if}
        <button
          class="aa-btn aa-btn--primary aa-btn--lg"
          onclick={handleCheckout}
          disabled={ctaDisabled}
        >
          {loading ? "Opening checkout…" : ctaLabel}
        </button>
        <p class="aa-founding-spots">
          {#if isFull}
            All public Founding memberships are claimed.
          {:else if remaining !== undefined}
            <strong>{remaining}</strong> public memberships remaining. Two spots are reserved for launch partners.
          {:else}
            98 public memberships available. Two spots are reserved for launch partners.
          {/if}
        </p>
        <p class="aa-founding-free">
          Not ready for Pro? <a href="/signup">Start with Free instead</a> — no card required.
        </p>
      </div>
    </section>

    <section class="aa-founding-details" aria-label="Founding membership details">
      <h2>A direct line, not a ticket queue</h2>
      <p>
        Founding members are a small cohort close to the product. Your feedback reaches the people making decisions,
        and the early input helps set the direction.
      </p>

      <h2>Why only 100</h2>
      <p>
        Lifetime access needs a hard limit to keep ActionAmp sustainable. The cap is fixed: once the 100th membership
        is claimed, this option retires.
      </p>

      <h2>What “lifetime” means</h2>
      <p>
        You keep Pro for as long as ActionAmp exists. There is no recurring fee, no renewal date, and future paid
        features are included.
      </p>

      <h2>The trade-off</h2>
      <p>
        This is an early product and a one-time purchase, not a subscription with an annual exit point. The membership
        helps fund the work now; in return, you get permanent Pro access while the service operates.
      </p>
      {#if alreadyFounder}
        <p class="aa-founding-spots">Thank you — you claimed one of the 100.</p>
      {/if}
      <p class="aa-founding-spots">
        <a href="https://actionamp.com/roadmap">See the product roadmap</a>
      </p>
    </section>
  </div>
</PublicLayout>
