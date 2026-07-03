# ActionAmp — Success

> **What "successful" means, stated as testable bets** — not narratives. Each bet
> has a measurable trigger, a current status, and a clear "what changes if it
> passes/fails." This is the one-page answer to "what needs to be true for this
> project to work."
>
> Owned by Discover. Read alongside `ROADMAP.md` (the priorities) and
> `docs/research/wedge-defensibility-roast-2026-06-27.md` (the evidence).
>
> Last reviewed: 2026-07-03.

---

## The thesis in one line

People with too much on their plate will pay ~$80/yr for an app that picks the
*one* next task instead of showing them a list. Three bets must each resolve
**yes** for that thesis to hold. They are sequential — a later bet only matters
if the earlier one passes.

## The three bets

### Bet 1 — Do the right people want *this* product?  *(demand)*

**The question.** Of the people the product is put in front of, do enough reach
the magic moment (Next picking their task) to justify driving more?

**The trigger (testable).**
- ≥500 unique landing-page visitors from the *right* audience (ADHD / focus /
  productivity communities, not random traffic).
- Visitor → signup rate ≥ an honest baseline (the market says ADHD-niche
  converts free→paid at **8–12%** vs 2–4% general — so a signup rate in that
  ballpark is the bar).
- Of signups, ≥60% open the app and reach Next at least once.

**Today's status.** **Unknown — unmeasurable.** No analytics. No audience. The
product is live and almost nobody is using it. The visitor→checkout % (the one
number that matters) does not exist as a metric.

**What unblocks it.** `observability-minimal` (ready, gated on picking
Plausible/PostHog) → then the quiet-launch campaign (GTM Phase 2: ~500 of the
right people).

**What failure looks like.** 500+ right-audience visitors, <2% signup → the
landing/CTA/value-prop is the problem, not features. Fix the front door; do not
add features.

---

### Bet 2 — Does the matcher actually surprise?  *(the moat)*

**The question.** When ActionAmp picks "the one task," is the user's reaction
"oh, that *is* the right one" — or "I'd have picked X first"? The roast's
verdict: the matcher is the only real moat and currently the weakest shipped
part (an honest priority sort, not the "picks the *right* task" the pitch
promises).

**The trigger (testable — zero code first).**
- Run the manual-matcher test (`docs/research/matcher-test-runbook.md`): ~20
  overwhelmed people dump a real 20-task list; we manually pick "the one" +
  write the "why this?" line using the intended `focus-engine-v2` logic.
- **Pass:** a clear majority react "yes, that's the right one" unprompted.
- **Reshape:** subjects consistently disagree → the logic isn't surprising;
  revise before coding.
- **Icebox:** the logic can't be made surprising → the matcher isn't the moat;
  lean harder on structure depth (Resources, Goals/Projects) and brand.

**Today's status.** **Not run.** The test is written, costs nothing, takes ~2
days, and gates `focus-engine-v2`. It is the single most leveraged Discover
action and it has not happened.

**What unblocks it.** Nothing technical. It's recruiting ~20 people from
r/ADHD / r/productivity and doing the sessions. Pure Discover/user work.

**What failure looks like.** If the test reshapes or iceboxes the matcher, the
$79.50 price is no longer coherent on "smart matcher" grounds — it has to be
defended on structure depth + brand instead, and the roadmap's "Then" tier
(Resources, command palette) rises in priority relative to focus-engine-v2.

---

### Bet 3 — Will anyone pay ~$80/yr?  *(the business)*

**The question.** Is the visitor → checkout rate high enough that the business
is viable at the current price, given zero reputation and zero audience?

**The trigger (testable).**
- A known visitor → checkout % (exists only after Bet 1's analytics ship).
- **Phase 2 advance bar:** signup → paid ≥ **3%** (ROADMAP §GTM Phase 3), OR a
  clear reshape signal (e.g. "price is the blocker" or "matcher is the blocker").
- ≥1 paying **non-founder** user. (The "Then" tier is explicitly gated on this.)

**Today's status.** **Completely unvalidated.** Founding 100 checkout is live;
zero evidence of any external paying user. The $79.50 anchor is "the loneliest
spot in the category" per PRICING.md — above Things-once, 2.2× Todoist, matched
only by heavier Sunsama. **Do not move the price** until Bet 1 + Bet 2 produce
data.

**What unblocks it.** Bets 1 and 2 resolving yes, in that order. Founding 100
($139 lifetime) is the patron-on-ramp; the recurring tiers prove the business.

**What failure looks like.** Right audience + surprising matcher + still <3%
signup→paid → price is the blocker (move it) or the value-prop framing is the
blocker (rewrite). Not "launch harder."

---

## The cascade (why the order is fixed)

```
Bet 1 (want this?)  ──no──▶  fix the front door (landing, audience, analytics)
   │
   yes
   ▼
Bet 2 (matcher surprises?)  ──no──▶  reshape matcher, lean on structure + brand
   │
   yes
   ▼
Bet 3 (will pay?)  ──no──▶  move price or rewrite value-prop
   │
   yes
   ▼
Earn the right to build breadth (Resources, command palette, public launch)
```

**The rule (from ROADMAP §GTM):** no phase advances until its trigger is met.
If a bet fails, the answer is never "launch harder" or "build more" — it's go
fix the thing the failed bet points at.

## Current binding constraints (the honest to-do)

In priority order. These are what stand between today and Bet 1 even being
*measurable*:

1. **Pick Plausible vs PostHog + create the account** (user-owned, GTM §B7) →
   unblocks `observability-minimal` → unblocks Bet 1 measurement.
2. **Run the matcher test** (Discover-owned, zero code) → resolves Bet 2 before
   any matcher code is written. Promoted to a tracked unit in
   `docs/specs/matcher-validation.md`.
3. **Knock out GTM §B non-code items** (Google OAuth console, Stripe prod
   verify, monitored inboxes, DNS/email deliverability) → promoted to tracked
   backlog units so they're queued, not buried.

## How this doc relates to the others

- **`ROADMAP.md`** = the *prioritized list of work* in tiers. This doc is the
  *why those tiers are ordered that way*.
- **`docs/features/`** = *what exists today* (code-verified). This doc = *what
  has to be true for what exists to be worth it*.
- **`docs/research/wedge-defensibility-roast-2026-06-27.md`** = the evidence
  behind Bet 2's framing (4.6/10; RESHAPE; the matcher is the moat or there
  isn't one).
- **`PRODUCT.md`** = the thesis and tone. This doc = the testable expression of
  that thesis.

When a bet's status changes, update this doc in the same commit. A bet that
flips to **yes** unlocks the next tier of ROADMAP work; a bet that flips to
**no** redirects it.
