---
feature: observability-minimal
status: ready
spec_owner: discover
build_owner: build
---

# Feature: Minimal observability (the one funnel number)

## Summary

Add the smallest possible analytics layer so we can measure the single number
that matters right now: **of unique landing-page visitors, what fraction reach
the checkout page?** Today there is no analytics at all — every GTM decision
is a guess. This spec adds one privacy-respecting tracker, instruments the
four funnel steps (land → signup → app-first-open → checkout), and nothing
else. No dashboards, no per-event spam, no user tracking beyond the funnel.

## Why

ROADMAP.md §"The one number to define before anything else": until the
visitor→checkout rate is measurable, we cannot tell whether the product or the
audience is the problem. The free-tier audit found no analytics wired.
Defining the funnel is what lets every later decision (move the price? build
focus-engine-v2? launch on Product Hunt?) be evidence-based instead of vibes.
"Minimal" is the point: the temptation is to instrument everything; the value
is in instrumenting the four steps that decide the business.

## Done-conditions

- [ ] **One analytics provider is chosen and wired.** PostHog (self-hostable,
      privacy-respecting, free tier) OR Plausible — Discover's lean is
      **Plausible** for the calm/privacy brand fit (no cookies, no PII), but
      Build may pick PostHog if its React integration is materially simpler.
      State the choice + reason in the review. The snippet loads on every page
      (public + app) via a single inclusion point (the Wasp `head` array in
      `main.wasp.ts`, or `App.tsx`).
- [ ] **The four funnel events are emitted**, nothing more:
      1. `landing_view` — fired on `/` load.
      2. `signup_complete` — fired on successful auth (email or Google).
      3. `app_first_open` — fired once per user on first `/app` load (guarded
         by the `hasSeenOnboarding` flag or a one-time localStorage stamp so
         it's not double-counted).
      4. `checkout_started` — fired when the user opens the Stripe checkout
         URL (the redirect from `createCheckoutSession`).
- [ ] **Events are no-PII.** No task content, no email, no names — only the
      event name + an anonymous id. Verified: a grep of the new code shows no
      user/email/content fields passed to the tracker.
- [ ] **A cookie banner / consent is added only if legally required.** Lean:
      Plausible needs none (cookieless); PostHog may. Build decides based on
      the chosen provider; if a banner is needed, keep it to one line and
      default to "on" where legal (PRODUCT.md bans manipulation, but a calm
      opt-out is not manipulation).
- [ ] **Prod env var is set.** The provider's site key / domain is in Railway
      service vars (not committed). Document the var name in the review.
- [ ] **The funnel is visible in the provider's UI.** Build confirms (screenshot
      or described steps) that the four events appear as a funnel in the
      PostHog/Plausible dashboard after a test run.
- [ ] **Dev is excluded.** Analytics does not fire on `localhost` (guard on
      `import.meta.env.DEV` or `WASP_WEB_CLIENT_URL` origin) so dev sessions
      don't pollute the funnel.
- [ ] **`wasp compile` passes. No new tests strictly required** (analytics is
      side-effect-only; a unit test asserting "dev does not track" is nice-to-
      have, not a gate).

## Non-goals

- **No session recording, no heatmaps.** Privacy + cost; not needed yet.
- **No per-feature event tracking** (e.g. "task completed", "triage
  dispatched"). Those come later, only if the top funnel is healthy.
- **No custom dashboard.** The provider's default funnel view is enough.
- **No A/B testing infra.**
- **No server-side error tracking / Sentry.** Separate concern; defer.
- **No identifying users across devices.** Anonymous funnel only.

## Open questions

- **Plausible vs PostHog.** Discover leans Plausible (brand fit, cookieless,
  simpler). Build: pick whichever wires cleanly in <1hr; state the reason.
- **Self-host vs SaaS.** Lean SaaS for both (free tier covers early volume);
  self-host only if cost or privacy demands it post-launch.

## Prototypes

_(none — snippet + 4 event calls; no UI to validate.)_
