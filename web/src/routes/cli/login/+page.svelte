<script lang="ts">
  // /cli/login — the OAuth-style authorization page for the CLI (the
  // CliLoginPage port). Reached when a user runs `actionamp login`: the CLI
  // has spun up a localhost callback server and opened the browser here with
  // ?callback=…&state=….
  //
  // Explicit consent is the CSRF gate: a malicious site can embed a
  // `callback=` pointing at its own server, but it cannot get the user to
  // click Confirm on this real ActionAmp page without their action. Only
  // http://localhost:<port> callbacks are accepted — rejecting anything else
  // closes the "exfiltrate to a remote server via a crafted callback=" link.
  // Missing/malformed params refuse to render the confirm UI entirely (never
  // silently default — the CLI always supplies both).
  import { onMount } from "svelte";
  import { fetchAuthUser, mintCliToken, type AuthUser } from "../../../lib/auth";
  import "../../../lib/styles/auth.css";

  /** Read + validate the callback/state query params. */
  function readParams(): { callback: URL; state: string } | null {
    const params = new URLSearchParams(window.location.search);
    const callbackRaw = params.get("callback");
    const state = params.get("state");
    if (!callbackRaw || !state) return null;
    try {
      const callback = new URL(callbackRaw);
      if (callback.protocol !== "http:" || callback.hostname !== "localhost")
        return null;
      return { callback, state };
    } catch {
      return null;
    }
  }

  /**
   * Auto-generate a label for the CLI token: the User-Agent Client Hints
   * platform when available (Chromium), else "this device". Human-facing
   * only (Settings → Access tokens); never parsed.
   */
  function autoLabel(): string {
    const ua = navigator as Navigator & { userAgentData?: { platform?: string } };
    return `CLI on ${ua.userAgentData?.platform ?? "this device"}`;
  }

  let user = $state<AuthUser | null>(null);
  let userResolved = $state(false);
  let status = $state<"idle" | "working" | "done">("idle");
  let error = $state<string | null>(null);

  // Params are browser-only (window.location) — read after mount (SPA, ssr off).
  let params = $state<{ callback: URL; state: string } | null>(null);

  onMount(async () => {
    params = readParams();
    const me = await fetchAuthUser();
    userResolved = true;
    if (me) {
      user = me;
    } else {
      // Wasp's authRequired bounce, hand-rolled: to /login and back here
      // after auth, preserving this page's full query (callback/state).
      const here = window.location.pathname + window.location.search;
      window.location.replace(
        `/login?returnTo=${encodeURIComponent(here)}`,
      );
    }
  });

  async function authorize(): Promise<void> {
    if (!params || !user) return;
    status = "working";
    error = null;
    try {
      const issued = await mintCliToken({ label: autoLabel() });
      const target = new URL(params.callback);
      target.searchParams.set("token", issued.token);
      target.searchParams.set("state", params.state);
      status = "done";
      window.location.href = target.toString();
    } catch (err) {
      status = "idle";
      error =
        err instanceof Error && err.message
          ? err.message
          : "Could not authorize. Try again.";
    }
  }
</script>

<style>
  /* Global hide — consent renders bare, like the other auth screens. */
  :global(.shell-lens) {
    display: none;
  }
  .aa-cli-login {
    max-width: 26rem;
    margin: 0 auto;
    padding: var(--aa-space-4xl) var(--aa-space-lg);
  }
  .aa-cli-login h1 {
    font-size: var(--aa-text-xl);
    font-weight: var(--aa-weight-bold);
    margin: 0 0 var(--aa-space-md);
  }
  .aa-cli-login p {
    line-height: var(--aa-leading-snug);
    color: var(--aa-text-2);
    margin: 0 0 var(--aa-space-md);
  }
  .aa-cli-login__muted {
    color: var(--aa-text-3);
    font-size: var(--aa-text-sm);
  }
  .aa-cli-login__error {
    color: var(--aa-rose-text);
  }
  .aa-cli-login__success {
    color: var(--aa-teal-cta);
  }
  .aa-cli-login button {
    border: 0;
    border-radius: var(--aa-radius-sm);
    padding: 11px 14px;
    background: var(--aa-teal-cta);
    color: white;
    cursor: pointer;
    font-weight: var(--aa-weight-semibold);
    font-size: var(--aa-text-base);
  }
  .aa-cli-login button:hover:not(:disabled) {
    background: var(--aa-teal-cta-hover);
  }
  .aa-cli-login button:disabled {
    cursor: wait;
    opacity: 0.65;
  }
</style>

<div class="aa-cli-login">
  <h1>Authorize ActionAmp CLI</h1>
  {#if !params}
    <p class="aa-cli-login__error">
      This link is missing required parameters. Run <code>actionamp login</code>
      from your terminal to start again.
    </p>
  {:else if !userResolved || !user}
    <p class="aa-cli-login__muted">Waiting for sign-in…</p>
  {:else}
    <p>
      An application on <strong>{autoLabel()}</strong> is requesting access
      to your ActionAmp account.
    </p>
    <p class="aa-cli-login__muted">
      Signed in as <strong>{user.email}</strong>. Authorizing creates a
      personal access token the CLI will use to read your tasks and capture
      to your inbox. You can revoke it any time from Settings → Access
      tokens.
    </p>

    {#if !user.entitled}
      <p class="aa-cli-login__error">
        CLI and API access are included with Pro. Upgrade from Settings →
        Billing, then run this command again.
      </p>
    {:else if status === "done"}
      <p class="aa-cli-login__success">Authorized. You can close this tab.</p>
    {:else}
      <button onclick={() => void authorize()} disabled={status === "working"}>
        {status === "working" ? "Authorizing" : "Authorize"}
      </button>
    {/if}

    {#if error}<p class="aa-cli-login__error">{error}</p>{/if}
  {/if}
</div>
