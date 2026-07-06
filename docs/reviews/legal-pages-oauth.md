# Review: legal-pages-oauth

<!-- Build owns this file. Discover reads it to sign off. -->

## What changed

Branch: `build/legal-pages-oauth`. Docs + two-line auth-link additions. No code
logic, no schema, no migration.

- `webapp/src/public-content/privacy.md` — new "Third parties we use" section
  (Google auth, Stripe payments, Resend email, analytics placeholder) + "Data
  retention" section; account-data bullet notes Google sends name+email only;
  date bumped.
- `webapp/src/public-content/terms.md` — stale "Free at launch" / "if we
  introduce a paid tier" replaced with accurate "Plans and billing" (Pro /
  Prepaid / Founding 100, prices-may-change-with-notice, entitlement honored,
  links billing); age line clarified (13+, 16+ EU/UK); date bumped.
- `webapp/src/auth/email/SignupPage.tsx` — consent line in footer (point of
  submission): "By creating an account, you agree to our Terms and Privacy
  Policy."
- `webapp/src/auth/email/LoginPage.tsx` — lighter footer line linking Terms +
  Privacy.

Commits:
- `15131c3` spec: ready → building
- `a461f45` legal-pages-oauth: OAuth-ready privacy/terms + signup/login consent links
- `6b9d117` legal-pages-oauth: address review gate findings

## Gates run

- **Cold-context reviewers (2, distinct angles, fresh context — no inherited
  assumptions):**
  - **Reviewer A — correctness / compliance / done-condition coverage:** found
    **1 BLOCKER** (data-retention clause overclaimed a plan-gating limit the
    code doesn't enforce) + flagged unconfirmed contact addresses (open
    question). All other done-conditions MET.
  - **Reviewer B — markdown render + brand/tone + a11y:** no blockers; traced
    every new markdown construct through `shared/markdown.ts` renderer — all
    render correctly (h2, ul/li, bold, inline code, links). Flagged pre-existing
    underscore-italic bug (literal underscores visible), duplicate retention
    sentence, billing-path-as-inline-code (not clickable), and overclaim in the
    analytics "cookieless" wording. Tone confirmed on-brand.
  - **Verdict: blockers found → fixed → re-gated.** See Findings.
- **Diagnostics:** `wasp compile` — exit 0, twice (after impl, after fixes).
  Run per `webapp/AGENTS.md` (compile, not `tsc`).
- **Tests:** none applicable (markdown + tsx link additions; no logic). No
  existing test touches these files.
- **Manual checks:** grep confirms all `/privacy` + `/terms` references resolve
  to existing routes (`main.wasp.ts:107-110`); landing footer + PublicLayout
  links unchanged and consistent. Markdown link construct
  `[text](url)` verified against renderer regex (`shared/markdown.ts:43`).

## Done-conditions

Each predicate from `docs/specs/done/legal-pages-oauth.md` → verdict + evidence.

- [x] privacy.md discloses all third-party processors w/ plain-language purpose
      — **PASS** — `privacy.md` "Third parties we use": Google (auth, name+email
      only, no content shared), Stripe (payments, card never seen, customer ref
      stored), Resend (auth/account email delivery), Analytics (privacy-
      respecting, no cross-site tracking, provider TBD).
- [x] privacy.md "Data retention" line — **PASS (after fix)** — original draft
      overclaimed a plan-gated logbook/history limit that doesn't exist in code
      (`entitlement-enforcement` not shipped; `getLogbook` returns all). Fixed:
      now states content kept for account lifetime; deletion is permanent; refs
      "Your rights." No longer asserts an unimplemented data-handling rule.
- [x] terms.md "Free at launch" → "Plans and billing" — **PASS** — stale
      "free at launch" / "if we introduce a paid tier" removed; replaced with
      accurate free + paid (Pro/Prepaid/Founding 100); prices-may-change-with-
      notice; existing entitlement honored; links billing page.
- [x] terms.md age line — **PASS** — "13 or older (16 or older in the EU and UK,
      where local law requires it)" (`terms.md:9`).
- [x] both pages: effective date + contact line — **PASS (format)** — "Last
      updated: June 27, 2026" + `## Contact` on both. **PARTIAL (addresses):**
      `privacy@actionamp.com` / `legal@actionamp.com` are unchanged placeholders;
      spec requires they be real + monitored. → **Open question for Discover
      (see below).**
- [x] Signup form consent line at point of submission, links to /terms + /privacy
      — **PASS** — `SignupPage.tsx` footer, both links, React Router `<Link>`
      (client-side nav, no reload), copy on-voice.
- [x] Login form lighter footer line — **PASS** — `LoginPage.tsx` "See our Terms
      and Privacy Policy."
- [x] No broken links — **PASS** — all `/privacy`+`/terms` refs resolve
      (`main.wasp.ts:107-110`); `/login`,`/signup`,`/request-password-reset`
      resolve.
- [x] Pages render correctly, no raw `#` — **PASS** — all new markdown constructs
      (h2, ul/li, bold, inline code, md link) traced through renderer; supports
      h1–h3 (kept within h2); no tables/h4+ introduced.
- [x] `wasp compile` passes — **PASS** — exit 0.

## Findings

**Accepted (fixed in `6b9d117`):**
1. **[BLOCKER, both reviewers] privacy.md data-retention overclaim.** Dropped the
   "logbook/history per your plan (unlimited on Pro; free-tier limits)" clause.
   Reason: `entitlement-enforcement` hasn't shipped; `getLogbook` returns all
   completed items unconditionally — asserting a plan-based retention limit in a
   Privacy Policy would repeat the exact "claims-X-but-does-Y" defect this spec
   exists to fix (the stale "free at launch" Terms).
2. **[nit, reviewer B] duplicate "deleting your account" sentence.** Removed from
   Data retention; kept in "Your rights."
3. **[nit, reviewer B] pre-existing underscore-italic bug.** `_Last updated…_`
   showed literal underscores (renderer only does asterisk-italic). Switched to
   `*Last updated…*` on both pages. Cheap, in-scope (diff touched both lines),
   spec demands clean rendering.
4. **[nit, reviewer B] billing path as inline-code was not clickable.** Made it a
   real markdown link `[billing page in the app](https://…)`, matching the spec's
   done-condition (which asked for the full URL).
5. **[nit, reviewer A] "cookieless" overclaim for analytics.** Provider not yet
   chosen; softened to "no cross-site tracking, does not sell data," provider
   named once `observability-minimal` lands.

**Deferred (legitimately out of scope for this spec):**
- Analytics provider name → `observability-minimal`. Left a clearly-marked
  placeholder per spec's open-question guidance.
- Logbook/history plan limits → `entitlement-enforcement`. If/when that ships,
  privacy.md's retention line should be revisited to describe the *actual* rule.

**Rejected:** none.

## Verdict

**ready-for-signoff.**

All done-conditions PASS; blocker + nits resolved; `wasp compile` green.
**Two items for Discover before merge/launch** (not code blockers — process/
human items):

1. **Contact addresses (`privacy@actionamp.com` / `legal@actionamp.com`) must be
   real, monitored inboxes.** This is the spec's open question and a Google OAuth
   verification expectation. Confirm or point at a single real address; I'll
   update the two lines. (Also listed in ROADMAP §GTM-prep B.)
2. **Plain-language draft, not legal review.** The spec's non-goals say formal
   legal review is the user's call before launch — flagging that here.

Once Discover confirms (1), this is `done`. I'm proceeding to
`first-run-experience` (next in queue) on this same branch flow.
