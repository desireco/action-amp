import { Link } from "react-router";
import type { ReactNode } from "react";
import "./ProGate.css";

/**
 * <ProGate> — the shared paywall-moment surface.
 *
 * Every free-tier cap (project cap, goal cap, the Work lens, future gates)
 * renders through this one component so the tone never drifts and there's one
 * place to tune upgrade copy. Per the spec's load-bearing design principle:
 * every limit a FREE user hits is a paywall moment — calm, specific, honest;
 * not a hard error, not a red dot, not a guilt trip.
 *
 * Two shapes:
 *   1. Inline panel (default) — the main-area surface for the Work lens gate
 *      and the post-402 fallback. Renders a short "{feature} is a Pro feature"
 *      line, a one-sentence {reason}, and upgrade links.
 *   2. Trigger (asTrigger) — the create affordance at the cap, rendered as a
 *      button-like control ("Upgrade for more projects →") instead of a dead
 *      "New project" button. Clicking opens the panel via the parent's state.
 *
 * No modals, no urgency tricks (PRODUCT.md). Links: primary → billing settings,
 * secondary → the Founding 100 page. Same pair every time.
 *
 * Future Pro features (command palette, search, energy tags) reuse this same
 * component with their own {feature}/{reason} — that's the point.
 */
interface ProGateProps {
  /** What they tried, in the "a 4th project" / "the Work lens" shape. */
  feature: string;
  /** One calm sentence on what Pro unlocks. */
  reason: string;
  /** Render as a trigger control (the at-cap create affordance) instead of the
   * inline panel. The parent toggles a panel on click. */
  asTrigger?: boolean;
  /** Optional className for layout sizing. */
  className?: string;
  /** Children to render inside the trigger (defaults to upgrade copy). */
  children?: ReactNode;
}

export function ProGate({
  feature,
  reason,
  asTrigger = false,
  className = "",
  children,
}: ProGateProps) {
  if (asTrigger) {
    return (
      <Link
        to="/do/settings/billing"
        className={`aa-progate-trigger ${className}`}
        title={`${feature} is a Pro feature`}
      >
        {children ?? (
          <>
            <span className="aa-progate-trigger__label">{feature}</span>
            <span className="aa-progate-trigger__cta">Upgrade →</span>
          </>
        )}
      </Link>
    );
  }

  return (
    <div className={`aa-progate ${className}`}>
      <p className="aa-progate__feature">
        <span className="aa-progate__lock" aria-hidden="true">⌃</span>
        {feature} is a Pro feature.
      </p>
      <p className="aa-progate__reason">{reason}</p>
      <div className="aa-progate__actions">
        <Link to="/do/settings/billing" className="aa-progate__primary">
          See plans
        </Link>
        <Link to="/founding-100" className="aa-progate__secondary">
          Founding 100 · $99 lifetime
        </Link>
      </div>
    </div>
  );
}
