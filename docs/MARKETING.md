# ActionAmp — Public Marketing Site

> Status: DRAFT v2 — 2026-07-03
> Goal: explain the wedge, convert visitors via **signup + newsletter +
> Founding 100**. The home page does ~90% of the work. Other pages support.
> Authority: reference doc. On conflict, `PRODUCT.md` (principles) and
> `docs/PUBLIC-PAGES.md` (page inventory) win.

---

## 0. Positioning + principle (the through-line for every page)

**For:** people with too much on their plate — ADHD, trouble focusing, the chronically overwhelmed.
**The wedge:** every todo app optimizes *capture*. ActionAmp optimizes *the decision* — what to do next.
**One-liner:** *"Easiest way to get into action."*

Everything on the site earns that sentence. If a section doesn't, cut it.

**Governing principle — `PRODUCT.md` §"Fair to users":** asking for the signup,
selling the paid plan, sending the occasional nudge is fair play. What's out:
deceiving (fake scarcity, invented social proof), trapping (hard-to-cancel,
data lock-in), guilt-tripping (streaks, red dots, badge FOMO). Real scarcity
stated honestly — the Founding 100 cap — is fair. The site sells without
manipulating; it does not apologize for selling.

---

## 1. Pages

| Route | Page | Status | Purpose |
|---|---|---|---|
| `/` | **Home** | live | The whole pitch in one scroll. The main asset. |
| `/founding-100` | **Founding 100** | live | One-time $139 lifetime Pro, capped at 100 spots. The patron offer. |
| `/founding-100/welcome` | Post-checkout | live | Stripe success_url; thanks the new founder. |
| `/about` | About / story | live-light | Why this exists, who's behind it. Builds trust. |
| `/privacy` | Privacy policy | live | Required. Plain-language. |
| `/terms` | Terms of service | live | Required (more load-bearing now that commerce is live). |
| `/login` · `/signup` | Auth | live | Funnel from CTAs. |
| `/help` | Help / docs | Phase 2 | Onboarding replay + shortcuts reference. |
| `/changelog` | Changelog | Phase 2 | "What's new" — pairs with the newsletter. |
| `/pricing` | Pricing | post-launch | Defer until a recurring paid tier exists. |

**Tier 4 growth pages** (`/blog`, `/guides`, `/community`) live in
`docs/BACKLOG.md`, not here — see `docs/PUBLIC-PAGES.md` §4.

---

## 2. Home page — section-by-section

The home page is one long scroll, each section answering one question a visitor has.
**Shipped** at `src/landing/LandingPage.tsx`. Sections below match the live page;
gaps marked **(to add)** are the newsletter work per `PUBLIC-PAGES.md` §1.

### S1. Nav (sticky)
`ActionAmp` logo · `How it works` · `Why` · `Methodology` · `FAQ` · `[ Log in ]`

### S2. Hero — the wedge, visceral
- **Headline:** *Easiest way to get into action.*
- **Subhead:** Every other app opens to your list. ActionAmp opens to the **one thing** to do next.
- **Visual:** the Next-card mock — one task, big, animated complete-on-click. A faded "chaos list" sits behind it for contrast.
- **Primary CTA:** **"Make an account"** → `/signup`. Asking for the signup is the point, not manipulation.
- **(to add) Quiet newsletter field** alongside the signup button, with anti-sales microcopy: *"One email when there's something to say."* This is the catch for visitors who aren't ready to sign up but want to follow along.
- **Trust chips:** Keyboard-first · Calm by default · GTD-compatible.

### S3. The expectation (name the pain)
- Headline: *Your app should support your focus.*
- Body: most apps optimize capture; none optimize the decision. The list grows faster than you can work it. "You don't fail to capture. You fail to pick."
- Punch: *So we made something that does the picking for you.*
- (Shipped section id: `#how` anchor lives on S4; this section sets up the contrast.)

### S4. How it works (3 steps)
1. **Capture** — `⌘K` from anywhere. Thought → inbox. Under 2 seconds.
2. **Triage** — decide what each thing *is* (task, project, reference) — GTD-style.
3. **Focus** — ActionAmp picks the next thing. You do it. The rest disappears.

### S5. "Next" — the soul (feature spotlight)
- Headline: *The home screen isn't a list. It's a decision.*
- Every other app opens to your full todo list. ActionAmp opens to one task, the next thing that matters, and hides the rest. You can always see it. You just don't have to.

### S6. Methodology (credibility)
- *GTD-compatible, with a flavor of PARA.* If you know Getting Things Done, you're home. If you don't, none of that matters.
- The one deliberate change: PARA's **Areas** became **Goals**. Areas are passive buckets ("Health", "Finance"); Goals are active outcomes ("Run a 10k"). For an app about action, the active framing fits.
- Badges: `/Inbox → triage` · `/Goals over areas` · `/Projects & tasks` · `/Priority + size`.

### S7. FAQ (honest answers)
- *Is this just another todo app?* — No. The list is demoted; "what now" is the home screen.
- *Do I need to know GTD?* — No. It's there if you want it; invisible if you don't.
- *When does it launch?* — Soon. When it's ready, you'll know.

### S8. Final CTA
- Headline: *Do the next thing. Not all the things.*
- "Free while we're in beta."
- Button: **"Make an account"** → `/signup`.
- Secondary: *"Already use it? Log in."*

### S9. Footer
- Logo + tagline.
- Links: `About` · `Privacy` · `Terms` · **`Founding 100`** · © 2026 ActionAmp.
- **(to add) Newsletter capture** — single email field + subscribe, same microcopy as the hero. Always present; the catch for anyone who scrolled to the bottom.

---

## 3. Founding 100 (`/founding-100`) — LIVE

Already built (`src/public/Founding100Page.tsx`); this is the copy/stance record, not a spec to write.

- **Offer:** one-time $139 lifetime Pro, capped at exactly 100 spots. After the 100th, the tier retires permanently and Pro becomes yearly-only.
- **The honest why:** lifetime plans are genuinely risky for software businesses past a point; 100 funds development without a subscription treadmill or VC. Patronage, not FOMO. The copy says this directly ("Why 100 spots?") — which is the fair version of scarcity: the limit is real and the reason is stated.
- **Mechanics:** live spots-remaining counter; checkout requires auth (logged-out users redirect to `/login?redirect=/founding-100`); Stripe via `createCheckoutSession({ priceKey: "founder" })`.
- **The line we don't cross:** no countdown timers, no "only N left today," no invented urgency. The cap is the cap; it's stated once, honestly.

### `/founding-100/welcome` — post-checkout
Stripe `success_url`. Polls auth until the webhook flips `plan=FOUNDER`, then: *"Welcome, Founding Member. You are member #N of 100."* Three states (Finalizing / StillConfirming / Congratulations) — never fakes confirmation; if the webhook is slow, the page says so and points at `/about`.

---

## 4. About (`/about`)
Short and human:
- Why this exists — the founder's "too much on my plate" moment.
- The bet: focus apps optimize capture; nobody optimizes the decision.
- What we believe (calm over features, action over lists, fair to users).
- Contact / social.
- *(Optional: a photo or a handwritten note vibe — craft signal.)*

---

## 5. Where it lives — DECIDED: Wasp public routes (one domain)

The public site lives inside the Wasp app as `authRequired: false` routes. One
deploy, one domain, marketing at `/` and app at `/app` etc. Marketing and app
share styling/components. *(Considered: separate static site, hybrid subdomain —
rejected for the extra moving parts.)* See `docs/PUBLIC-PAGES.md` §6 for the
full route inventory + the public → app handoff.

---

## 6. Copywriting — DECIDED

1. **Headline:** *"Easiest way to get into action."* Direct, honest, universal.
2. **Positioning:** **Universal** — for anyone overwhelmed, not framed around a specific condition. The "who it's for" subtext names overwhelm/focus pain without leading with clinical framing. (ADHD is the design muse, not the marketing target — `PRODUCT.md`.)
3. **CTA surfaces:** **signup** (hero + final, live now), **newsletter** (footer always + quiet hero field, to add), **Founding 100** (live, linked from footer). No waitlist.
4. **Newsletter mechanic:** plain email capture, no referral/skip-the-line, no incentives. One line of copy: *"One email when there's something to say."*
5. **Tone:** calm, not chirpy (no exclamation marks); direct, not clinical; opinionated, not aggressive; honest, not salesy. (`PRODUCT.md` §Tone of Voice.)

---

## 7. Open decisions (need your call)

1. **Social auth providers: Google + what?** Apple (iOS users), GitHub (devs), or Google alone? Lean: **Google + Apple** (covers most non-typing flows). Google is wired code-side; client config is the gate (ROADMAP §GTM prep B).
2. **Does the hero newsletter field sit beside "Make an account" or below it?** Beside = equal weight (more newsletter signups, slightly muddier primary CTA); below = signup stays primary, newsletter is the fallback. Lean: **below** — signup is the point; the newsletter is for people not ready yet.
3. **Newsletter provider** — reuse the auth email provider (Resend) or a dedicated tool (Buttondown, Beehiiv)? Lean: **dedicated** (unsubscribe handling, broadcast vs. transactional separation).

---

## 8. Resolved decisions (recorded so they don't relitigate)

- ~~Where does the site live?~~ → Wasp public routes, one domain. (§5)
- ~~Waitlist mechanic — plain signup vs referral/skip-the-line?~~ → **No waitlist.** Removed (PRODUCT.md §"Fair to users"). Replaced by newsletter (plain capture) + Founding 100 (the patron path). Referral mechanics are not dishonest in principle, but they're not the right vibe for this brand and we're not chasing viral growth.
- ~~Headline direction?~~ → *"Easiest way to get into action."* Shipped. (§6)
- ~~ADHD forward or universal?~~ → **Universal.** ADHD is the muse, not the target. (§6, PRODUCT.md)
- ~~The "pure signpost" landing page?~~ → **Resolved 2026-07-03.** Signup + newsletter + Founding 100 are all live/in-progress; governed by the fairness principle, not "no nudge ever." (ROADMAP Open Q #3.)
