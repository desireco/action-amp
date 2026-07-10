import { useState } from "react";
import { useAuth } from "wasp/client/auth";
import { useQuery, createCheckoutSession, getFounding100Status } from "wasp/client/operations";
import { PublicLayout } from "../shared/PublicLayout";
import { Button } from "../components/ui";
import "./Founding100Page.css";

/**
 * /founding-100 — the Founding 100 landing page (auth-required).
 *
 * A one-time $99 lifetime Pro tier, capped at exactly 100 spots. The live
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
  let ctaLabel = "Secure Your Lifetime Spot for $99";
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
        <p className="aa-founding-sub">Lifetime Pro, capped at 100 spots.</p>

        <p>
          ActionAmp is being built in the open, and we wanted a way to make
          that real for the people who show up at the start.
        </p>
        <p>
          The Founding 100 is a one-time tier — <strong>$99, lifetime Pro</strong>
          {" "}— for the first hundred people who claim a spot. When the hundred
          are gone, the tier retires for good. No countdown timer, no fake
          scarcity. Just a fixed number, in public, that goes down as people
          claim it.
        </p>

        <h2>What lifetime Pro means</h2>
        <p>
          Everything in Pro, for as long as ActionAmp exists, for the one-time
          price. No recurring fee, no renewal. If we add paid features later,
          Founding members get them. The bet is that the people who back the
          project early are the ones worth keeping close, and that treating
          them as long-term is cheaper than the churn math of chasing them
          again next year.
        </p>

        <h2>Why capped at 100</h2>
        <p>
          Because lifetime plans are dangerous for software businesses. A hard
          100-spot cap funds launch momentum without compromising long-term
          health. Once the 100th spot is claimed, the tier is permanently
          retired.
        </p>
        <p>
          100 is also small enough that we can mean it when we say we'll listen.
          Founding members get a direct line — feedback that reaches the people
          building, not a ticket queue. That's the real thing being offered: a
          small, early cohort whose input shapes the product.
        </p>

        <p>
          No pressure, no urgency theater. If it's right for you and the timing
          is right, claim a spot. If not, the free tier isn't going anywhere.
          This is for the people who want to be in early and want that to mean
          something.
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
