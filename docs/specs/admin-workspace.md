---
id: admin-workspace
kind: spec
title: "Dedicated admin workspace and funnel reporting"
status: shipped
priority: P1
feature: admin-workspace
spec_owner: discover
build_owner: build
created: 2026-08-03
---

# Spec: Dedicated admin workspace and funnel reporting

## Summary

Move administration out of user Settings into a dedicated, admin-only workspace.
The **Admin** item in the signed-in profile menu opens `/do/admin`, not a
Settings tab. The workspace has its own layout and navigation, with funnel
reporting as a first-class destination instead of a metric buried in a general
stats page.

This is the operational home for answering: *Do visitors become users, do users
activate, and where does the path to payment stop?*

## Why

The current `/do/settings/admin` page is a useful internal panel but has the
wrong information architecture. Settings are personal configuration. Admin is
product operations: growth, feedback, and the health of a live service.

The base StatCounter tracker is live, but it cannot by itself answer the
account-linked funnel questions needed to run the product. The existing
`growth-analytics` spec defines the durable first-party event model. This spec
defines the admin experience that makes those events useful day to day.

## Decisions locked

1. **Dedicated route.** `/do/admin` is the only canonical browser entry point.
   `/do/settings/admin` redirects to `/do/admin/overview` so existing
   bookmarks do not break.
2. **Profile entry.** The existing admin-only item in the signed-in profile menu
   reads `Admin` and links to `/do/admin/overview`. It does not appear in the
   normal Settings tab strip.
3. **Own shell, shared visual language.** `AdminLayout` is separate from
   `SettingsLayout` and owns its header, navigation, page width, and responsive
   behavior. It reuses ActionAmp tokens and primitive UI components; this is not
   a separate visual product.
4. **Three v1 destinations.**
   - **Overview** — operating snapshot: signups, activity, task completion,
     payment counts, and open feedback.
   - **Funnel** — acquisition → signup → activation → checkout → paid.
   - **Feedback** — full feedback triage, replacing the truncated dashboard
     list as the working queue.
5. **Range is shared per page.** Overview and Funnel provide `7 days`, `30
   days`, and `All time`; default is 30 days. The range is encoded in the URL
   (`?range=7d`, `30d`, `all`) so an admin can reload or share the exact view.
6. **First-party data wins.** Funnel counts, retention, and user timelines come
   from ActionAmp's first-party analytics store defined in
   `docs/specs/growth-analytics.md`. StatCounter remains anonymous acquisition
   context and does not become the customer database.
7. **Admin-only everywhere.** Client route guards improve UX, but every query,
   action, and API/CLI route independently verifies `user.isAdmin`.

## Experience

### 1. Shell and navigation

Desktop uses a quiet left rail within the admin workspace:

```text
ActionAmp / Admin                         ← Back to app

Overview
Funnel
Feedback

─────────────────
Last refreshed 2 min ago
```

- `ActionAmp / Admin` is a compact identity mark, not marketing.
- Active destination has the existing teal selection treatment. No badges,
  red dots, or attention-seeking counters.
- The top-right/back affordance returns to `/do`, preserving the current
  user-facing app context.
- Mobile renders this navigation as a horizontal, scrollable tab row directly
  under the Admin header. It never becomes a hidden hamburger menu.
- Admin pages use the broad application content width. Tables may scroll
  horizontally on small screens; charts are not required for v1.

Routes:

```text
/do/admin                 → redirect /do/admin/overview
/do/admin/overview
/do/admin/funnel?range=30d
/do/admin/feedback
/do/settings/admin        → redirect /do/admin/overview
```

### 2. Overview

Overview replaces the current one-page dashboard. It is a scan, not a report.

Sections, top to bottom:

1. **Operating snapshot** — total users, active users, new signups, confirmed
   payments, and checkout-to-paid conversion for selected range.
2. **Product activity** — captures, triage completions, tasks completed, and
   current task-completion rate. Counts only; no task content.
3. **Funnel pulse** — compact six-step row: landing → signup → app open →
   capture → triage → checkout → paid. Each step shows count and conversion
   from prior step. `View funnel` goes to the Funnel page with the same range.
4. **Feedback pulse** — open and in-progress counts plus the five newest items.
   `Open feedback` goes to the Feedback page.

Empty states explain what creates the first signal, e.g. “No checkout starts in
this range yet. Checkout starts appear when a signed-in user opens Stripe.”
They never make absence sound like failure.

### 3. Funnel

Funnel is the decision page for launch work.

It shows:

- **Primary conversion path:** unique sessions → signup completed → first app
  open → first capture → first triage → checkout started → payment confirmed.
- **Step conversion:** each row displays count, percentage of the immediately
  preceding step, and percentage of landing sessions. A zero denominator shows
  `—`, never `0%`.
- **Acquisition table:** grouped by source/campaign, with unique sessions,
  signups, checkout starts, paid users, and visitor-to-paid conversion. Unknown
  source is a valid row, not discarded.
- **Retention:** D1 and D7 return rates for users whose first app open landed in
  the selected cohort window. Show “Not enough elapsed time” rather than a
  misleading zero for incomplete cohorts.
- **Method note:** a subdued line distinguishes first-party account events from
  anonymous StatCounter acquisition reporting, with a link to the provider
  dashboard only when configured.

No event payloads, email addresses, task text, or session-replay data render on
this page.

### 4. Feedback

Feedback becomes its own working page, retaining all current capabilities:

- newest-first list with cursor pagination;
- status change (Open, In progress, Resolved, Closed);
- deletion with existing confirmation behavior;
- message, reporter, route/lens context, and submitted time.

Add a status filter. Default is `Open + In progress`; `All` is available. The
filter state is URL-backed (`?status=open,in_progress`) so the queue is stable
on refresh. Do not add assignments, internal comments, or notifications in v1.

## Data and architecture

### Existing data moved, not rewritten

`getAdminStatsCore`, recent-feedback queries, feedback status updates, and the
admin CLI remain shared server cores. Move/reuse them behind the new routes;
do not duplicate aggregate queries in React components.

`actionamp-admin stats` remains supported. Add `actionamp-admin growth` once
the first-party funnel aggregates exist; its JSON response must match the
Funnel page's aggregate payload.

### Funnel data

Implement the event/session models and event contract from
`docs/specs/growth-analytics.md`. This spec depends on that work and narrows
its browser IA:

- one opaque first-party visitor/session identifier;
- typed events only; validated metadata;
- anonymous acquisition data is linked on signup only in the same browser;
- no PII or task/inbox content in StatCounter tags;
- payment confirmation originates from verified Stripe webhook, never from the
  checkout redirect.

The minimal StatCounter milestones (`landing_view`, `signup_complete`,
`app_first_open`, `checkout_started`) are still required. Emit the equivalent
typed first-party events at the same authoritative boundaries so no parallel,
inconsistent event taxonomy exists.

### Suggested implementation boundaries

```text
src/admin/
  AdminLayout.tsx             # admin shell + nav + route outlet
  AdminOverviewPage.tsx
  AdminFunnelPage.tsx
  AdminFeedbackPage.tsx
  operations.ts               # guarded Wasp queries/actions
  operationsCore.ts           # pure aggregates, shared with CLI

src/analytics/
  operationsCore.ts           # typed event writes + funnel aggregates
  tracking.ts                 # client-safe event boundary helpers
```

Keep `AdminLayout` out of `src/app/SettingsLayout.tsx`. Update the profile-menu
Admin target and remove the Settings Admin tab.

## Done-conditions

- [x] Non-admins cannot see the profile Admin entry and receive a normal access
  denial for any direct `/do/admin/*` URL or admin API request.
- [x] Admin profile entry opens `/do/admin/overview`; `/do/settings/admin`
  redirects there.
- [x] `AdminLayout` provides desktop rail and mobile tab-row navigation across
  Overview, Funnel, and Feedback, with correct active route state.
- [x] Overview presents existing stats plus payments, product activity, compact
  funnel pulse, and feedback pulse for 7d/30d/all ranges.
- [x] Funnel implements the counts, rates, acquisition grouping, and cohort
  behavior specified above from first-party data.
- [x] Feedback migration preserves current status updates, deletion, pagination,
  and adds URL-backed status filtering.
- [x] Funnel events are emitted at their authoritative product boundaries and
  StatCounter receives only allowed anonymous tags.
- [x] `actionamp-admin stats` remains backward compatible; `growth --json`
  returns the same aggregate funnel data as the browser.
- [x] Tests cover route authorization, redirects, range/filter URL state,
  aggregate calculations, event idempotency, and feedback triage actions.
- [x] `wasp compile`, affected Vitest tests, admin CLI tests, and relevant e2e
  tests pass.

## Non-goals

- No customer-facing analytics.
- No generic dashboard builder, ad-hoc event editor, or charting dependency.
- No team roles beyond the existing `isAdmin` boolean.
- No session replay stored by ActionAmp.
- No support CRM: assignments, internal notes, bulk actions, and notifications
  are deferred.
- No changes to task ranking, billing policy, or customer Settings.

## Dependencies and document cascade

- Depends on `growth-analytics` for first-party session/event persistence and
  source attribution.
- Completes the reporting UX implied by `observability-minimal`; that spec
  continues to own the minimal anonymous StatCounter integration.
- Supersedes the **access-path and browser-page** decisions in
  `docs/superpowers/specs/2026-07-22-admin-dashboard-design.md`. Its existing
  aggregate-core and CLI decisions remain valid unless this spec explicitly
  changes them.
- When built, update `docs/features/` with the code-verified admin and
  analytics capabilities, then reconcile `docs/ROADMAP.md` status.
