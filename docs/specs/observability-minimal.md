---
feature: observability-minimal
status: ready
gated_by: gtm-analytics-account.md     # provider pick + site creation (user-owned)
spec_owner: discover
build_owner: build
priority: P3
kind: spec

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mgsby      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:45:22Z
---

# Feature: Minimal observability (the one funnel number)

> **Status: `ready`, provider unblocked.** StatCounter was selected and the
> `actionamp.com` project created on 2026-08-03. Its base tracker is installed
> on the production marketing site and app; the four explicit funnel events
> below remain to be implemented.

## Summary

Add the smallest possible anonymous acquisition layer so we can measure the
single number that matters right now: **of unique landing-page visitors, what
fraction reach checkout?** StatCounter owns this browser-level view. The
first-party event ledger, known-user activity, retention cohorts, and Growth
dashboard are explicitly owned by `growth-analytics`.

## Why

ROADMAP.md §"The one number to define before anything else": until the
visitor→checkout rate is measurable, we cannot tell whether the product or the
audience is the problem. The free-tier audit found no analytics wired.
Defining the funnel is what lets every later decision (move the price? build
focus-engine-v2? launch on Product Hunt?) be evidence-based instead of vibes.
"Minimal" is the point: the temptation is to instrument everything; the value
is in instrumenting the four steps that decide the business.

## Done-conditions

- [x] **One analytics provider is chosen and wired.** StatCounter was selected
      for its visitor journeys, session replay, and heatmaps. The production
      snippet loads on the Astro marketing site and the Wasp app, while local
      development is excluded. Record any consent or privacy-policy changes
      required for this provider before public distribution.
- [x] **The four anonymous funnel events are emitted** to StatCounter:
      1. `landing_view` — fired on `/` load.
      2. `signup_complete` — fired on successful auth (email or Google).
      3. `app_first_open` — fired once per user on first `/app` load (guarded
         by the `hasSeenOnboarding` flag or a one-time localStorage stamp so
         it's not double-counted).
      4. `checkout_started` — fired when the user opens the Stripe checkout
         URL (the redirect from `createCheckoutSession`).
- [x] **Events and tags are no-PII.** No task content, email, name, or user ID
      is passed to StatCounter. The allowed tags are `event`, `surface`,
      `plan`, and `landing_variant`; account-linked records belong to
      `growth-analytics` in the first-party database.
- [ ] **A cookie banner / consent is added only if legally required.** Assess
      StatCounter's data collection against the jurisdictions we serve. If a
      banner is required, keep it to one line and provide a calm opt-out.
- [x] **Production tracker is configured.** StatCounter project `13339807` is
      committed as the public browser snippet; no server-side key is needed.
- [ ] **The funnel is visible in the provider's UI.** Confirm that StatCounter
      can display the four selected conversion steps after a production test,
      or document the smallest complementary reporting method needed.
- [x] **Dev is excluded.** Analytics does not fire on `localhost` (guarded by
      `import.meta.env.PROD` in Astro and `import.meta.env.DEV` in the Wasp
      client) so development sessions do not pollute production reporting.
- [ ] **`wasp compile` passes. No new tests strictly required** (analytics is
      side-effect-only; a unit test asserting "dev does not track" is nice-to-
      have, not a gate).

## Non-goals

- **No session recording, no heatmaps.** Privacy + cost; not needed yet.
- **No first-party per-feature event tracking** (e.g. "task completed", "triage
  dispatched"). Those belong to `growth-analytics`.
- **No custom dashboard.** The provider's default funnel view is enough here;
  the internal Growth dashboard belongs to `growth-analytics`.
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
