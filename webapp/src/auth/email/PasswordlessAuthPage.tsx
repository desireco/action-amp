import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import { setSessionId } from "wasp/client/api";
import {
  prepareDevAutologin,
  requestMagicLogin,
  verifyMagicLogin,
} from "wasp/client/operations";
import { AuthLayout, SplashScreen } from "../../components/ui";
import { safeAuthReturnTo } from "../returnTo";
import { trackAnalyticsEvent } from "../../analytics/tracking";
import { trackStatCounterEvent } from "../../analytics/StatCounter";

const DEFAULT_DEV_EMAIL = "zeljko@dakic.com";

type PasswordlessAuthPageProps = {
  mode: "login" | "signup";
  footer: ReactNode;
  showDevAutologin?: boolean;
};

/**
 * Shared passwordless email flow for `/login` and `/signup`.
 *
 * Both routes intentionally use the same server operations: verifying a code
 * signs in an existing identity or creates a new one. The route only changes
 * the framing, so a public "Start free" CTA can remain creation-oriented
 * without reintroducing Wasp's password-based SignupForm.
 */
export function PasswordlessAuthPage({
  mode,
  footer,
  showDevAutologin = false,
}: PasswordlessAuthPageProps) {
  const { data: user, status: authStatus } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [searchParams] = useSearchParams();
  const devEmail = searchParams.get("devEmail");
  const returnTo = safeAuthReturnTo(searchParams.get("returnTo"));
  const canDevAutologin = showDevAutologin && import.meta.env.DEV;

  async function finishLogin(sessionId: string) {
    setSessionId(sessionId);
    if (mode === "signup") {
      trackAnalyticsEvent({ name: "SIGNUP_COMPLETED", route: "/signup", metadata: { surface: "signup" } });
      trackStatCounterEvent("signup_complete", "signup");
    }
    window.location.assign(returnTo);
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
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not autologin.");
      setStatus(null);
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (canDevAutologin && devEmail) void devAutologin(devEmail);
  }, [devEmail, canDevAutologin]);

  useEffect(() => {
    const token = searchParams.get("magic");
    if (!token) return;
    setIsSubmitting(true);
    setStatus("Signing you in...");
    setError(null);
    void verifyMagicLogin({ token })
      .then(({ sessionId }) => finishLogin(sessionId))
      .catch((err) => {
        const cleanParams = new URLSearchParams(searchParams);
        cleanParams.delete("magic");
        const cleanQuery = cleanParams.toString();
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`,
        );
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
      await requestMagicLogin({ email, returnTo });
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

  if (authStatus !== "loading" && user) return <Navigate to={returnTo} replace />;

  const initialTitle = mode === "signup" ? "Start free." : "Welcome back.";
  const initialSubtitle = mode === "signup"
    ? "We’ll email a code to create your account. No password needed."
    : "We’ll email a code. No password needed.";

  return (
    <>
      {/* Welcome veil while the session is being checked: returning users
          would otherwise see the form flash before the redirect to /app.
          Stays mounted so it fades out over the form for everyone else. */}
      <SplashScreen active={authStatus === "loading"} />
      <AuthLayout
        title={codeSent ? "Enter your code." : initialTitle}
        subtitle={codeSent
          ? `We sent a six-digit code and a sign-in link to ${email}. Enter the code here, or use the link to continue.`
          : initialSubtitle}
        footer={footer}
      >
      <form className="aa-auth-form" onSubmit={codeSent ? submitCode : requestCode}>
        {codeSent ? (
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
        ) : (
          <>
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
          </>
        )}
        <button className="aa-auth-submit" type="submit" disabled={isSubmitting}>
          {codeSent
            ? "Continue"
            : mode === "signup"
              ? "Continue with email"
              : "Email me a code"}
        </button>
      </form>
      {status && <p className="aa-auth-status">{status}</p>}
      {error && <p className="aa-auth-error">{error}</p>}
      {canDevAutologin && (
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
    </>
  );
}
