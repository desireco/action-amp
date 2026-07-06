# ActionAmp — Public Pages Spec

> Status: DRAFT v2 — 2026-07-03
> Authority: derived from `MARKETING.md` (positioning, hosting decision) +
> `INTERACTION.md` (modal architecture). **On conflict, `PRODUCT.md` wins.**
> Scope: every public-facing surface — marketing landing, the Founding 100 offer,
> onboarding flows, and supporting pages.

---

## 0. CTA philosophy (read first — load-bearing)

The waitlist is gone. It was removed because it felt like manipulation (see
`PRODUCT.md` Strategic Principle #3). What replaces it, for now:

- **The Founding 100** (`/founding-100`) — the real conversion surface today: a
  one-time $139 lifetime Pro tier capped at 100 spots, with a live checkout.
  This is the only CTA that asks for money.
- **A newsletter** — plain email capture, **footer always, plus a quiet field in
  the hero**. Low-pressure copy, no scarcity, no referral, no incentives.
- **Post-launch signup** — when the app is broadly available, the newsletter CTAs
  flip to "Make an account" (the hero already does this today — see §1).

What the newsletter is **not**: no referral/skip-the-line, no milestone rewards,
no launch countdown, no "be first" framing. The no-manipulation principle that
killed the waitlist governs the newsletter too. One field, one button, one honest
line: *"One email when there's something to say. No spam, no countdowns."*

> **Principle.** Governed by `PRODUCT.md` §"Fair to users" (revised 2026-07-03):
> signup, paid push, and the honest Founding 100 cap are all in-bounds;
> deception, trapping, and guilt-tripping are out. The newsletter is plain
> capture with no invented urgency — not because asking is dishonest, but
> because the deal is "we email when there's something to say."

---

## 1. Tier 1 — Live / minimum to go live

### P1. `/` — Home (the full pitch, one scroll)
The whole story in one page. Spec'd section-by-section in `MARKETING.md §2` and
**shipped** at `src/landing/LandingPage.tsx`. Current state:
- Nav (sticky): logo · How it works · Why · Methodology · FAQ · `[ Log in ]`
- Hero — *"Easiest way to get into action"* + Next-card mock (animated complete)
  + **CTA: "Make an account"** (→ `/signup`)
- The problem — capture vs. decision
- How it works — Capture → Triage → Focus (3 steps)
- "Next" spotlight — *the home screen isn't a list, it's a decision*
- Methodology — GTD-compatible, Goals-over-Areas (PARA flavor)
- FAQ — honest answers (incl. *"Soon. When it's ready, you'll know."*)
- Final CTA — *Do the next thing. Not all the things.* + "Make an account"
- Footer — logo · About · Privacy · Terms · **Founding 100** · ©

**Newsletter gaps to fill (per §0 decision):**
1. **Hero — add a quiet newsletter field** alongside (or below) the existing
   "Make an account" CTA. Anti-sales microcopy underneath. This is the new
   pre-launch/default capture; "Make an account" stays for people ready now.
2. **Footer — add a newsletter signup** (single email field + subscribe button)
   with the same honest microcopy. Lives next to the existing footer links.

### P2. `/founding-100` — The Founding 100 (LIVE, ships as-is)
**Already built and live** — `src/public/Founding100Page.tsx`. Not a spec, a record.

- **Offer:** one-time $139 lifetime Pro, capped at exactly 100 spots. When the
  100th spot is claimed, the tier retires permanently and Pro becomes yearly-only.
- **Why it exists:** funds development without VC, gives early believers a patron
  role, avoids the subscription treadmill. Stated in the page copy itself.
- **Mechanics:**
  - Live spots-remaining counter from `getFounding100Status`.
  - CTA enabled while spots remain **and** the user is signed in (checkout needs
    auth). Logged-out users get redirected to `/login?redirect=/founding-100`.
  - Checkout via `createCheckoutSession({ priceKey: "founder" })` → Stripe.
  - States handled: live / full ("All 100 spots claimed") / already-a-founder.
- **Tone:** patronage, not FOMO. The cap is real (100 is a business-health guard
  rail, not a fake scarcity lever) — copy explains *why* 100, which is the honest
  version of scarcity. This is the line; do not cross it into countdowns or
  "only N left today" messaging.

### P2b. `/founding-100/welcome` — Post-checkout thank-you
**Already built** — `src/public/Founding100WelcomePage.tsx`. Stripe `success_url`.
- Polls auth until the webhook flips `plan=FOUNDER`, then shows the celebration
  ("Welcome, Founding Member. You are member #N of 100.").
- Three states: **Finalizing** (≤45s) → **StillConfirming** (timeout, webhook is
  still truth) → **Congratulations**. No faking — if the webhook hasn't landed,
  the page says so and points at `/about` to reach out.
- Auth required (a founder must be logged in to have paid).

### P3. `/about` — About / story
- Why this exists — the founder's "too much on my plate" moment.
- The bet: capture is solved; deciding is not.
- What we believe (calm over features, action over lists, honesty over nudges-as-guilt).
- Contact / social.

### P4. `/privacy` — Privacy policy (required)
Plain language. Required for auth flows.

### P5. `/terms` — Terms of service (required)
Required. (Note: Founding 100 commerce makes this more load-bearing than it was —
worth a real pass, not boilerplate, before pushing the offer hard.)

---

## 2. Tier 2 — Onboarding (the make-or-break)

**The risk:** ActionAmp is modal. Modal apps are powerful but hard to discover. If
a new user signs up, opens the app, and has no idea how to move — they bounce.
Onboarding isn't a "nice to have" here; it's the whole ballgame.

The spine: **Welcome → Coach → First capture → First triage → Lens setup**. Each
step skippable but defaults to "show me."

### O1. `/welcome` — First-run welcome (post-signup, pre-app)
The moment after signup. One calm screen:
- "You're in. ActionAmp works a little differently — it's about deciding what to
  do next, not collecting more things."
- Two buttons:
  - **"Show me the moves" (30 sec)** → enters the Coach
  - **"Just drop me in"** → enters the app at empty state
- Remembers the choice; never shows again (unless replayed from `/help`).

### O2. The Coach (gestures + modes tutorial)
Prototyped at `docs/mockups/mobile-coach.html`. Opening line:
> *"We're special. Let's teach you the moves."*

4 lessons, one per screen, each with an animated gesture demo:
1. **Long-press the card → start working** (the sacred one — teach first)
2. **Two-finger swipe → zoom Task/Project/Goal** (the signature mobile gesture)
3. **One-finger swipe → Plan/Do/Review** (the mode dial)
4. **Tap breadcrumb → jump to scope** (the escape hatch; gestures aren't required)

Closing line: *"That's it. Go do something."* (Not "You're all set!" — too cheerful.)

### O3. First-capture prompt (in-app, not a page)
Empty Next state with a single gentle prompt:
- "Add your first thought" + a subtle pulse on the capture FAB / `⌘K` hint
- User types anything → it lands in Inbox → the prompt updates to:
- "Nice. Now there's something in your Inbox. Want to triage it?" → yes leads to O4

### O4. First-triage walkthrough (in-app, one-time)
When the user opens Inbox for the first time with ≥1 item, a one-time coach overlay:
- "Triage = deciding what each thing *is*. Task, Project, or Resource."
- Highlights the property rows (When / Size / Priority / Project)
- "Confirm when you're happy. The thing leaves the Inbox for good."
- Disappears after the first dispatch (or on skip).

### O5. Lens setup (in-app, optional)
- "Work and Me are your two lenses — they keep parts of your life separate."
- Shows the Lens pill with rename buttons
- "Skip for now — rename later in Settings."
- Most users will skip; that's fine.

---

## 3. Tier 3 — Post-launch public

### P6. `/login` + `/signup` — Auth
- Email + social (Google + one other TBD). Social to be added to the Wasp scaffold.
- Post-auth redirect → `/welcome` (first run) or `/` (returning user).

### P7. `/pricing` — Pricing
- **Defer until there's a standard paid tier.** Today the only paid surface is the
  Founding 100 (`/founding-100`); standard Pro is yearly-only *after* the Founding
  100 fills. Don't build a `/pricing` page until there's a recurring tier to show;
  a "Free while we're in beta" line on the home + Founding 100 covers it.

### P8. `/help` — Help / docs
- Shortcuts reference (the `?` cheatsheet, web-version)
- Replay the onboarding coach
- FAQ (deeper than the home FAQ)
- Contact / report a bug

### P9. `/changelog` — Changelog
- What's new. Builds trust, shows momentum. Pairs with the newsletter: "we email
  when there's real news; otherwise watch `/changelog`." Even a sparse one signals
  life without faking it.

---

## 4. Tier 4 — Growth / content → moved to BACKLOG

`/blog`, `/guides`, `/community` are real ideas but not shipping work — they're
**Phase 2** (parked). This doc stays focused on what ships. When one of them is
ready to build, it gets a spec in `docs/specs/` and returns here as a Tier 3 item.

---

## 5. What collapses / doesn't exist

- **No `/waitlist`.** Removed (PRODUCT.md #3). The home captures via newsletter;
  the Founding 100 captures via checkout. There is no separate email-confirmation
  page — a newsletter signup confirms inline (toast / line under the field).
- **No `/pricing` until a recurring tier exists.** Founding 100 is the only paid
  surface today.
- **No `/dashboard` or `/app` portal page.** The app's home IS Next (`/app`).
  Auth-required routes are the app; public routes are everything in this doc.

---

## 6. The public → app handoff

```
visitor → / → (newsletter capture, inline confirm)
                Founding 100 → /founding-100 → /login → Stripe → /founding-100/welcome
                                                                          ↓
                                                                       /app

ready user → /signup → auth → /welcome (first-run) → coach → /app
returning  → /login  → auth → /app (Next)
```

**Public routes** (`authRequired: false`): `/`, `/about`, `/privacy`, `/terms`,
`/founding-100`, `/login`, `/signup`, `/help`, `/changelog` (planned), `/welcome`
(gated by first-run flag). `/founding-100/welcome` is auth-required (a founder
must be logged in to have paid).

**App routes** (auth-required): Next (`/app`), Inbox, Triage, Today, Upcoming,
Someday, Projects, Goals, Logbook, Settings, Billing, Preferences, Task detail.

---

## 7. Build order (proposal)

1. **Home newsletter fields (P1 §1 gaps)** — footer capture always, quiet hero
   field alongside "Make an account." Smallest gap to close; makes the public
   site stop leaking interested visitors. **Needs an email provider** (the
   auth-flow provider — Resend — gets reused for newsletter sends).
2. **Onboarding spine (O1–O5)** — the make-or-break for a modal app. Higher risk
   than the home page, but needs the home to send it traffic.
3. **About + Privacy + Terms (P3–P5)** — Terms especially, given Founding 100
   commerce. Fast, but worth doing properly.
4. Everything else defers.

---

## 8. Open decisions (need your call)

1. **Onboarding default: "Show me" or "Just drop me in"?** Lean: **"Show me"** as
   the primary (pre-selected), "Just drop me in" as the escape. Modal apps lose
   users who skip the tutorial.
2. **Social auth providers: Google + what?** Apple (iOS users), GitHub (devs), or
   just Google alone for MVP? Lean: **Google + Apple** (covers most non-typing flows).
3. **First-run detection:** cookie-based, or user-account flag (`hasSeenOnboarding`)?
   Lean: **account flag** — survives device switches. *(Field already exists in schema.)*
4. **Does the coach replay from `/help`?** Lean: yes — power users will want to
   re-show it to friends.
5. **Newsletter provider** — reuse the auth email provider (Resend/Postmark) or a
   dedicated tool (Buttondown, Beehiiv)? Lean: **dedicated** (unsubscribe handling,
   broadcast vs. transactional separation) unless volume is trivial.

---

## 9. Cascade history

The newsletter + Founding 100 decision (2026-07-03) cascaded up to the
higher-authority docs. Recorded so the reasoning isn't lost:

- **`PRODUCT.md`** — Strategic Principle #3 reframed from "honesty over nudges
  / pure signpost" to **"Fair to users"** (permits signup, paid push, nudge,
  honest scarcity; bans deception, trapping, guilt-tripping). "Current CTA"
  rewritten: signup + newsletter + Founding 100, all fair-play.
- **`docs/ROADMAP.md`** — §0 "single most important fact" no longer claims
  "no email list"; Open Q #3 ("the pure signpost landing page") marked
  **RESOLVED 2026-07-03**; GTM "Owned" channels updated (email list is live,
  job is to grow it).

The canonical set (`PRODUCT.md`, `ROADMAP.md`, this doc) now agrees: the CTAs
are signup + newsletter + Founding 100, governed by the fairness principle, not
by "no nudge ever."
