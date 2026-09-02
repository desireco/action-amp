<!--
  Founding100WelcomePage — S15 port of webapp/src/public/Founding100WelcomePage.tsx
  (same look). /founding-100/welcome — the thank-you page founders land on
  from Stripe Checkout's success_url.

  The webhook that actually grants plan=FOUNDER may fire a few seconds after
  the redirect, so the page polls the account read every 2s for up to 45s
  until the plan flips, then shows the celebration. The webhook is the source
  of truth; the poll just reflects it — on timeout the page says so rather
  than faking success, and a revisit shows the right state.

  Auth required: a founder must be logged in to have paid.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import PublicLayout from "../../../lib/components/PublicLayout.svelte";
  import { publicStore } from "../../../lib/stores/public.svelte";
  import { prefs } from "../../../lib/stores/prefs.svelte";
  import "../../../lib/styles/founding100.css";

  const POLL_MS = 2000;
  const POLL_MAX_MS = 45000;

  let timedOut = $state(false);
  const start = Date.now();

  const isFounder = $derived(prefs.account?.plan === "FOUNDER");
  // Member number = how many founders exist now (they're one of them).
  const memberNumber = $derived(publicStore.founding100Status?.claimed);

  onMount(() => {
    void prefs.loadAccount();
    void publicStore.loadFounding100Status();
  });

  // Poll auth until the webhook flips plan to FOUNDER, or we time out.
  // ponytail: refetch-on-interval; the webhook is truth, this just reflects it.
  const poll = setInterval(() => {
    if (isFounder || timedOut) return;
    void prefs.loadAccount();
    if (Date.now() - start > POLL_MAX_MS) timedOut = true;
  }, POLL_MS);
  onDestroy(() => clearInterval(poll));
</script>

<PublicLayout>
  <div class="aa-founding aa-markdown-body aa-founding-welcome">
    {#if isFounder}
      <h1>Welcome, Founding Member.</h1>
      <p class="aa-founding-sub">
        {memberNumber
          ? `You are member #${memberNumber} of 100.`
          : "You are one of the 100."}
      </p>

      <p>
        Thank you. You just did something rare: you paid once, for keeps, to a
        tool that will never charge you again. That's the whole point of the
        Founding 100 — a small group of people who believed early enough that we
        could build this without a subscription treadmill underneath it.
      </p>
      <p>
        Your <strong>lifetime Pro access</strong> is active now. Unlimited
        projects, goals, and lenses. The full focus engine. Everything we ship
        from here on out, for as long as ActionAmp exists.
      </p>

      <h2>What happens next</h2>
      <ul>
        <li>A receipt is on its way from Stripe to your inbox.</li>
        <li>
          Your account already reflects <strong>Founding Member</strong> status —
          you'll see it in Settings → Billing.
        </li>
        <li>
          No renewals, no cancellation, no surprises. Ever.
        </li>
      </ul>

      <p>
        When the 100th spot is taken, this tier disappears for good. You'll be
        one of the people who made it possible.
      </p>

      <div class="aa-founding-cta">
        <a href="/" class="aa-btn aa-btn--primary aa-btn--lg">See your Next</a>
        <p class="aa-founding-spots">Thank you, genuinely, for the bet.</p>
        <p class="aa-founding-spots">
          <a href="https://actionamp.com/roadmap">See how we're doing →</a>
        </p>
      </div>
    {:else if timedOut}
      <div class="aa-founding-pending">
        <h1>Thanks for your patience.</h1>
        <p class="aa-founding-sub">We're still confirming your membership.</p>
        <p>
          Your payment succeeded, but our system is taking longer than usual to
          reflect it. Don't worry — your lifetime access is secure and will appear
          shortly. No action needed on your part.
        </p>
        <div class="aa-founding-cta">
          <a href="/" class="aa-btn aa-btn--secondary aa-btn--lg">
            Continue to the app
          </a>
          <p class="aa-founding-spots">
            Your Founding Member status will be there within a few minutes. If it
            isn't within an hour,{" "}
            <a href="https://actionamp.com/about">reach out</a> and we'll sort it.
          </p>
        </div>
      </div>
    {:else}
      <div class="aa-founding-pending">
        <h1>Finalizing your membership…</h1>
        <p class="aa-founding-sub">This usually takes a few seconds.</p>
        <p>
          Your payment went through. We're confirming your lifetime access with
          our systems — hang tight.
        </p>
        <div class="aa-founding-cta">
          <span class="aa-founding-spots">Do not close this page.</span>
        </div>
      </div>
    {/if}
  </div>
</PublicLayout>
