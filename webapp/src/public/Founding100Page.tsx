import { useState } from "react";
import { useAuth } from "wasp/client/auth";
import { useQuery, createCheckoutSession, getFounding100Status } from "wasp/client/operations";
import { PublicLayout } from "../shared/PublicLayout";
import { trackStatCounterEvent } from "../analytics/StatCounter";
import { Button } from "../components/ui";
import "./Founding100Page.css";

/**
 * /founding-100 — the Founding 100 landing page (public).
 *
 * A one-time $99 lifetime Pro tier, capped at exactly 100 spots. The live
 * spots-remaining count comes from getFounding100Status; the CTA is enabled
 * while spots remain. Once full, the button locks and the page says so.
 *
 * The route is public (authRequired: false in main.wasp.ts) so logged-out
 * visitors can read the offer — it's linked from PublicLayout and ProGate aimed
 * at exactly that audience. Auth is handled at the CTA: an anonymous clicker is
 * sent to /login with this offer as the validated return path; an authed
 * clicker starts Stripe Checkout. The server op
 * createCheckoutSession gates on context.user, so this client guard is UX, not
 * security.
 */
export function Founding100Page() {
  const { data: user } = useAuth();
  const { data: status } = useQuery(getFounding100Status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = status?.remaining;
  const isFull = status?.isFull ?? false;
  const alreadyFounder = user?.plan === "FOUNDER";
  const isAnonymous = !user;

  async function handleCheckout() {
    // Preserve purchase intent through code entry and emailed magic links.
    if (isAnonymous) {
      window.location.assign("/login?returnTo=%2Ffounding-100");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await createCheckoutSession({ priceKey: "founder" });
      if (result.url) {
        trackStatCounterEvent("checkout_started", "founding", "founder");
        window.location.href = result.url;
      }
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
  } else if (isAnonymous) {
    ctaLabel = "Log in to Claim Your Spot";
  }

  return (
    <PublicLayout>
      <div className="aa-founding aa-markdown-body">
        <header className="aa-founding-intro">
          <p className="aa-founding-eyebrow">The Founding 100</p>
          <h1>Pro for the long run. One payment.</h1>
          <p className="aa-founding-sub">
            A small early-member group with lifetime Pro and a direct line to the people building ActionAmp.
          </p>
        </header>

        <section className="aa-founding-offer" aria-label="Founding membership offer">
          <div className="aa-founding-price">
            <span>$99</span>
            <strong>once</strong>
          </div>
          <p className="aa-founding-price-note">Regular Pro is $79.50 per year.</p>
          <p className="aa-founding-comparison">$19.50 more than year one. Breaks even after about 15 months.</p>

          <h2>What you get</h2>
          <ul className="aa-founding-includes">
            <li>Unlimited projects, goals, and Logbook history</li>
            <li>Work, personal, and custom Lenses</li>
            <li>Command palette, search, and multi-device sync</li>
            <li>Every future Pro feature, with no renewal</li>
            <li>A direct line for feedback and product input</li>
          </ul>

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
                <strong>{remaining}</strong> of 100 spots remaining.
              </>
            ) : (
              "100 spots remaining. When they are gone, they are gone."
            )}
          </p>
          <p className="aa-founding-free">
            Not ready for Pro? <a href="/signup">Start with Free instead</a> — no card required.
          </p>
          </div>
        </section>

        <section className="aa-founding-details" aria-label="Founding membership details">
          <h2>A direct line, not a ticket queue</h2>
          <p>
            Founding members are a small cohort close to the product. Your feedback reaches the people making decisions,
            and the early input helps set the direction.
          </p>

          <h2>Why only 100</h2>
          <p>
            Lifetime access needs a hard limit to keep ActionAmp sustainable. The cap is fixed: once the 100th membership
            is claimed, this option retires.
          </p>

          <h2>What “lifetime” means</h2>
          <p>
            You keep Pro for as long as ActionAmp exists. There is no recurring fee, no renewal date, and future paid
            features are included.
          </p>

          <h2>The trade-off</h2>
          <p>
            This is an early product and a one-time purchase, not a subscription with an annual exit point. The membership
            helps fund the work now; in return, you get permanent Pro access while the service operates.
          </p>
          {alreadyFounder && (
            <p className="aa-founding-spots">
              Thank you — you claimed one of the 100.
            </p>
          )}
          <p className="aa-founding-spots">
            <a href="https://actionamp.com/roadmap">See the product roadmap</a>
          </p>
        </section>
      </div>
    </PublicLayout>
  );
}
