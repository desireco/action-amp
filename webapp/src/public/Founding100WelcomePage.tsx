import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "wasp/client/auth";
import { useQuery, getFounding100Status } from "wasp/client/operations";
import { PublicLayout } from "../shared/PublicLayout";
import { Button } from "../components/ui";
import "./Founding100Page.css";

/**
 * /founding-100/welcome — the thank-you page founders land on after paying.
 *
 * Stripe redirects here from Checkout (success_url). The webhook that actually
 * grants plan=FOUNDER may fire a few seconds after the redirect, so we poll
 * useAuth().refetch until the plan flips, then show the celebration.
 *
 * Auth required: a founder must be logged in to have paid. If the webhook
 * hasn't landed within ~45s we stop polling and surface a "check back" state —
 * the webhook is still the source of truth and will catch up; we don't fake it.
 */
const POLL_MS = 2000;
const POLL_MAX_MS = 45000;

export function Founding100WelcomePage() {
  const { data: user, refetch } = useAuth();
  const { data: status } = useQuery(getFounding100Status);
  const [timedOut, setTimedOut] = useState(false);
  const startRef = useRef<number>(Date.now());

  const isFounder = user?.plan === "FOUNDER";

  // Poll auth until the webhook flips plan to FOUNDER, or we time out.
  // ponytail: refetch-on-interval; the webhook is truth, this just reflects it.
  useEffect(() => {
    if (isFounder || timedOut) return;
    const id = setInterval(() => {
      refetch();
      if (Date.now() - startRef.current > POLL_MAX_MS) {
        setTimedOut(true);
        clearInterval(id);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isFounder, timedOut, refetch]);

  // Member number = how many founders exist now (they're one of them).
  const memberNumber = status?.claimed;

  return (
    <PublicLayout>
      <div className="aa-founding aa-markdown-body aa-founding-welcome">
        {isFounder ? (
          <Congratulations memberNumber={memberNumber} />
        ) : timedOut ? (
          <StillConfirming />
        ) : (
          <Finalizing />
        )}
      </div>
    </PublicLayout>
  );
}

/* ============================================================
   States
   ============================================================ */

function Congratulations({ memberNumber }: { memberNumber: number | undefined }) {
  return (
    <>
      <h1>Welcome, Founding Member.</h1>
      <p className="aa-founding-sub">
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

      <div className="aa-founding-cta">
        <Link to="/app">
          <Button variant="primary" size="lg">
            See your Next
          </Button>
        </Link>
        <p className="aa-founding-spots">Thank you, genuinely, for the bet.</p>
      </div>
    </>
  );
}

function Finalizing() {
  return (
    <div className="aa-founding-pending">
      <h1>Finalizing your membership…</h1>
      <p className="aa-founding-sub">This usually takes a few seconds.</p>
      <p>
        Your payment went through. We're confirming your lifetime access with
        our systems — hang tight.
      </p>
      <div className="aa-founding-cta">
        <span className="aa-founding-spots">Do not close this page.</span>
      </div>
    </div>
  );
}

function StillConfirming() {
  return (
    <div className="aa-founding-pending">
      <h1>Thanks for your patience.</h1>
      <p className="aa-founding-sub">We're still confirming your membership.</p>
      <p>
        Your payment succeeded, but our system is taking longer than usual to
        reflect it. Don't worry — your lifetime access is secure and will appear
        shortly. No action needed on your part.
      </p>
      <div className="aa-founding-cta">
        <Link to="/app">
          <Button variant="secondary" size="lg">
            Continue to the app
          </Button>
        </Link>
        <p className="aa-founding-spots">
          Your Founding Member status will be there within a few minutes. If it
          isn't within an hour,{" "}
          <Link to="/about">reach out</Link> and we'll sort it.
        </p>
      </div>
    </div>
  );
}
