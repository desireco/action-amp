---
feature: retention-criticalpath
status: ready
spec_owner: discover
build_owner: build
---

# Feature: Retention — the first-7-days critical path

## Summary

Define and instrument the funnel that decides whether a new user becomes a
returning user, then fix the drop points the data exposes. This is **not one
feature** — it's a measurement layer (the events + the `lastSeenAt` tracking
that don't exist today) plus a small set of known dead-ends to close. The
magic moment (Next picking your next task) is built and seeded, but it's
fragile: onboarding doesn't connect to the seed, and completing the seed task
lands the user on a dead-end empty state with no path forward. **Depends on
`observability-minimal`** — without events, retention is unmeasurable and
every "fix" is a guess.

## Why

The free-tier audit and the GTM review both concluded the binding constraint is
*retention, not acquisition* — but today there is **zero** retention signal:
no analytics events, no `lastSeenAt`/`lastLoginAt`, no re-engagement of any
kind. A user who closes the tab after day 1 is gone, and we'd never know they
were here or where they bounced. The roadmap's central sequencing rule ("fix
the welcome before driving traffic") names this as the place the product lives
or dies.

Two things make this tractable now rather than a vague "improve retention"
goal: (1) `observability-minimal` gives us the event sink; (2) the post-
first-run code path is short enough that the *likely* drop points are
inspectable today, before any data exists. This spec captures both — the
measurement and the known dead-ends — so Build can ship the instrumentation
and the cheap fixes in one pass, and the data-dependent fixes wait for their
numbers.

## Done-conditions

Split into **instrumentation** (shippable now) and **known dead-ends**
(shippable now, no data needed) and **data-gated fixes** (explicitly deferred).

### A. Instrumentation — the retention funnel (depends on observability-minimal)

- [ ] **A `lastSeenAt` timestamp is recorded server-side** on every authenticated
      app load. New `User.lastSeenAt DateTime?` field + migration; updated by a
      lightweight query/action on `/app` mount (or via the existing `getAppData`
      call — piggyback, no extra round-trip). This is the *only* way to compute
      D1/D7 retention without trusting client analytics.
- [ ] **The 4 `observability-minimal` events are emitted** (land → signup →
      app-first-open → checkout) **plus 3 retention-specific ones:**
      - `seed_task_completed` — the user completed the magic-moment seed task
        (the first real engagement signal).
      - `first_capture` — the user captured their own first InboxItem (the user
        crossed from "trying the demo" to "using it for real").
      - `first_triage` — the user triaged their first item (the loop closed
        end-to-end once).
      These three are the activation funnel; without them, "signed up" is a
      meaningless numerator.
- [ ] **D1 and D7 retention are computable** from `lastSeenAt`: of users who
      signed up on day N, what % have a `lastSeenAt` ≥ N+1 (D1) / ≥ N+7 (D7).
      No dashboard required — a single SQL query or a one-off script suffices
      for v1; the provider's funnel view (from observability-minimal) shows the
      activation events.

### B. Known dead-ends — fix without waiting for data

These are inspectable in the code today; they're friction regardless of what
the numbers eventually say.

- [ ] **Onboarding connects to the seed.** The final onboarding panel (or the
      Next first-paint) acknowledges the seeded task — e.g. the focus panel
      reads "We put one task on your table — try completing it" instead of the
      generic "Next picks the next thing." The seed exists; onboarding
      pretends it doesn't. (`OnboardingPage.tsx` STEPS[2] / `NextPage.tsx`
      first-paint.)
- [ ] **The post-completion dead-end is closed.** Today, completing the seed
      task flips Next to *"Nothing on the table. Capture something with ⌘K"*
      — a dead-end that assumes the loop is internalized. Replace with a calm,
      specific next step that references the just-completed action: e.g.
      *"Done. Capture your own with ⌘K — what's actually on your mind?"*
      (`NextPage.tsx` empty state, lines ~77-82.)
- [ ] **The empty Inbox has a single next action**, not just a zero state.
      Today's Inbox zero ("Capture something with ⌘K") is correct copy but
      offers no affordance. Add the `⌘K` hint as a tappable/clickable control
      that opens capture, not just text. (`inbox/InboxPage.tsx` empty state.)

### C. Data-gated fixes — explicitly deferred (NOT in this spec)

Do not build these now; they're listed so the queue knows they're coming and
*gated on the A/B numbers*:

- A re-engagement email (the "you captured 3 things on Tuesday" nudge). Needs
  D1/D7 data + an email provider beyond auth (Resend is wired, but no campaign
  flow). Brand-caution: must not become guilt-trip spam (PRODUCT.md bans it).
- "Not now" bottom sheet + multi-card Next (FEATURES.md F11/F8). These are
  real but they're *feature* work, not retention measurement; sequence after
  the data shows they'd move the needle.
- Onboarding A/B variants. Only worth it once the baseline funnel is measured.

## Non-goals

- **No re-engagement emails / push / notifications in this spec.** Data-gated
  (§C). The calm brand makes this especially load-bearing — a bad nudge is
  worse than none.
- **No "streaks" or return-counters.** Explicitly banned by PRODUCT.md.
- **No cohort dashboards / BI tooling.** A query + the analytics provider's
  funnel view is enough for v1.
- **No changes to the matcher, caps, or billing.** Those have their own specs.
- **No mobile-specific retention work.** Web-first; the same instrumentation
  covers both once mobile exists.
- **No fixing drop points the data hasn't identified yet.** Speculative fixes
  (redesigning Today, adding gamification, etc.) are out until §A shows where
  the drop actually is.

## Open questions

- **Where `lastSeenAt` updates.** Lean: piggyback on `getAppData` (already
  called on every `/app` mount) — have it stamp `lastSeenAt` server-side as a
  side effect, so there's no extra round-trip. Build confirms this doesn't
  bloat that query or cause write-contention; if it does, a dedicated tiny
  action is the fallback.
- **Activation-event thresholds.** Is "first triage" the right activation
  definition, or is it "first capture"? Lean: capture is the truer activation
  (the user put something of their own in). Build emits both; Discover defines
  the activation metric from the data once it exists.

## Prototypes

_(none — instrumentation + copy/affordance changes; no new UI paradigm. The
empty-state rewrites reuse existing components.)_
