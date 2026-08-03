---
id: growth-analytics
kind: spec
title: "First-party growth analytics and admin dashboard"
status: ready
priority: P1
feature: growth-analytics
spec_owner: discover
build_owner: build
created: 2026-08-03
---

# Spec: First-party growth analytics and admin dashboard

## Summary

Add a first-party, admin-only growth analytics layer. It records anonymous
sessions before signup, connects a session to an account after signup, and
records a small typed set of product and commercial events. The existing
StatCounter installation remains the acquisition and visitor-path tool; it
receives anonymous event/context tags only. ActionAmp's database is the source
of truth for identified user timelines, activation, retention, payments, and
the internal Growth dashboard.

## Why

The team needs to answer concrete launch questions without turning StatCounter
into the customer database:

- Which referrers, UTM campaigns, and landing pages lead to Founding 100 views,
  checkout starts, and confirmed payments?
- Which new accounts reach their first capture and first triage?
- Where does a person stop in the journey from landing to payment?
- Which signed-in users need product support because they started but never
  completed the core loop?

StatCounter supports visitor paths, exit links, conversion goals, and custom
tags, but its own guidance prohibits storing personal data in those tags. Its
anonymous reporting therefore complements—not replaces—first-party records.

## Decisions locked

1. **Two layers, one source of truth.** StatCounter is anonymous acquisition
   reporting. The database owns account-linked activity and payment facts.
2. **No generic tag editor.** Events are a typed enum with validated metadata;
   source/campaign dimensions are explicit fields. This prevents an unqueryable
   pile of ad-hoc tags.
3. **Anonymous-to-known connection.** A random first-party visitor ID lives in
   a first-party cookie. A session may have `userId = null`; after signup, new
   sessions link to the signed-in account. Existing anonymous session history
   is linked only when that browser completes signup.
4. **No raw task content in analytics.** Track actions and entity IDs/counts,
   not titles, descriptions, context, outcomes, or inbox content. The product
   database already stores the source content when needed for support.
5. **Source personalization is manual and measured.** Capture UTM/referrer and
   an optional `landingVariant`; do not auto-personalize. A human configures a
   source-specific landing variant only after reviewing a meaningful cohort,
   and the variant exposure is recorded.
6. **Admin-only.** Growth data, individual timelines, and source attribution
   are available only to `User.isAdmin` accounts and are never exposed in the
   customer UI or CLI.

## Event contract

The v1 enum is deliberately bounded:

```text
LANDING_VIEW             PRICING_VIEW              FOUNDING_VIEW
SIGNUP_STARTED           SIGNUP_COMPLETED          APP_OPENED
ONBOARDING_COMPLETED     CAPTURE_CREATED           TRIAGE_COMPLETED
FOCUS_STARTED            TASK_COMPLETED            CHECKOUT_STARTED
PAYMENT_CONFIRMED        LANDING_VARIANT_VIEWED
```

Every event records `occurredAt`, `sessionId`, optional `userId`, `route`, and
the current app version. Optional metadata is validated per event: for example
`plan` for checkout/payment, or `variant` for a landing experiment. `userId`,
task ID, project ID, and lens ID are permitted only in the first-party database
and never leave it for StatCounter.

## Done-conditions

### Data and capture

- [ ] A Prisma migration adds `AnalyticsSession` and `AnalyticsEvent` models.
      A session has a random opaque visitor ID, optional `userId`, first/last
      seen timestamps, referrer hostname, UTM source/medium/campaign/content/
      term, initial landing path, and a device class. An event belongs to one
      session and has the locked enum, timestamp, route, optional user, and
      validated metadata.
- [ ] A first-party visitor cookie is created for public and app visits. It
      contains only the opaque session/visitor identifier; no email, name, or
      task data.
- [ ] The event contract above is emitted idempotently at its real product
      boundary. In particular: signup completion comes from successful auth,
      checkout start comes from the server-side checkout-session creation path,
      and payment confirmation comes from the verified Stripe webhook.
- [ ] Duplicate browser retries cannot create duplicate one-time milestones:
      `SIGNUP_COMPLETED`, first `APP_OPENED`, `ONBOARDING_COMPLETED`, first
      `CAPTURE_CREATED`, and first `TRIAGE_COMPLETED` occur at most once per
      user. Repeated activity events remain countable.
- [ ] Anonymous pre-signup acquisition values are available on subsequent
      account-linked events in the same browser session. Cross-device identity
      matching is explicitly not attempted.

### Reporting

- [ ] An admin-only **Growth** tab appears under Settings/Admin. It shows a
      selectable 7-day, 30-day, and all-time range.
- [ ] The dashboard shows an acquisition table grouped by source/campaign with
      unique sessions, signups, Founding views, checkout starts, confirmed
      payments, and checkout conversion rate.
- [ ] The dashboard shows an activation funnel with counts and step-to-step
      rates: landing → signup → app open → capture → triage → checkout → paid.
- [ ] The dashboard shows D1 and D7 retention cohorts using server-side
      `APP_OPENED` events, plus active users for the selected range.
- [ ] An admin can open a single user timeline showing account metadata already
      held by ActionAmp, acquisition source, plan/payment state, and the typed
      event timeline. It never renders task/inbox content from analytics.
- [ ] The existing `actionamp-admin stats` command gains a `growth` subcommand
      with the same aggregate source, funnel, and retention data as the UI;
      `--json` is supported.

### StatCounter boundary

- [ ] StatCounter receives only anonymous tags/events: `event`, `surface`,
      `plan`, and `landing_variant` where applicable. It receives no email,
      name, user ID, task/project/lens ID, or content.
- [ ] The StatCounter project has conversion goals for the confirmed payment
      destination where available, and visitor-path/exit-link reporting is
      documented for the Stripe handoff.
- [ ] `docs/specs/observability-minimal.md`, privacy copy, and this spec agree
      on the two-layer model and the fields sent to StatCounter.

### Quality

- [ ] Server cores have tests for event validation, admin authorization,
      one-time milestone idempotency, source attribution, and cohort/funnel
      aggregation.
- [ ] An e2e covers anonymous landing → signup → first capture → triage and
      asserts the expected first-party events for that user.
- [ ] `wasp compile`, affected Vitest tests, admin CLI tests, and the relevant
      e2e pass.

## Non-goals

- No free-form event properties, drag-and-drop dashboard builder, or customer
  analytics UI.
- No automatic content personalization, recommendation changes, or AI scoring.
- No session-replay storage in ActionAmp.
- No raw task, inbox, note, outcome, or email content in analytics events.
- No export API beyond the existing admin CLI JSON output in v1.

## Open questions

- **Retention period.** Build adds a documented retention policy and a scheduled
  deletion/aggregation plan before shipping. Default recommendation: retain
  detailed event rows for 18 months and aggregate cohort totals thereafter.
- **Cookie placement.** Build chooses the least invasive first-party cookie
  shape that works across `actionamp.com` and `app.actionamp.com`, documenting
  the cross-subdomain behavior and fallback if browsers partition it.

## Prototypes

None. The Growth tab extends the existing Settings/Admin information hierarchy;
Build should reuse its table and range-control patterns.
