# ActionAmp — Public Pages Spec

> Status: DRAFT v1 — 2026-06-16
> Authority: derived from `MARKETING.md` (positioning, hosting decision) + `INTERACTION.md` (modal architecture).
> Scope: every public-facing surface — marketing landing, onboarding flows, and supporting pages.

---

## 0. Decisions already locked (from MARKETING.md)

- **Hosting:** Wasp public routes (`authRequired: false`), one domain. Marketing at `/`, app at `/app` etc.
- **Waitlist:** plain email capture. No referral/skip-the-line virality.
- **Headline:** *"Easiest way to get into action."*
- **Positioning:** universal (anyone overwhelmed), not condition-specific.
- **Design:** Things-inspired DNA (see `design.md`); teal + amber system (see `mockups/teal-amber-system.html`).
- **CTA pre-launch:** email → waitlist. Post-launch: flip to signup.

---

## 1. Tier 1 — Pre-launch (minimum to go live)

### P1. `/` — Home (the full pitch, one scroll)
The whole story in one page. Already spec'd section-by-section in `MARKETING.md §2`:
- Nav (sticky): logo · How it works · For you · About · `[ Log in ]` · `[ Join the waitlist ]`
- S1 Hero — headline + email capture + What Now mock visual
- S2 The problem — name the pain (capture vs. decision)
- S3 How it works — Capture → Triage → Focus (3 steps)
- S4 "What Now" spotlight — the soul of the app
- S5 Methodology — GTD-compatible + PARA flavor (Goals replace Areas)
- S6 Craft — keyboard-first, calm, no guilt-red-dots
- S7 Who it's for — overwhelmed / ADHD / recovering-app-addicts
- S8 FAQ
- S9 Final CTA
- S11 Footer

### P2. `/waitlist` — Waitlist confirmation
- Thank-you + what happens next ("We'll email you when it's ready. Maybe once before then.")
- Mock screenshot or animated teaser to keep excitement.
- Link back to About for the curious.
- **No referral mechanic.**

### P3. `/about` — About / story
- Why this exists — the founder's "too much on my plate" moment.
- The bet: capture is solved; deciding is not.
- What we believe (calm over features, action over lists, honesty over nudges-as-guilt).
- Contact / social.

### P4. `/privacy` — Privacy policy (required)
Plain language. Required for auth flows + waitlist.

### P5. `/terms` — Terms of service (required)
Required.

---

## 2. Tier 2 — Onboarding (the make-or-break)

**The risk:** ActionAmp is modal. Modal apps are powerful but hard to discover. If a new user signs up, opens the app, and has no idea how to move — they bounce. Onboarding isn't a "nice to have" here; it's the whole ballgame.

The spine of onboarding: **Welcome → Coach → First capture → First triage → Lens setup**. Each step is skippable but defaults to "show me."

### O1. `/welcome` — First-run welcome (post-signup, pre-app)
The moment after signup. One calm screen:
- "You're in. ActionAmp works a little differently — it's about deciding what to do next, not collecting more things."
- Two buttons:
  - **"Show me the moves" (30 sec)** → enters the Coach
  - **"Just drop me in"** → enters the app at empty state
- Remembers the choice; never shows again (unless replayed from `/help`).

### O2. The Coach (gestures + modes tutorial)
Already prototyped at `docs/mockups/mobile-coach.html`. Opening line:
> *"We're special. Let's teach you the moves."*

4 lessons, one per screen, each with an animated gesture demo:
1. **Long-press the card → start working** (the sacred one — teach first)
2. **Two-finger swipe → zoom Task/Project/Goal** (the signature mobile gesture)
3. **One-finger swipe → Plan/Do/Review** (the mode dial)
4. **Tap breadcrumb → jump to scope** (the escape hatch; gestures aren't required)

Closing line: *"That's it. Go do something."* (Not "You're all set!" — too cheerful.)

### O3. First-capture prompt (in-app, not a page)
Empty What Now state with a single gentle prompt:
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
- **Defer until there's a paid tier.** At launch: free. Don't build a pricing page until there's something to charge for; a "Free at launch" line on the home FAQ covers it.

### P8. `/help` — Help / docs
- Shortcuts reference (the `?` cheatsheet, web-version)
- Replay the onboarding coach
- FAQ (deeper than the home FAQ)
- Contact / report a bug

### P9. `/changelog` — Changelog
- What's new. Builds trust, shows momentum. Even a sparse one ("Week of Jun 16: launched waitlist") signals life.

---

## 4. Tier 4 — Growth / content (Phase 2)

### P10. `/blog` — Blog
ADHD/focus/GTD content. SEO + community.

### P11. `/guides` — Deeper guides
"How to use ActionAmp with GTD", "Setting up your lenses", "Weekly review ritual". Long-form, evergreen.

### P12. `/community` — Community
Discord/forum link or embedded. Phase 2.

---

## 5. What collapses / doesn't exist

- **No separate `/waitlist` page if we collapse it into home.** Lean: keep it as a confirmation page (P2) — the home captures, the confirmation thanks. But no growth mechanics on it.
- **No `/pricing` until paid.** "Free at launch" lives in the home FAQ.
- **No `/dashboard` or `/app` portal page.** The app's home IS What Now (`/`). Auth-required routes are the app; public routes are everything above.

---

## 6. The public → app handoff

```
visitor → / → email capture → /waitlist (confirmation)
                                    ↓ (launch)
                                 /signup → auth → /welcome (first-run) → coach → app
                                                                              ↓
                                                                          /today etc. (auth-required)
returning user → /login → auth → / (What Now)
```

Public routes (`authRequired: false`): `/`, `/waitlist`, `/about`, `/privacy`, `/terms`, `/login`, `/signup`, `/help`, `/changelog`, `/blog`, `/guides`, `/welcome` (gated by first-run flag).
App routes (auth-required): What Now, Inbox, Today, Upcoming, Someday, Projects, Goals, Logbook, Settings.

---

## 7. Build order (proposal)

1. **Home page (P1)** — the whole pitch. Without this, nothing else matters; it's the front door.
2. **Onboarding spine (O1–O5)** — the make-or-break for a modal app. Higher risk than the home page, but needs the home to send it traffic.
3. **About + Privacy + Terms (P3–P5)** — required boilerplate. Fast.
4. **Auth pages (P6)** — needed to test onboarding with real accounts.
5. Everything else defers.

---

## 8. Open decisions (need your call)

1. **Waitlist confirmation page (P2): keep or collapse into home toast?** Lean: keep — it's a moment of commitment, deserves its own calm space.
2. **Onboarding default: "Show me" or "Just drop me in"?** Lean: **"Show me"** as the primary (pre-selected), "Just drop me in" as the escape. Modal apps lose users who skip the tutorial.
3. **Social auth providers: Google + what?** Apple (iOS users), GitHub (devs), or just Google alone for MVP? Lean: **Google + Apple** (covers most non-typing flows).
4. **First-run detection:** cookie-based, or user-account flag (`hasSeenOnboarding`)? Lean: **account flag** — survives device switches.
5. **Does the coach replay from `/help`?** Lean: yes — power users will want to re-show it to friends.
