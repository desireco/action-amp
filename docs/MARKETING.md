# ActionAmp — Public Marketing Site

> Status: DRAFT v1
> Goal: explain the wedge, convert visitors to **waitlist** (pre-launch) → **signups** (post-launch).
> The home page does ~90% of the work. Other pages are supporting.

---

## 0. Positioning (the through-line for every page)

**For:** people with too much on their plate — ADHD, trouble focusing, the chronically overwhelmed.
**The wedge:** every todo app optimizes *capture*. ActionAmp optimizes *the decision* — what to do next.
**One-liner:** *"Stop managing your list. Start doing the next thing."*

Everything on the site earns this sentence. If a section doesn't, cut it.

---

## 1. Pages

| Route | Page | Status | Purpose |
|---|---|---|---|
| `/` | **Home** | MVP | The whole pitch in one scroll. The main asset. |
| `/waitlist` | Waitlist confirmation | MVP | Post-signup thank-you + share. |
| `/about` | About / story | MVP-light | Why this exists, who's behind it. Builds trust. |
| `/privacy` | Privacy policy | MVP | Required. Keep plain-language. |
| `/terms` | Terms of service | MVP | Required. |
| `/login` · `/signup` | Auth | Post-launch | Funnel from CTAs once the app exists. |
| `/pricing` | Pricing | Post-launch | Single free tier or free + pro. Defer until product ships. |
| `/blog` | Blog / resources | Phase 2 | ADHD/focus/GTD content. SEO + community. |
| `/help` | Help / docs | Phase 2 | Onboarding + shortcuts reference. |

**Pre-launch set: Home + Waitlist + About + Privacy + Terms.** That's it to go live.

---

## 2. Home page — section-by-section

The home page is one long scroll, each section answering one question a visitor has.

### S1. Nav (sticky)
`ActionAmp` logo · `How it works` · `For ADHD` · `About` · `Blog` *(P2)* · `[ Log in ]` · `[ Join the waitlist ]`

### S2. Hero — the wedge, visceral
- **Headline (draft):** *Stop managing your list. Start doing the next thing.*
- **Subhead:** ActionAmp is a focus app for people with too much on their plate. Capture everything — then let it show you the *one* thing to do now.
- **Email capture:** single field + button "Get early access." → `/waitlist`.
- **Visual:** a calm, minimal mock of the "What Now" screen — one task, big, the rest hidden. (Contrast with a chaotic cluttered-list screenshot faded behind it.)
- **Micro-trust line:** "No spam. One email when we launch."

### S3. The problem (name the pain)
- Headline: *Your todo app is part of why you can't focus.*
- Body: a 200-word version of the 5-step loop (capture → clarify → **focus** → do → complete), with **focus** highlighted as where overwhelm lives. "You don't fail to write things down. You fail to pick."
- Visual: the loop diagram, step 3 lit up.

### S4. How it works (3 steps)
1. **Capture** — `⌘K` from anywhere. Thought → inbox. Under 2 seconds.
2. **Triage** — decide what each thing *is* (task, project, reference) — GTD-style.
3. **Focus** — ActionAmp picks the next thing. You do it. The rest disappears.

### S5. "What Now" — the soul (feature spotlight)
The hero feature gets its own section.
- Headline: *The home screen isn't a list. It's a decision.*
- Show the What Now mock again, bigger, with callouts: context line, the one task, Do / Not now.
- One-line "why this?": transparency — "Important · due today · 15 min."

### S6. Built for the methodology-aware (credibility)
- *"GTD-compatible, with a flavor of PARA."* One paragraph. Links to a deeper explainer *(P2)*.
- Mention: Inbox → Goals → Projects → Tasks. Priority + Size (XL makes you break it down).
- This section signals seriousness to the Things/TickTick power-user crowd without alienating beginners.

### S7. Designed for focus (craft signal)
- Keyboard-first: every action has a shortcut. `?` shows them all.
- Calm by default: dark theme, generous whitespace, no red-dot guilt notifications.
- Inspirations named softly: *"If Things and a focus coach had a baby."*

### S8. Who it's for
Three short personas, one line each:
- **ADHD brains** — the decision is the wall. We lower it.
- **Too much on your plate** — capture the firehose, surface the next drop.
- **Recovering productivity-app addicts** — tired of configuring Trello. Want to *do*.

### S9. FAQ
- *Is this just another todo app?* — No. The list is demoted; "what now" is the home screen.
- *Do I need to know GTD/PARA?* — No. It's there if you want it; invisible if you don't.
- *When does it launch?* — [honest date or "soon — join the waitlist"].
- *Will it have a mobile app?* — Web first; mobile comes after.
- *Pricing?* — Free tier at launch; details closer to release.

### S10. Final CTA
- Headline: *Do the next thing. Not all the things.*
- Email capture (repeat).
- Button: "Join the waitlist."

### S11. Footer
Logo · tagline · `About` · `Privacy` · `Terms` · `Blog` *(P2)* · `Contact` · social · © .

---

## 3. Waitlist confirmation (`/waitlist`)
- Thank-you + what happens next ("We'll email you when it's ready. Maybe once before then.").
- Mock screenshot or animated teaser to keep excitement.
- Link back to About for the curious.
- **No referral / virality mechanic.** Just a clean confirmation — on-brand for a calm, no-manipulation tool.

---

## 4. About (`/about`)
Short and human:
- Why this exists — the founder's "too much on my plate" moment.
- The bet: focus apps optimize capture; nobody optimizes the decision.
- What we believe (3 bullets: calm over features, action over lists, honesty over nudges-as-guilt).
- Contact / social.
- *(Optional: a photo or a handwritten note vibe — craft signal.)*

---

## 5. Where it lives — DECIDED: Wasp public routes (one domain)

**The public site lives inside the Wasp app as `authRequired: false` routes.** One deploy, one domain, marketing at `/` and app at `/today` etc. Marketing and app share styling/components. *(Considered: separate static site, hybrid subdomain — rejected for the extra moving parts.)*

---

## 6. Copywriting — DECIDED

1. **Headline:** *"Easiest way to get into action."* Direct, honest, universal.
2. **Positioning:** **Universal** — for anyone overwhelmed, not framed around a specific condition. The "who it's for" section names overwhelm/focus pain without leading with clinical framing.
3. **Capture:** **plain waitlist** (enter email to be notified) now; flip to signup at launch.

---

## 7. Open decisions (need your call)

1. **Where does the site live?** Wasp public routes (lean) / separate static site / hybrid subdomain?
2. **Waitlist mechanic** — plain signup, or referral/skip-the-line virality? *(Lean: referral — cheap to build, big leverage pre-launch.)*
3. **Headline direction** — which of the three drafts resonates, or do you have your own?
4. **ADHD forward or universal?** *(Lean: forward, framed inclusively.)*
5. **Design references** — any sites whose feel you want to steal? (Things, Linear, Sunsama, Notion's marketing, Arc browser, etc.)
