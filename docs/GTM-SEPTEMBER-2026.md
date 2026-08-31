# ActionAmp — September 2026 GTM Campaign

> Status: ACTIVE PLAN — written 2026-08-31, runs Sep 1–30, 2026.
> Authority: this is the **execution overlay** for one month. Strategy stays
> canonical in `ROADMAP.md` §GTM (phases, triggers) and `SUCCESS.md` (bets).
> If this plan and a phase-gate rule disagree, **the gate wins** — the answer
> to a broken funnel is never "launch harder."
> Owner: Jake (human asks, community posts, decisions). Agent support: funnel
> numbers, copy drafts, review prep.

---

## 0. The goals

| Goal | Number | Notes |
|---|---|---|
| **Primary** | **100 new signups, Sep 1–30** | Free counts. Measured as `createdAt` in September, read weekly from the admin Funnel / `actionamp-admin stats`. |
| **Win bar** | **≥ 5 paying users** | Any tier counts: Founding 100 ($99) or Pro. 5% of 100 in month one is honest for a zero-audience launch; the niche benchmark (8–12%) is for established products. |
| **Guardrail** | ≥ 60% of signups reach Next once | Otherwise we collected signups, not users. Tracked via the admin Funnel. |
| **Guardrail** | Visitor → signup rate known by Sep 14 | From StatCounter + Funnel. This is the number that decides the Sep 21 go/no-go. |

**Two different 100s — don't conflate.** The campaign goal is 100 *signups*.
The Founding 100 is a *tier* (≤ 100 lifetime spots, $99). A September signup
is not a founder unless they chose to be.

**Baseline (fill in Sep 1):** total users ___, paying ___, Founding 100 spots
taken ___. Read via `actionamp-admin stats` (the dev DB's 37 users are dev
noise, not the baseline). Everything above is measured *delta* from baseline.

---

## 1. Where the 100 comes from (funnel math)

| Source lane | Target | Math / reasoning |
|---|---|---|
| **Warm network** (W1–W2) | ~25 | Direct asks. GTM Phase 1's own target is 20–50 humans; 25 is the committed middle. |
| **Communities** (W2–W4) | ~50 | ~600 right-audience visitors × ~8% visitor→signup. Matches GTM Phase 2's "500 of the right people" bar. |
| **Launch moment** (W4–W5) | ~25 | Product Hunt + Show HN *if* the Sep 21 go/no-go passes; otherwise a second community wave + borrowed audiences. |
| **Total** | **100** | Ambitious but decomposed honestly. If any lane halves, we land at 70–80 — still the largest month the product has had. |

The 5 paying decompose as: **3 Founding 100 + 2 Pro** (either yearly with the
workshop, or monthly). The patron ask converts believers; the wall (4th
project / 2nd goal / Work lens) converts organizers.

---

## 2. Weekly milestones

Progressive by design — each week's target is bigger than the last, back-loaded
onto the channels that need warm-up time. Weeks run Mon–Sun except W1 (Tue
start) and W5 (Mon–Wed tail).

| Week | Dates | New signups | Cumulative | Focus | Phase |
|---|---|---|---|---|---|
| **W1** | Sep 1–7 | **15** | 15 | Friends & alpha: direct asks, concierge onboarding, Founding 100 story written. Matcher-test recruiting starts. | GTM Phase 1 |
| **W2** | Sep 8–14 | **20** | 35 | Warm tail + first community seeds. **Newsletter capture live by Sep 10.** Matcher-test sessions run. Visitor→signup rate known. | Phase 1 → 2 |
| **W3** | Sep 15–21 | **25** | 60 | Community push: ~500 right-audience visitors. Matcher-test writeup published. **Sep 21: go/no-go for W4 launch moment.** | Phase 2 |
| **W4** | Sep 22–28 | **30** | 90 | Launch moment (Product Hunt Tue Sep 22 or 29, Show HN) if GO; else community wave 2 + guest post/podcast. | Phase 2/3 |
| **W5** | Sep 29–30 | **10** | **100** | Tail + push: personal follow-ups, newsletter send #1 to the September list. | — |

### The Monday ritual (30 min, every week)

Numbers first, feelings second:

1. Pull signups, activations (reached Next), D7 return, visitor→signup, paying — admin Funnel + StatCounter.
2. Compare to the table above. Name the biggest leak out loud.
3. One kill / one double-down decision per week. Channels that produced nothing by their second week get cut.
4. Check the phase gates (below). Gates outrank the calendar.

### Phase gates (unchanged from ROADMAP §GTM)

- **Advance Phase 1 → 2:** ≥ 20 external signups; ≥ 3 used Next on day 3.
- **Advance Phase 2 → 3 (the Sep 21 go/no-go):** known visitor→signup; signup→paid ≥ 3% *or* a clear reshape signal. **If NO-GO:** W4 becomes community wave 2 + borrowed (guest post, podcast, second Reddit seam) — no Product Hunt, no Show HN, and the 100 shifts to ~85 realistic with an honest note in this file.

---

## 3. Channel brainstorm (what we actually do)

ORB framing from the strategy: rented/borrowed drive traffic; owned captures
it. Every rented play below leaks unless newsletter capture (§3.1) is live —
that's why it's the only code prerequisite.

### Owned

1. **Newsletter capture — ship by Sep 10.** Spec exists (`docs/specs/newsletter.md`, draft; provider decision is the open question — lean: Buttondown). Footer always + quiet hero field. Every not-ready visitor becomes reachable; September's list gets send #1 on Sep 29. Smallest code lift, highest compounding value.
2. **Matcher-test writeup (W3).** The Bet-2 manual test produces the month's best content for free: real overwhelmed people, real 20-task dumps, a human picking the one thing. Publish as an essay on the Astro site + the Reddit posts that spawned it. Genuinely useful even for people who never sign up — that's the brand.
3. **Blog/SEO — stretch only.** Spec is ready, but SEO compounds after September. Only build if W1–W2 shows spare capacity; otherwise it's October's lane. Territory is already mapped in `docs/SEO.md` (decision-overwhelm, calm systems, task initiation — never "best todo app").

### Rented

4. **Reddit — the main seam, value-first.** r/ADHD, r/productivity, r/GetDisciplined, r/gtd. Most ban self-promo; the play is the matcher test: *"Overwhelmed by your list? Drop your 20 tasks, I'll pick your one next thing and say why — no signup, just a human."* Answer in-thread with real picks; app lives in profile/username and only in replies where asked. One post per subreddit per week maximum; engage every comment. Yield: 30–40 of the 50 community signups.
5. **Indie/maker communities.** r/SideProject, r/IndieHackers, Indie Hackers, X build-in-public. These allow "I built this." Angle: the calm-thesis story (every app optimizes capture; this one optimizes the decision) + the CLI/API-for-agents hook, which makers and devs genuinely rate. Yield: 5–10.
6. **X/Twitter.** 2–3 build-in-public posts per week: the Next-card visual, design DNA (Things-inspired calm), honest numbers from the Monday ritual. Follows the ADHD-productivity conversation; no hashtag spam. Compounding, low yield at first.
7. **Product Hunt + Show HN (W4, gated).** Tue launches; prep in W3 only if trending toward GO: tagline, gallery, 30–60s demo GIF, early supporters lined up from W1–W3 (the warm 25 are the upvote floor). Use the go-to-market skill's launch-marketing-pack shape. Yield if GO: 15–30.

### Borrowed

8. **ADHD/productivity creators.** Pitch 10–15 newsletter + small-podcast people in W2 with a concrete segment: "the app that picks one task" + the matcher-test story (creators need content; a human picking your one task is a good episode). One guest spot = 10–30 signups from a trusted voice — the cheapest borrowed channel we have.
9. **ADHD coaches / productivity consultants.** They client-match exactly, and the Founding 100 patron framing suits them. Three personal emails in W2. Yield: 0–5 direct, but possibly the first recurring-referral source.

### Warm

10. **The direct ask (W1).** 25 names, personal message each, with a 15-minute "I'll set you up" offer. Not a blast. Founding 100 is the patron ask for the ones who believe early. These people are also September's feedback panel and the PH upvote floor.

### Explicitly not doing

- **Paid ads** — zero budget, category CPCs are brutal, and un-validated funnels burn money.
- **Referral/skip-the-line mechanics** — removed by the fairness principle (`PRODUCT.md`).
- **FOMO tactics** (countdowns, fake urgency) — banned; the Founding 100 cap is real and stated once.
- **TikTok/short-video** — no founder-video muscle; Tiimo's lane, not ours, this month.

---

## 4. Converting to 5 paying

1. **Write the Founding 100 story (W1).** Backlog `gtm-founding100-story` is the open draft: who the first 100 are, why the cap is real, what patronage funds. The ask is honest patronage, not a discount.
2. **Concierge onboarding for every September signup.** One personal email from Jake within 48h: offer to help them import/dump their list. Honest, calm, no pitch. This is simultaneously the conversion lever, the retention research, and the funnel's eyes — a solo maker's unfair advantage over Sunsama.
3. **Watch the wall.** The upgrade moments are structural (4th project, 2nd goal, Work lens). When a hit shows in the Funnel, a calm human note: "you hit the free limit — here's what Pro unlocks, no pressure." Never a red dot.
4. **Yearly Pro + the goal-setting workshop** is the ask for users who want structure, delivered personally. Two of five likely come from here; the rest from Founding 100.

---

## 5. Pre-flight (Sep 1–3, gates the whole month)

**Jake-owned (from ROADMAP §GTM-B, still open):**

- [ ] Google Cloud OAuth console setup (consent screen, redirect URIs, keys → Railway). The single biggest signup-friction cut — typing an email + password vs one tap.
- [ ] Stripe production keys + webhook verified live (gates all five paying).
- [ ] `privacy@` / `legal@` inboxes exist and are monitored.
- [ ] SPF/DKIM/DMARC + test signup email to Gmail/Outlook (auth emails in spam kill activation silently).
- [ ] Record the baseline (§0) via `actionamp-admin stats`.

**Agent/build-owned:**

- [ ] Newsletter capture live by Sep 10 (§3.1).
- [ ] Fix public-copy contradictions flagged in `docs/SEO.md` §2 (Founding 100 price mismatch, the stale waitlist mention) before any traffic push.

---

## 6. Risks, stated once

- **Warm network underdelivers** (the usual: 25 targeted, 12 real). Mitigation: over-ask in W1 — 40 names for 25 signups.
- **Community posts get removed or ignored.** Mitigation: the matcher test gives before it takes; one seam per subreddit; engage every reply for 48h.
- **Funnel is broken at W3** (visitors come, nobody signs up). Then the gate rule fires: fix the front door, ship W4 as community wave 2, take ~70–85 signups and a validated diagnosis. **That is still a successful September** — 100 with a broken funnel would be the worse outcome.
- **Activation under 60%.** Then onboarding/first-run is the leak, not traffic; the fix budget goes there before any new channel.

## 7. After September

- October plan written the last week of September from actuals: which lane earned its budget, what the funnel said, whether Phase 3 truly opened.
- If the 5 paying materialize, `SUCCESS.md` Bet 3 gets its first real data point; update it in the same commit as the October plan.
- Founding 100 spots remaining gets restated; the tier's retirement story starts being told honestly once < 20 remain.
