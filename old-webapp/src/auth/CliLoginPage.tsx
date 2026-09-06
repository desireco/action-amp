import { useState } from "react";
import { useAuth } from "wasp/client/auth";
import { mintCliToken } from "wasp/client/operations";
import { PublicLayout } from "../shared/PublicLayout";
import { Button } from "../components/ui";
import { useEntitled } from "../billing/useEntitled";
import "./CliLoginPage.css";

/**
 * /cli/login — the OAuth-style authorization page for the CLI.
 *
 * Reached when a user runs `actionamp login`. The CLI has spun up a localhost
 * callback server and opened the browser here with `?callback=…&state=…`.
 * If the user isn't logged in, Wasp redirects to /login and back here after
 * auth (the `authRequired: true` route pattern from Founding100Page).
 *
 * The page shows explicit consent ("Authorize ActionAmp CLI?") with the
 * requested label, then on click mints an ApiKey via the existing session-
 * authed /api/pat/issue route and redirects the browser to the callback with
 * the plaintext token + echoed state. The CLI's localhost server receives
 * it, validates state, and stores the token.
 *
 * Explicit consent is the CSRF gate: a malicious site can embed a `callback=`
 * pointing at its own server, but it cannot get the user to click Confirm on
 * this real ActionAmp page without their action.
 *
 * See docs/specs/cli-package.md §"The OAuth login flow".
 */

/**
 * Read + validate the callback/state query params. Returns null if either is
 * missing or malformed — the page refuses to mint without a valid callback
 * target (never silently default; the CLI always supplies both).
 */
function readParams(): { callback: URL; state: string } | null {
  const params = new URLSearchParams(window.location.search);
  const callbackRaw = params.get("callback");
  const state = params.get("state");
  if (!callbackRaw || !state) return null;
  try {
    const callback = new URL(callbackRaw);
    // Only allow http://localhost:<port> callbacks. The CLI listens on
    // localhost; rejecting anything else closes the "exfiltrate to a remote
    // server via a crafted callback=" link.
    if (callback.protocol !== "http:" || callback.hostname !== "localhost")
      return null;
    return { callback, state };
  } catch {
    return null;
  }
}

/**
 * Auto-generate a label for the CLI token. Uses the User-Agent Client Hints
 * platform when available (Chromium), else "this device". The label is
 * human-facing only (shown in Settings → Access tokens); it's never parsed.
 */
function autoLabel(): string {
  // SAFETY: userAgentData (Chromium's structured UA) is not in the DOM lib
  // types yet; the optional chain degrades to the default elsewhere.
  const ua = navigator as Navigator & { userAgentData?: { platform?: string } };
  return `CLI on ${ua.userAgentData?.platform ?? "this device"}`;
}

export function CliLoginPage() {
  const { data: user } = useAuth();
  const entitled = useEntitled();
  const params = readParams();
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function authorize() {
    if (!params || !user) return;
    setStatus("working");
    setError(null);
    try {
      // Mint via the Wasp action (goes through /operations/* where CORS +
      // credentials are properly configured; the custom /api/pat/issue route
      // has a CORS preflight gap for cross-origin browser calls).
      const issued = await mintCliToken({ label: autoLabel() });

      // Redirect the browser to the CLI's localhost callback with the token
      // + the echoed state (the CLI validates state matches before storing).
      const target = new URL(params.callback);
      target.searchParams.set("token", issued.token);
      target.searchParams.set("state", params.state);
      setStatus("done");
      window.location.href = target.toString();
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Could not authorize. Try again.",
      );
    }
  }

  // Missing/malformed params — refuse to proceed. Don't render the confirm UI;
  // a page that mints without a valid callback would be a token-exfil vector.
  if (!params) {
    return (
      <PublicLayout>
        <div className="aa-cli-login">
          <h1>Authorize ActionAmp CLI</h1>
          <p className="aa-cli-login__error">
            This link is missing required parameters. Run{" "}
            <code>actionamp login</code> from your terminal to start again.
          </p>
        </div>
      </PublicLayout>
    );
  }

  // Wasp's authRequired should guarantee a user, but guard anyway — if the
  // redirect-back-after-auth hasn't completed, show a calm waiting state.
  if (!user) {
    return (
      <PublicLayout>
        <div className="aa-cli-login">
          <h1>Authorize ActionAmp CLI</h1>
          <p className="aa-cli-login__muted">Waiting for sign-in…</p>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="aa-cli-login">
        <h1>Authorize ActionAmp CLI</h1>
        <p>
          An application on <strong>{autoLabel()}</strong> is requesting access
          to your ActionAmp account.
        </p>
        <p className="aa-cli-login__muted">
          Signed in as{" "}
          <strong>{user.identities?.email?.id ?? user.fullName}</strong>.
          Authorizing creates a personal access token the CLI will use to read
          your tasks and capture to your inbox. You can revoke it any time from
          Settings → Access tokens.
        </p>

        {!entitled ? (
          <p className="aa-cli-login__error">
            CLI and API access are included with Pro. Upgrade from Settings →
            Billing, then run this command again.
          </p>
        ) : status === "done" ? (
          <p className="aa-cli-login__success">
            Authorized. You can close this tab.
          </p>
        ) : (
          <Button
            variant="primary"
            onClick={() => void authorize()}
            disabled={status === "working"}
          >
            {status === "working" ? "Authorizing" : "Authorize"}
          </Button>
        )}

        {error && <p className="aa-cli-login__error">{error}</p>}
      </div>
    </PublicLayout>
  );
}
