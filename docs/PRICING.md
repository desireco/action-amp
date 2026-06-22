# ActionAmp — Pricing & Billing

> Status: DRAFT v1 — strategy under discussion, no code yet.
> Authority: this is the living record of pricing/billing decisions and the
> reasoning behind them. Update it whenever a decision is made or a number
> changes. If it conflicts with a stale note elsewhere, **this file wins** for
> pricing/monetization.
> Companion docs: `FEATURES.md` (feature inventory → drives the free-tier cap),
> `MARKETING.md` (pricing page placement), `DATA-MODEL.md` (what we meter).

---

## 0. Where we are right now (TL;DR)

- **Paid shape:** leaning **Model A** — Free (forever, feature-capped) + a single
  annual price, optional monthly for commitment-phobes. *(The 3/6/12-month
  commitment tiers were explored and set aside — see §3.)*
- **Free→paid trigger:** **feature-capped** (todoist-style: free does the full
  focus loop up to a structure limit; paid = unlimited + power features). See §4.
- **Anchor price:** **$79.50/yr (DECIDED)** — charm-price on $80; premium
  positioning (~$1.53/week). See §5.
- **Prepaid option:** **$90/yr non-recurring (DECIDED)** — same Pro product,
  no auto-renew, for the anti-subscription crowd (+$10.50 over recurring). See §5.
- **Founding 100:** **$139 one-time, lifetime (DECIDED 2026-06-22)** — capped at
  exactly 100 spots; a launch patron tier. CTA disabled until checkout + cap
  enforcement are wired. See §3 Model C.
- **Engine:** **Stripe (DECIDED).** NOT Wasp-built-in — Wasp 0.24 has no payment
  support; we wire Stripe via `api` (webhook) + actions (checkout). Full plan:
  see `BILLING-INTEGRATION.md`.
- **Nothing is implemented.** This file is the source of truth until it is.

---

## 1. The strategic frame (how we're thinking)

ActionAmp is pre-launch, single-maker, zero reputation. Two scarce resources are
in tension:

| Resource | What it wants | Implication |
|---|---|---|
| **Conversion** (validation, proof, word of mouth) | Low friction, low commitment, easy yes | → generous free tier, low entry price |
| **Cash flow** (sustainability) | Upfront commitment, higher prices | → annual/commitment tiers |

**Pre-launch, conversion wins.** A pricing model that maximizes cash but
suppresses the first 100 paying users is a strategic failure at this stage,
because those users are the proof that lets you raise prices later. Bet on
conversion now; extract value once trust exists.

The product's own thesis is a second constraint: **ActionAmp reduces decision
load.** A pricing page that makes a visitor do per-month math across 3–4
commitment lengths is cognitive friction in the one place the product promises
calm. The pricing UX should embody the brand — fewest decisions possible.

---

## 2. Competitive landscape (real numbers, as of 2026-06)

Where ActionAmp's price will be perceived. **Annual-equivalent** for comparison:

| Product | Model | Price | Notes |
|---|---|---|---|
| **Things 3** *(our design muse)* | one-time, lifetime | **$50 once** | The anchor power-users compare against. No subscription. |
| **Todoist Pro** | free + sub | **$36/yr** ($3/mo) | Category default. Free tier = 5 projects. |
| **TickTick Premium** | free + sub | **~$24/yr** ($2/mo) | Budget power option. |
| **OmniFocus** | one-time + paid upgrades | ~$50–$100 once | Mac power-user, GTD-purist. |
| **Sunsama** *(closest "calm focus" rival)* | sub only | **$192/yr** ($20/mo) | Daily-planner w/ calendar — different sub-category. |
| **Notion** | free + sub | $96/yr ($8/mo) | Not a focus app, but a free-tier reference point. |

**Reads:**

- The **focus/todo category floor is ~$24–36/yr.** Going below this signals "cheap," not "calm."
- **Things at $50-once is the single biggest perceptual threat** — ActionAmp's exact target audience loves Things and will do the math: "why subscribe when I can own Things forever for less?"
- **$80/yr is defensible but lonely** — only Sunsama is higher, and Sunsama is a heavier product. $80 requires earning trust fast.

---

## 3. Models considered

### Model — Commitment tiers (3 / 6 / 12 months) — *set aside*

The user's instinct, refined across the conversation:

| Tier | Price | Per month | Discount vs 3-mo |
|---|---|---|---|
| 3 months | $29 | $9.67 | — |
| 6 months | $50 | $8.33 | 14% off |
| 1 year | $80 | $6.67 | 31% off |

**What's good:** clean progressive curve; the 3-mo tier doubles as a low-friction
"paid trial" (~$10/mo), quietly solving the no-monthly-option problem.

**Why set aside:**

1. Three commitment lengths = three decisions = friction on the pricing page,
   contradicting the "calm" thesis.
2. The 6-month tier has no real purchase rhythm — it's a middle option that
   splits the decision without adding value.
3. The discounts are anchored to our own artificial 3-mo "list price," which
   savvy users see through.
4. $80/yr as the anchor is a steep trust bet pre-launch (see §2).

*Not killed — parked. Could return as a "prepaid credit" option later.*

### Model A — Calm two-tier (free + annual) — *the lean*

**Free (forever, feature-capped) + one annual price** (+ optional monthly at
~2× the annual rate for commitment-phobes). This is the Todoist/TickTick shape:
lowest-possible-decision pricing page. See §4–§5 for the cap + numbers.

### Model B — Things-style lifetime (one-time purchase) — *parked, watch-list*

Free basics + a one-time "lifetime" purchase ($60–$80 once). Directly honors the
design muse (Things), differentiates from the SaaS herd, and captures the
subscription-fatigued power-user segment — likely our most loyal early cohort.

**Why parked:** lumpy cash, no recurring revenue story, and it's hard to build a
growing business on one-time sales in 2026. **But keep it on the table** — if
subscription churn is high after launch, lifetime may be the answer for this
audience.

### Model C — Founding 100 (re-introduced 2026-06-22)

A capped, one-time lifetime tier for launch patrons: **exactly 100 spots at
$139 once**, lifetime Pro access, no recurring charge. Replaces the earlier
$52/yr Founder concept (which was reversed, then re-introduced on these terms).

**Why these terms:**

- **$139 one-time** pays for itself in ~1.75 years vs the $79.50 annual — a
  clear, honest patron offer, not a discount.
- **Capped at 100** because lifetime plans are dangerous for software
  businesses; a hard cap gives launch funding momentum without compromising
  long-term health. Once the 100th spot is claimed, the tier is permanently
  retired.
- **Not a subscription** — `planRenewsAt` is null; `isPlanActive` returns true
  unconditionally for FOUNDER.

**Status:** page + entitlement infrastructure shipped 2026-06-22; CTA disabled
pending checkout wiring + the 100-spot count enforcement in the checkout
action (`FOUNDING_100_CAP` in `billing/config.ts`). Landing page at `/founding-100`.

**Why this came back:** the trust-gap concern that motivated the (reversed)
$52 founder is real, and a *capped* lifetime tier addresses it without the
open-ended liability that made lifetime risky. The cap is the discipline.

---

## 4. The free→paid trigger (DECIDED direction: feature-capped)

Three trigger types exist; we're leaning **feature-capped**:

1. **Time trial** (e.g. 14-day full access, then pay) — ❌ *rejected*: conflicts
   badly with any paid tier longer than a month; high pressure, off-brand.
2. **Usage-capped** (free = up to N tasks; paid = unlimited) — ⚠️ *possible* but
   penalizes the exact behavior we want (capturing everything). Bad fit for a
   focus app whose first principle is "capture the firehose."
3. **Feature-capped** (free does the core loop; structure/power is paid) — ✅
   *the lean*. Mirrors Todoist (5 projects free). Keeps the wedge free.

### The feature cap design (DECIDED 2026-06-16)

The principle: **the wedge (What Now) must be free forever.** People fall in
love with the focus magic on a flat list. They pay when they want to *organize
at scale* — and the strongest trigger is wanting to bring their **work** life
in. So free = the full focus loop on a personal scope, with limited structure;
Pro = Work + unlimited structure + power.

| Capability | Free | Pro |
|---|---|---|
| Capture / Inbox (F1–F3) | **Unlimited** | Unlimited |
| **Tasks** | **Unlimited** | Unlimited |
| What Now focus engine (F8–F10) — *the wedge* | **Full** | Full |
| Today (capped at 5, F12) | **Full** | Full (cap configurable/off) |
| Basic triage (F6) | **Full** | Full |
| Completion + Logbook (F16/F18) | **Full** (30-day history) | Full (unlimited history) |
| **Lens** (Work/Me scope) | **Me only** (personal scope) | Work + Me + unlimited custom Lenses |
| **Projects** | **3** | Unlimited |
| **Goals** | **1** | Unlimited |
| Upcoming / Someday views | **Full** | Full |
| Command palette (F20) | — | ✅ |
| Full-text search across Logbook (F22) | — | ✅ |
| Multi-device sync (F25) | 1 device | Unlimited |
| Energy/time tags for the matcher (refinement) | — | ✅ |

**Why these exact caps:**

- **Personal scope (Me Lens) only is the strongest single trigger.** The
  personal/work split is the most natural "oh, I need Pro" moment: someone
  starts managing their personal life in ActionAmp, then wants to add work
  projects — and hits the wall at peak perceived value. This beats any
  arbitrary project count as an upgrade driver. (The app's term is **Lens**,
  chosen over "context" to avoid GTD's @context — in pricing copy "personal
  mode" / "personal scope" reads cleaner than "personal context".)
- **Unlimited Tasks is the load-bearing decision, and it's correct.** The
  product's whole thesis is "capture the firehose, surface the next drop."
  Capping tasks would punish the one behavior the app exists to encourage, and
  would make the app feel like it's fighting you. Tasks are cheap, and a user
  with 500 flat tasks but only 1 goal / 3 projects / 1 lens still can't
  *organize at scale* — the structure cap is what they bump into. The "leak"
  (someone using ActionAmp free forever as a flat list) is small, and that user
  isn't the Pro customer anyway.
- **3 Projects / 1 Goal** is the "tastes great, want more" zone — enough to
  feel the organizing benefit on one area of life, tight enough that real life
  (more than one goal, more than three projects) pushes you to Pro fast. (User
  floated 5 projects first, then settled on 3; 3 is tighter and fits the
  premium positioning — Todoist's 5 is the reference for a cheaper-feeling app.)

---

## 5. Model A — the numbers (DECIDED)

**DECISION (2026-06-16): Model A3 — premium positioning.** A bolder anchor,
justified by the breadth of paid features coming.

*(Founding 100 launch tier added 2026-06-22 — see §3 Model C. A capped,
one-time lifetime option alongside the recurring/prepaid Pro ladder.)*

| Tier | Price | Story |
|---|---|---|
| **Free** | $0 (feature-capped) | The full focus loop, **personal scope only**, capped at 3 Projects / 1 Goal. Tasks unlimited. See §4. |
| **Pro** *(regular annual)* | **$79.50/yr** | Charm-priced. "About a dollar-fifty a week." (~$1.53/wk, ~$6.63/mo equiv) |
| **Pro prepaid** *(non-recurring)* | **$90/yr** | Same Pro, **no auto-renew**. +$10.50 for control & peace of mind. For the anti-subscription crowd. |
| **Pro monthly** *(optional)* | **$12.95/mo** | Commitment-phobe option — ~2.0× the annual equiv, a clear push to yearly. |
| **Founding 100** *(launch, lifetime)* | **$139 once** | Exactly 100 spots. Lifetime Pro, no recurring charge. Permanently retired once the 100th spot is claimed. See §3 Model C. |

**The pricing story:**

> *ActionAmp Pro costs about a dollar-fifty a week.*

The ladder is ~2 things on the page: Free, and Pro (with a recurring-vs-prepaid
billing toggle). Monthly is the escape hatch, not a headline.

### Why $80 anchor (the user's call)

- **Premium positioning for a broad paid feature set.** The rationale is that a
  bunch of Pro features are coming (unlimited Lenses, multi-device, command
  palette, search, focus refinement) — the price needs to carry that breadth,
  not just the wedge. $80 signals "serious tool," not "$3/mo commodity."
- **Charm-priced to $79.50** (user's call). Slight note logged: `.50` is an
  unusual finish — `.99`/`.95` read as discount, `.00` as honest/round, `.50` as
  slightly arbitrary. Immaterial to the story (~$1.53/wk either way).
- **It makes the $12.95/mo coherent.** At an $80 anchor, $12.95/mo ≈ $155/yr is
  ~2.0× annual — a normal-enough push-to-annual rate.
- **The honest risk, stated once and not relitigated:** $80 is the loneliest spot
  in the category — above Things-once ($50), 2.2× Todoist ($36), matched only by
  Sunsama ($192) which is a heavier product. Pre-launch, with zero reputation,
  it's a trust bet. *This was flagged earlier; the user has chosen $80
  deliberately with eyes open.* (The $52 Founder bridge was removed
  2026-06-22; the $90 prepaid is the lower-commitment on-ramp that remains.)

### Why $90 prepaid non-recurring (added 2026-06-16)

- **Captures the anti-subscription segment without committing to lifetime (Model
  B).** Users who hate auto-renew pay a $10.50 premium for control.
- **It's a billing toggle, not a new tier** — same Pro product, no auto-renew.
  Reads on the page as one line: *"Pro: $79.50/yr, or $90 prepaid (no auto-renew)."*
- **Implementation:** one-time Stripe checkout that grants a 12-month entitlement
  (`plan=PRO`, `planRenewsAt=+1yr`). On expiry → drops to FREE with a
  soft-lock on the excess (never delete). Full mechanics in
  `BILLING-INTEGRATION.md` §4.

### ~~Why $52 founder~~ — *reversed 2026-06-22; re-introduced as Founding 100 (see §3 Model C)*

The original $52/yr Founder concept was reversed, then re-introduced on
different terms: **$139 one-time**, lifetime, capped at 100 spots. The cap is
the discipline that makes a lifetime tier safe — see §3 Model C.

### Paths not taken — parked

- **$60/yr anchor (A2):** briefly locked in, then revised to $80. The user opted
  for the premium signal + feature breadth of $80. Revisit if conversion data
  says $80 is suppressing signups (a launch discount or lower anchor is the
  cheap lever).

---

## 6. Technical integration — DECIDED: Stripe

**Engine: Stripe (DECIDED 2026-06-16).** The maker already uses Stripe.

**⚠️ Correction of an earlier claim:** Wasp does **not** have built-in
payments. Earlier in this conversation I said "Wasp has native Polar
integration built in" — **that was wrong.** Verified against the 0.24 source:
no payment/subscription constructor in `@wasp.sh/spec`, no docs section, no
SDK references. The "Polar" in a launch blog referred to the *Open SaaS starter
template*, a different scaffold — not the core framework we're on. So we wire
Stripe ourselves. This is standard Stripe and low-risk; we're not fighting the
framework, just using its general primitives:

- `api` + `apiNamespace` → the **webhook endpoint** (`apiNamespace` exists
  precisely for raw-body groups, which signature verification needs).
- server **actions** → create **Checkout Sessions** (and **Customer Portal**
  sessions).
- Stripe hosts all money UI (Checkout + Portal) → we build ~no payment form.

The full plan — architecture, schema, endpoints, settings structure, phased
build order, security checklist — lives in **`BILLING-INTEGRATION.md`**.

**Schema shape (summary):** a `Plan` enum (`FREE | PRO | FOUNDER`) +
`stripeCustomerId` + `planRenewsAt` on `User`. Entitlement is enforced
**server-side in operations** (never trust the client): `context.user.plan`
gates creating the 4th Project, 2nd Goal, or using the Work Lens. `FOUNDER` is
the Founding 100 lifetime tier (`planRenewsAt` null; `isPlanActive` always
true).

**Load before coding:** the `stripe-best-practices` skill (restricted API keys,
webhook as source of truth, signature verification, idempotency).

---

## 7. Open decisions (need the user's call)

1. ~~**Anchor price**~~ — **DECIDED: $79.50/yr** (charm-priced from $80).
2. ~~**Prepaid non-recurring option**~~ — **DECIDED: $90/yr, no auto-renew.**
3. ~~**Founder launch rate**~~ — **REVERSED 2026-06-22: Founder tier dropped.**
   *(Originally decided $52/yr lifetime-locked; removed from catalog, schema, and
   UI. See §3 Model C for the reversal rationale.)*
4. ~~**Monthly option included, and at what price?**~~ — **DECIDED: $12.95/mo.**
   *(Push-to-annual rate: ~$155/yr equiv ≈ 2.0× the $79.50 annual — coherent at this
   anchor. Still above the typical SaaS 1.2–1.4× norm, which is intentional
   (keeps bookkeeping simple, forces yearly commitment) — but revisit if it
   suppresses signups.)*
5. ~~**Feature caps**~~ — **DECIDED: Personal (Me) scope only · 1 Goal · 3
   Projects · unlimited Tasks.** See §4.
6. ~~**Engine: Stripe or Polar?**~~ — **DECIDED: Stripe.** (And corrected: Wasp
   has NO built-in payments — see §6.) Full plan in `BILLING-INTEGRATION.md`.
7. **Model B (lifetime) as an option at launch, or subscription-only?**
   *(lean: subscription-only at launch; revisit if churn is high. The $90 prepaid
   non-recurring option partially serves the same audience without committing
   to true lifetime.)* **— Updated 2026-06-22: the Founding 100 (§3 Model C)
   IS the capped lifetime option; it retires after 100 spots.**

---

## 8. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-06-16 | Set aside 3/6/12-mo commitment tiers | Decision overhead contradicts calm thesis; 6-mo tier has no rhythm; bundled pricing adds friction |
| 2026-06-16 | Reject time-trial trigger | Conflicts with paid tiers; high pressure, off-brand |
| 2026-06-16 | Lean feature-capped free tier (over usage-capped) | Usage caps punish capturing — the core behavior we want |
| 2026-06-16 | Lean Model A (free + annual) over commitment tiers | Lowest-decision pricing page; matches product voice |
| 2026-06-16 | **Anchor price: $79.50/yr** (charm-price on $80; Model A3, premium) | Premium signal for a broad paid feature set; coherent w/ $12.95/mo (2.0×). Risk (flagged once): loneliest spot in market pre-launch — $52 founder bridges the trust gap. Revised up from earlier $60 lock |
| 2026-06-16 | **Prepaid non-recurring: $90/yr** | Captures the anti-subscription crowd (+$10.50 over recurring) without committing to lifetime; a billing toggle, not a new tier |
| 2026-06-16 | **Founder launch: $52/yr, lifetime-locked** | $52 = 52 weeks → "$1/week," universally graspable story; ~35% off the $79.50 anchor; beats $43 (GTD tickler, too niche) on breadth |
| 2026-06-16 | **Engine: Stripe** (Wasp has NO built-in payments — corrected earlier wrong claim) | Maker already uses Stripe; Wasp's `api`+`apiNamespace` + actions are all we need. Full plan: BILLING-INTEGRATION.md |
| 2026-06-16 | **Feature caps: personal (Me) scope · 1 Goal · 3 Projects · unlimited Tasks** | Personal-only lens is the strongest upgrade trigger; unlimited tasks avoids punishing the core capture behavior; 3/1 is the tastes-great zone |
| 2026-06-16 | **Monthly price: $12.95/mo** | Push-to-annual rate (~$155/yr equiv ≈ 2.0× the $79.50 annual). Still above market 1.2–1.4× norm — intentional |
| 2026-06-22 | **Founder tier reversed: dropped from catalog, schema, and UI** | Lifetime-locked tier added entitlement-model complexity (third plan state, non-expiring `planRenewsAt`) for a benefit the $90 prepaid already covers. Trust-gap concern real but cheaper to solve with a time-limited launch discount later if churn demands it. Removed `FOUNDER` from `Plan` enum, `billing/`, `BillingPage`, and docs. |
| 2026-06-22 | **Founding 100 re-introduced: $139 one-time, lifetime, capped at 100 spots** | Reverses the earlier reversal, on safer terms: a hard 100-spot cap makes a lifetime tier viable (funds launch without open-ended liability). $139 pays for itself in ~1.75yr vs annual. Shipped page (`/founding-100`), schema enum, entitlement infra; CTA disabled pending checkout + cap enforcement wiring. |
