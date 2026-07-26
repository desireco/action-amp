import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { LoginForm, login, useAuth } from "wasp/client/auth";
import { prepareDevAutologin } from "wasp/client/operations";
import { AuthLayout } from "../../components/ui";
import { aaAuthAppearance } from "../appearance";
// GoogleButton import omitted while Google auth is disabled — see main.wasp.ts.

const DEFAULT_DEV_EMAIL = "zeljko@dakic.com";

export function LoginPage() {
  const { data: user, status: authStatus } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const devEmail = searchParams.get("devEmail");
  const showDevAutologin = import.meta.env.DEV;

  async function devAutologin(email: string) {
    setStatus(`Logging in ${email}...`);
    setError(null);
    try {
      const credentials = await prepareDevAutologin({ email });
      await login(credentials);
      window.location.assign("/app");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not autologin.";
      setError(message);
      setStatus(null);
    }
  }

  useEffect(() => {
    if (showDevAutologin && devEmail) {
      void devAutologin(devEmail);
    }
  }, [devEmail, showDevAutologin]);

  // A logged-in user hitting /login (browser back, stale bookmark, the dev
  // autologin just finished) should go straight to the app, not see the form.
  // Wait for the session to resolve first (authStatus !== 'loading') so an
  // initial anonymous render doesn't flash the form before redirecting.
  if (authStatus !== "loading" && user) {
    return <Navigate to="/app" replace />;
  }

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Pick up where you left off."
      footer={
        <>
          <span>
            New to ActionAmp? <Link to="/signup">Make an account</Link>
          </span>
          <span>
            Forgot your password?{" "}
            <Link to="/request-password-reset">Reset it</Link>
          </span>
          <span>
            See our <a href="https://actionamp.com/terms">Terms</a> and{" "}
            <a href="https://actionamp.com/privacy">Privacy Policy</a>.
          </span>
          <span className="aa-auth-version">v{__APP_VERSION__}</span>
        </>
      }
    >
      {showDevAutologin && (
        <div className="aa-auth-dev">
          <div className="aa-auth-dev__label">Local dev</div>
          <Link
            to={`/login?devEmail=${encodeURIComponent(DEFAULT_DEV_EMAIL)}`}
            className="aa-auth-dev__button"
            aria-disabled={!!status}
          >
            Autologin {DEFAULT_DEV_EMAIL}
          </Link>
          <p className="aa-auth-dev__hint">
            Use <code>/login?devEmail=name@example.com</code> for any local user.
          </p>
          {status && <p className="aa-auth-dev__status">{status}</p>}
          {error && <p className="aa-auth-dev__error">{error}</p>}
        </div>
      )}
      <LoginForm {...aaAuthAppearance} />
    </AuthLayout>
  );
}
