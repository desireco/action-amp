import { useState } from "react";
import { useAuth } from "wasp/client/auth";
import { useQuery, createCheckoutSession, getFounding100Status } from "wasp/client/operations";
import { PublicLayout } from "../shared/PublicLayout";
import { Button } from "../components/ui";
import "./Founding100Page.css";

/**
 * /founding-100 — the Founding 100 landing page (auth-required).
 *
 * A one-time $139 lifetime Pro tier, capped at exactly 100 spots. The live
 * spots-remaining count comes from getFounding100Status; the CTA is enabled
 * while spots remain. Once full, the button locks and the page says so.
 *
 * Auth is required at the route level (main.wasp.ts) — checkout needs a user
 * (createCheckoutSession is gated on context.user), so there's no point showing
 * this page to anonymous visitors. Wasp redirects them to /login and back here
 * after auth.
 */
export function Founding100Page() {
  const { data: user } = useAuth();
  const { data: status } = useQuery(getFounding100Status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = status?.remaining;
  const isFull = status?.isFull ?? false;
  const alreadyFounder = user?.plan === "FOUNDER";

  async function handleCheckout() {
    setError(null);
    setLoading(true);
    try {
      const result = await createCheckoutSession({ priceKey: "founder" });
      if (result.url) window.location.href = result.url;
    } catch (err) {
      console.error("Checkout error:", err);
      setError(
        err instanceof Error ? err.message : "Could not start checkout. Try again."
      );
      setLoading(false);
    }
  }

  // CTA copy + state by situation
  let ctaLabel = "Secure Your Lifetime Spot for $139";
  let ctaDisabled = loading;
  if (isFull) {
    ctaLabel = "All 100 spots claimed";
    ctaDisabled = true;
  } else if (alreadyFounder) {
    ctaLabel = "You're a Founding Member";
    ctaDisabled = true;
  }

  return (
    <PublicLayout>
      <div className="aa-founding aa-markdown-body">
        <h1>The Founding 100</h1>
        <p className="aa-founding-sub">Lifetime access, capped at 100 spots.</p>

        <p>
          Building a tool for calm, intentional focus requires a calm,
          intentional business model.
        </p>
        <p>
          From day one, the goal has been to build software that respects your
          attention and your time. That means no selling data, no venture
          capital dictating our roadmap, and no race-to-the-bottom feature
          bloat. Just a sustainable, bootstrapped system designed to help you
          organize your life at scale.
        </p>
        <p>Next week, Pro rolls out to the public at $79.50 per year.</p>
        <p>
          But before we open the doors, I want to invite our earliest believers
          to help lay the foundation.
        </p>
        <p>
          Today, I am opening exactly <strong>100 Founding Member spots</strong>.
        </p>
        <p>
          For a single payment of <strong>$139</strong>, you get lifetime access
          to Pro. No subscriptions, no renewals. It pays for itself in less than
          two years, and you will own the platform for as long as it exists.
        </p>

        <h2>Why 100 spots?</h2>
        <p>
          Because lifetime plans are notoriously dangerous for software
          companies. Capping this at exactly 100 spots gives us the initial
          launch momentum to fund development, without compromising the
          long-term health of the business.
        </p>
        <p>
          Once the 100th spot is claimed, the Founding tier will be permanently
          retired, and Pro will exclusively be a yearly subscription.
        </p>
        <p>
          You aren't just buying software; you are becoming a patron of the
          platform. You are giving us the independence to keep this tool fast,
          focused, and quiet.
        </p>
        <p>
          If you are ready to build a better system for your work and life, I'd
          be honored to have you as one of the 100.
        </p>

        <div className="aa-founding-cta">
          {error && <p className="aa-founding-error">{error}</p>}
          <Button variant="primary" size="lg" onClick={handleCheckout} disabled={ctaDisabled}>
            {loading ? "Opening checkout…" : ctaLabel}
          </Button>
          <p className="aa-founding-spots">
            {isFull ? (
              "The Founding 100 is full. Thank you."
            ) : remaining !== undefined ? (
              <>
                <strong>{remaining}</strong> of 100 spots remaining.{" "}
                {user
                  ? ""
                  : "Log in to claim one."}
              </>
            ) : (
              "100 spots remaining. When they are gone, they are gone."
            )}
          </p>
          {alreadyFounder && (
            <p className="aa-founding-spots">
              Thank you — you claimed one of the 100.
            </p>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
