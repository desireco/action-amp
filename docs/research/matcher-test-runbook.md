# Runbook: the manual matcher test (48 hours, zero code)

> **Purpose:** test the single load-bearing assumption behind ActionAmp's
> wedge — *can a machine (or a human applying its algorithm) pick the right
> next task well enough that the user trusts it?* — for zero money and zero
> code, *before* Build ships `focus-engine-v2`. This is the 48-hour test the
> wedge-defensibility roast (<`docs/research/wedge-defensibility-roast-
> 2026-06-27.md`>) named as decisive.
>
> **The bet being tested:** if the algorithm's pick genuinely surprises people
> ("oh, yeah, that *is* the right one"), the matcher is worth building. If it
> doesn't ("no, I'd obviously do X first"), the matcher logic needs reshaping
> before a line of matcher code is written.

## Why a human, not the app

The shipped `getTopTask` is a transparent priority sort — what every todo app
does. The *planned* matcher (`focus-engine-v2`) adds time/energy fit on top.
**Neither has been tested against real overwhelmed people.** Running the
planned algorithm *by hand* on real task lists tests the logic without the
months of build time — and it tests the harder question (is the *output*
right?) not the easier one (does the code run?).

## The algorithm to apply (ActionAmp's actual intended logic)

Per `focus-engine-v2`'s done-conditions. For each participant's task list,
given the moment they describe, rank candidates as:

1. **Hard pre-filter** — only tasks they'd consider doing now (Today + soon;
   drop Someday/far-future). This mirrors `status ∈ {TODAY, UPCOMING}` with the
   due-guard.
2. **In-progress wins** — if they're mid-task, that's the pick. (Usually n/a
   in a one-shot test.)
3. **Priority tier** — Important > Normal > Low. **Never cross tiers.**
4. **Within a tier, moment-fit:**
   - *Time-fit* — prefer tasks whose size (S/M/L/XL) fits the time they have.
   - *Energy-fit* — prefer tasks at or below their stated energy (a `high-energy`
     task when they're low-energy ranks worse; untagged = medium).
5. **Tie-break** — smaller size first (quick win), then oldest.

Then write the **"why this" line** in plain English, stating the *actual*
reason: e.g. *"Important, fits in your 30 min, and you said energy is low — so
the quick Important thing beats the bigger Important one."* Never fabricate a
reason; if the pick is just "highest priority, nothing else fit," say that.

## Step-by-step (the 48 hours)

### Day 1 — recruit (2–3 hrs)

- **Who:** ~20 people who self-describe as overwhelmed / too-much-on-their-plate.
  - Recruit free from **r/ADHD**, **r/productivity**, **r/getdisciplined** — a
    short, honest post: *"I'm building a focus app that picks your next task
    for you. Before I build the picker, I want to test whether my picking logic
    is actually right. Dump me your real 20-task list + how much time/energy
    you have right now; I'll send back the one task I'd pick and why. Takes you
    2 minutes."*
  - No product pitch, no link, no signup. Pure value exchange: free
    prioritization in return for their reaction. This *is* on-brand (calm,
    honest, no manipulation) and it reaches the exact niche.
- **Aim for 20; ship the runbook with whatever you get ≥10.** Below 10 is too
  noisy to read.

### Day 1–2 — run the matches (per participant, ~5 min each)

For each response:

1. **Read their moment:** time available, energy, any context they gave.
2. **Apply the algorithm above** to their list. Land on *one* task.
3. **Write the "why this" line** — the honest reason, in their plain language,
   1–2 sentences. This is the `focus-why-transparent` output, by hand.
4. **Send it back** — the one task + the why. Add one line: *"Does that feel
   right, or would you have picked something else? Brutally honest — that's
   the point."*

### Day 2 — score the reactions

Tag each response on a 3-point scale (this is the only metric that matters):

- 🟢 **Surprise/Agree** — *"oh yeah, that IS it"* / *"how did you know"* /
  they do the task. **The matcher logic works.**
- 🟡 **Defensible but obvious** — *"yeah that's right, but I knew that"*
  / *"I'd have picked the same."* Logic is sound but **not surprising** — the
  thing the pitch promises ("picks the right one") isn't delivered; it just
  confirms what they already knew. This is the danger zone.
- 🔴 **Wrong** — *"no, I'd do X first"* / they reject the pick. Logic is off;
  capture *why* (wrong priority? missed context? energy guess wrong?).

Record verbatim quotes for 🟡 and 🔴 — those are the reshaping signal.

## The decision rule (what the scores mean)

After ≥10 responses:

| Outcome | Read | Action |
|---|---|---|
| **🟢 ≥ 40%** | The matcher genuinely surprises — the logic earns trust. | **Build `focus-engine-v2` + `focus-why-transparent` as spec'd.** The wedge is defensible; the $80 anchor is in play. |
| **Mostly 🟡** | Logic is sound but invisible — it confirms, doesn't decide. | **Reshape before building.** The matcher needs to add a signal the user *can't* trivially compute themselves (learned preference? deadline-pressure weighting? context the user forgot?). Re-roast the new logic. |
| **🔴 ≥ 30%** | The logic is wrong too often. | **Stop.** The core assumption is false. Either the matcher needs a fundamentally different input (the user's context the algorithm doesn't have), or the wedge isn't "it picks" — it's something else. Do not build the spec'd matcher. |

## What this test cannot tell you

- **Pricing.** No money changes hands; willingness-to-pay is a separate test
  (a priced waitlist or the live Founding 100 page).
- **Retention.** It's a one-shot reaction, not a 7-day return. That's
  `retention-criticalpath`'s job.
- **Distribution reach.** Reddit recruitment is a sample of the willing, not
  the market.
- **Whether people will capture into the app.** They hand you a pre-made list;
  the capture friction is untested.

## Output

Write the scored results + the verbatim 🟡/🔴 quotes into
`docs/research/matcher-test-results-<date>.md`. The decision feeds back into
`focus-engine-v2`'s spec: 🟢 → leave as `ready`; 🟡 → flip to `draft` with the
reshaping notes; 🔴 → icebox the matcher and revisit the wedge.

---

**Don't skip this.** The matcher is the only real moat, and right now it's the
weakest shipped part. Building it unvalidated burns the one chance to find out
whether the logic is right *before* the code exists. Two days, zero dollars,
decides the roadmap's central bet.
