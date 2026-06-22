import { PublicLayout } from "../shared/PublicLayout";
import { Button } from "../components/ui";
import "./Founding100Page.css";

/**
 * /founding-100 — the Founding 100 landing page.
 *
 * A one-time $139 lifetime Pro tier, capped at exactly 100 spots. The CTA is
 * disabled until checkout + the 100-spot cap enforcement are wired (price ID
 * in env, count check in the checkout action). See docs/PRICING.md §3 Model C.
 */
export function Founding100Page() {
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
          {/* Disabled until checkout + 100-spot cap enforcement are wired. */}
          <Button variant="primary" size="lg" disabled>
            Secure Your Lifetime Spot for $139
          </Button>
          <p className="aa-founding-spots">
            {/* ponytail: static 100 while CTA is disabled; becomes a live count when checkout is wired. */}
            100 spots remaining. When they are gone, they are gone.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
