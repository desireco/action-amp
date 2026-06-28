# Launch Sequence — Free Users

> What actually stands between today and responsibly opening the doors to free
> users. Distilled from `docs/ROADMAP.md` (§GTM prep) and `docs/BACKLOG.md` on
> 2026-06-27. The product is already live (Railway, Postgres, Resend, Stripe,
> full core loop, 195 tests green) — the blockers are almost entirely non-code
> setup.

**The one-line read:** code is in good shape. Four of the five true blockers are
pure setup/config that no amount of building accelerates. Free users could be
welcomed this week if Section 1 is knocked out.

---

## 1. True blockers (must-do before opening the doors)

These make taking a real user responsible. Four of five are non-code — track in
`docs/ROADMAP.md` §GTM prep B.

- [ ] **Email deliverability — SPF/DKIM/DMARC on `noreply@actionamp.com`.**
      This is the actual front door. Magic-link auth goes out via Resend; if it
      lands in spam, **no one can sign up at all.** Set the DNS records, then
      send a test signup + password-reset to a Gmail *and* Outlook address and
      confirm inbox placement. No code accelerates this.
- [ ] **DB backup/snapshot policy on Railway Postgres.** The moment a real user
      entrusts their tasks to you, no backups = unacceptable. Confirm automated
      backups are on and that you can actually restore from one.
- [ ] **A real, monitored `privacy@` / `legal@actionamp.com` inbox.** Privacy +
      Terms already reference them — compliance and trust requirement, not
      polish. (Carried forward as an open gate from `legal-pages-oauth`.)
- [ ] **Stripe in production mode — verify.** Confirm the live (not test) keys
      + webhook signature point at `api.actionamp.com/webhooks/stripe`. Code is
      wired; verify it's aimed at prod.
- [ ] **Analytics + ship `observability-minimal`.** The one code item on the
      critical path. Pick Plausible or PostHog (lean: Plausible), create the
      site, get the key — then Build lands the tracker + the 4 funnel events
      (land → signup → app-open → checkout). Without it: *"every GTM decision is
      a guess."* Spec: `docs/specs/observability-minimal.md`.

---

## 2. Strongly recommended (not a blocker for *free* users)

- [ ] **Google OAuth console setup.** Code is done (`social-auth-google`
      shipped). Create the Google Cloud OAuth consent screen, register
      `actionamp.com/auth/google/callback` (+ localhost), get the credentials,
      set them in Railway. Cuts signup friction; not required — email auth
      works without it.
- [ ] **Entitlement enforcement.** *Not* a free-user blocker — the opposite
      problem. Right now free users get the *entire* product (unlimited
      projects/goals, both lenses), which is a **conversion/billing leak**, not
      a harm to free users. The roadmap's own audit: *"Fixing the welcome is
      more urgent than fixing the wall."* Welcome is shipped; the wall can wait
      until there's traffic. Caveat: it leaves the privacy policy's
      data-retention clause slightly hedged. Spec:
      `docs/specs/entitlement-enforcement.md`.

---

## 3. Explicitly not required for free users

Everything in the roadmap's "Next" and "Then" tiers is valuable but not on the
free-user path. The roadmap is emphatic that building these before proving
anyone wants the current product is *"malpractice"* (§0) and the *"classic
indie death spiral"* (§Open strategic questions):

- `focus-engine-v2` (moment-aware matcher; gated on the matcher test)
- `command-palette-search` (`⌘K` reclaim + search)
- `resources-project-owned`
- `friction-cleanup` (Upcoming route removal, Goal detail, "Done today", crumbs)
- `work-area-merged` (merged surface + activity log)
- `cli` + orchestration skills (developer surface)
- `public-launch-readiness` (Product Hunt, marketing pack, real pricing page —
  that's the *paid* launch, gated on validation, not the free-user open)

---

## Sequencing

1. **In parallel, now:** the user knocks out Section 1's four non-code items
   (DNS, backups, inbox, Stripe verify) while Build lands
   `observability-minimal`. They're independent tracks.
2. **Once Section 1 is green:** doors can open to free users.
3. **Recommended, in the same window:** Google OAuth console (cuts friction).
4. **After traffic exists:** revisit entitlement enforcement with data.

The rule, from the roadmap: no phase advances until its trigger is met. If
traffic shows a broken funnel (e.g. 500 visitors, 2 signups), the answer is
never "launch harder" — it's go fix retention or the matcher.
