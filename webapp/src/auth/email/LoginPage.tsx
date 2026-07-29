import { FormEvent, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { setSessionId } from "wasp/client/api";
import {
  prepareDevAutologin,
  requestMagicLogin,
  verifyMagicLogin,
} from "wasp/client/operations";
import { AuthLayout } from "../../components/ui";

const DEFAULT_DEV_EMAIL = "zeljko@dakic.com";

export function LoginPage() {
  const { data: user, status: authStatus } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [searchParams] = useSearchParams();
  const devEmail = searchParams.get("devEmail");
  const showDevAutologin = import.meta.env.DEV;

  async function finishLogin(sessionId: string) {
    setSessionId(sessionId);
    window.history.replaceState({}, "", "/login");
    window.location.assign("/app");
  }

  async function devAutologin(localEmail: string) {
    setIsSubmitting(true);
    setStatus(`Logging in ${localEmail}...`);
    setError(null);
    try {
      const credentials = await prepareDevAutologin({ email: localEmail });
      // Keep the local shortcut on Wasp's standard route; it is development-only.
      const { login } = await import("wasp/client/auth");
      await login(credentials);
      window.location.assign("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not autologin.");
      setStatus(null);
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (showDevAutologin && devEmail) void devAutologin(devEmail);
  }, [devEmail, showDevAutologin]);

  useEffect(() => {
    const token = searchParams.get("magic");
    if (!token) return;
    setIsSubmitting(true);
    setStatus("Signing you in...");
    setError(null);
    void verifyMagicLogin({ token })
      .then(({ sessionId }) => finishLogin(sessionId))
      .catch((err) => {
        window.history.replaceState({}, "", "/login");
        setStatus(null);
        setError(err instanceof Error ? err.message : "That sign-in link is no longer valid.");
        setIsSubmitting(false);
      });
  }, [searchParams]);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setStatus("Sending your sign-in email...");
    try {
      await requestMagicLogin({ email });
      setCodeSent(true);
      setStatus(import.meta.env.DEV
        ? "Local code: 111111"
        : "Check your email for a code or sign-in link.");
      setIsSubmitting(false);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not send email. Try again.");
      setIsSubmitting(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setStatus("Signing you in...");
    try {
      const { sessionId } = await verifyMagicLogin({ email, code });
      await finishLogin(sessionId);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not sign you in.");
      setIsSubmitting(false);
    }
  }

  if (authStatus !== "loading" && user) return <Navigate to="/app" replace />;

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="We’ll email a code. No password needed."
      footer={
        <>
          <span>
            See our <a href="https://actionamp.com/terms">Terms</a> and{" "}
            <a href="https://actionamp.com/privacy">Privacy Policy</a>.
          </span>
          <span className="aa-auth-version">v{__APP_VERSION__}</span>
        </>
      }
    >
      <form className="aa-auth-form" onSubmit={codeSent ? submitCode : requestCode}>
        <label className="aa-auth-label" htmlFor="magic-email">Email</label>
        <input
          className="aa-auth-input"
          id="magic-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
          required
        />
        {codeSent && (
          <>
            <label className="aa-auth-label" htmlFor="magic-code">Six-digit code</label>
            <input
              className="aa-auth-input"
              id="magic-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={isSubmitting}
              required
              autoFocus
            />
          </>
        )}
        <button className="aa-auth-submit" type="submit" disabled={isSubmitting}>
          {codeSent ? "Sign in" : "Email me a code"}
        </button>
      </form>
      {status && <p className="aa-auth-status">{status}</p>}
      {error && <p className="aa-auth-error">{error}</p>}
      {showDevAutologin && (
        <div className="aa-auth-dev">
          <div className="aa-auth-dev__label">Local dev</div>
          <button
            type="button"
            className="aa-auth-dev__button"
            disabled={isSubmitting}
            onClick={() => void devAutologin(DEFAULT_DEV_EMAIL)}
          >
            Autologin {DEFAULT_DEV_EMAIL}
          </button>
          <p className="aa-auth-dev__hint">Use <code>/login?devEmail=name@example.com</code> for any local user.</p>
        </div>
      )}
    </AuthLayout>
  );
}
