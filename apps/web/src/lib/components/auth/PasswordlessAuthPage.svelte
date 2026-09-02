<script lang="ts">
  // PasswordlessAuthPage — the S10 port of webapp/src/auth/email/
  // PasswordlessAuthPage.tsx. Shared passwordless email flow for /login and
  // /signup: both routes use the same server operations — verifying a code
  // signs in an existing identity or creates a new one. The route only
  // changes the framing (mode prop), so the public "Start free" CTA stays
  // creation-oriented. Copy, input attributes, statuses, and the dev
  // autologin panel are string-for-string parity.
  //
  // Transport deviation (wiring note §3): the webapp called Wasp ops and
  // kept the session id in localStorage; here the same-named ops are REST
  // calls (lib/auth) and the session is the httpOnly wasp_session cookie the
  // API stamps. Redirect after verify stays a hard window.location.assign.
  import { page } from "$app/stores";
  import { tick } from "svelte";
  import AuthCard from "./AuthCard.svelte";
  import {
    devAutologin,
    fetchAuthUser,
    requestMagicLogin,
    safeAuthReturnTo,
    verifyMagicLogin,
  } from "../../auth";
  import type { Snippet } from "svelte";

  const DEFAULT_DEV_EMAIL = "zeljko@dakic.com";

  let {
    mode,
    showDevAutologin = false,
    footer,
  }: {
    mode: "login" | "signup";
    showDevAutologin?: boolean;
    footer: Snippet;
  } = $props();

  const canDevAutologin = $derived(showDevAutologin && import.meta.env.DEV);

  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let isSubmitting = $state(false);
  let email = $state("");
  let code = $state("");
  let codeSent = $state(false);
  // The session check's veil (the SplashScreen role): returning users never
  // see the form flash before the redirect.
  let checking = $state(true);
  let codeInput: HTMLInputElement | undefined = $state();
  let authConsumed = false;
  let magicConsumed = false;
  let devConsumed = false;

  const returnTo = $derived(safeAuthReturnTo($page.url.searchParams.get("returnTo")));
  const devEmail = $derived($page.url.searchParams.get("devEmail"));
  const magicToken = $derived($page.url.searchParams.get("magic"));

  function message(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback;
  }

  function finishLogin(sessionId: string): void {
    // The session is the stamped cookie; the sessionId return stays part of
    // the Wasp-compat contract. Hard navigation (NOT router) — webapp parity.
    void sessionId;
    window.location.assign(returnTo);
  }

  async function runDevAutologin(localEmail: string): Promise<void> {
    isSubmitting = true;
    status = `Logging in ${localEmail}...`;
    error = null;
    try {
      await devAutologin(localEmail);
      window.location.assign(returnTo);
    } catch (err) {
      error = message(err, "Could not autologin.");
      status = null;
      isSubmitting = false;
    }
  }

  async function requestCode(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    isSubmitting = true;
    error = null;
    status = "Sending your sign-in email...";
    try {
      await requestMagicLogin({ email, returnTo });
      codeSent = true;
      status = import.meta.env.DEV
        ? "Local code: 111111"
        : "Check your email for a code or sign-in link.";
      isSubmitting = false;
      await tick();
      codeInput?.focus();
    } catch (err) {
      status = null;
      error = message(err, "Could not send email. Try again.");
      isSubmitting = false;
    }
  }

  async function submitCode(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    isSubmitting = true;
    error = null;
    status = "Signing you in...";
    try {
      const { sessionId } = await verifyMagicLogin({ email, code });
      finishLogin(sessionId);
    } catch (err) {
      status = null;
      error = message(err, "Could not sign you in.");
      isSubmitting = false;
    }
  }

  function onCodeInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    // Digits only, max six — the webapp's onChange filter.
    code = target.value.replace(/\D/g, "").slice(0, 6);
  }

  // Already-authenticated visit → returnTo (the webapp's Navigate replace).
  $effect(() => {
    if (authConsumed) return;
    authConsumed = true;
    void fetchAuthUser().then((user) => {
      if (user) {
        window.location.replace(returnTo);
        return;
      }
      checking = false;
    });
  });

  // Magic link auto-verify: ?magic=<token> present → sign in; on failure the
  // magic param is stripped and the error shows.
  $effect(() => {
    const token = magicToken;
    if (!token || magicConsumed) return;
    magicConsumed = true;
    isSubmitting = true;
    status = "Signing you in...";
    error = null;
    verifyMagicLogin({ token })
      .then(({ sessionId }) => finishLogin(sessionId))
      .catch((err) => {
        const cleanParams = new URLSearchParams($page.url.searchParams);
        cleanParams.delete("magic");
        const cleanQuery = cleanParams.toString();
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`,
        );
        status = null;
        error = message(err, "That sign-in link is no longer valid.");
        isSubmitting = false;
      });
  });

  // Dev autologin: /login?devEmail=<email> (dev builds only; the API route
  // hard-gates NODE_ENV=development and 404s otherwise).
  $effect(() => {
    const local = devEmail;
    if (!canDevAutologin || !local || devConsumed) return;
    devConsumed = true;
    void runDevAutologin(local);
  });
</script>

<!-- The auth pages render bare: no shell chrome (the webapp's auth routes
     sat outside the app shell). -->
<style>
  /* Global hide — this component only mounts on auth screens. */
  :global(.shell-lens) {
    display: none;
  }
</style>

<!-- Welcome veil while the session is being checked (the SplashScreen role). -->
{#if checking}
  <div class="aa-auth-splash" aria-hidden="true">
    <div class="aa-auth-mark">
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
  </div>
{/if}

<AuthCard
  title={codeSent ? "Enter your code." : mode === "signup" ? "Start free." : "Welcome back."}
  subtitle={
    codeSent
      ? `We sent a six-digit code and a sign-in link to ${email}. Enter the code here, or use the link to continue.`
      : mode === "signup"
        ? "We’ll email a code to create your account. No password needed."
        : "We’ll email a code. No password needed."
  }
  {footer}
>
  <form class="aa-auth-form" onsubmit={codeSent ? submitCode : requestCode}>
    {#if codeSent}
      <label class="aa-auth-label" for="magic-code">Six-digit code</label>
      <input
        class="aa-auth-input"
        id="magic-code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern={"[0-9]{6}"}
        maxlength={6}
        bind:value={code}
        oninput={onCodeInput}
        bind:this={codeInput}
        disabled={isSubmitting}
        required
      />
    {:else}
      <label class="aa-auth-label" for="magic-email">Email</label>
      <input
        class="aa-auth-input"
        id="magic-email"
        type="email"
        autocomplete="email"
        bind:value={email}
        disabled={isSubmitting}
        required
      />
    {/if}
    <button class="aa-auth-submit" type="submit" disabled={isSubmitting}>
      {codeSent
        ? "Continue"
        : mode === "signup"
          ? "Continue with email"
          : "Email me a code"}
    </button>
  </form>
  {#if status}<p class="aa-auth-status">{status}</p>{/if}
  {#if error}<p class="aa-auth-error">{error}</p>{/if}
  {#if canDevAutologin}
    <div class="aa-auth-dev">
      <div class="aa-auth-dev__label">Local dev</div>
      <button
        type="button"
        class="aa-auth-dev__button"
        disabled={isSubmitting}
        onclick={() => void runDevAutologin(DEFAULT_DEV_EMAIL)}
      >
        Autologin {DEFAULT_DEV_EMAIL}
      </button>
      <p class="aa-auth-dev__hint">
        Use <code>/login?devEmail=name@example.com</code> for any local user.
      </p>
    </div>
  {/if}
</AuthCard>
