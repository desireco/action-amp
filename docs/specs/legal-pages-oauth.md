---
feature: legal-pages-oauth
status: review
spec_owner: discover
build_owner: build
---

# Feature: Legal pages — OAuth-ready content + collection-point links

## Summary

The `/privacy` and `/terms` pages already exist and render from markdown, and
they're already linked in the landing footer. But they have two problems that
block Google OAuth verification and are factually stale: (1) the **content**
doesn't disclose the third parties Google verification requires (Google auth,
Stripe payments, analytics) and the Terms still say "free at launch / if we
introduce a paid tier" when **billing is already live**; (2) they're not
linked **at the point of collection** (the signup form), which Google requires.
This spec updates the markdown content and adds the consent links to the auth
forms. It's a prerequisite for `social-auth-google`.

## Why

Three concrete reasons:

1. **Google OAuth verification checks the Privacy Policy for disclosure of the
   auth provider itself, plus any payment/analytics processors.** The current
   `privacy.md` (256 words, dated 2026-06-16) describes only email/password +
   "anonymized metrics" — it doesn't name Google, Stripe, or an analytics
   provider. A reviewer (or the automated check) flags this and the consent
   screen stays unverified → users see a scary "Google hasn't verified this
   app" warning.
2. **The Terms are now false.** `terms.md` §"Free at launch" says *"ActionAmp
   is free during its initial launch. If we introduce a paid tier..."* — but
   Pro ($79.50/yr), Prepaid ($90), and Founding 100 ($139) are **live with
   working checkout**. Shipping paid features with Terms that say there are
   none is a real (if low-stakes) legal/policy problem.
3. **Collection-point consent.** Google and basic best practice require the
   Privacy + Terms links to appear at the data-collection step, not only in a
   footer a user has to scroll to. `SignupPage.tsx` has no such links today.

## Done-conditions

- [ ] **`privacy.md` discloses all third-party processors**, each with a plain-
      language purpose, in a "Third parties we use" section:
      - **Google** — for optional "Sign in with Google" authentication. We
        receive your name + email; we do not share your content with Google.
      - **Stripe** — for payments. Card data goes to Stripe directly (we never
        see or store it); we store only a Stripe customer reference + payment
        records.
      - **Email provider (Resend)** — to deliver auth/account emails.
      - **Analytics** — name the provider once `observability-minimal` lands
        (placeholder: "a privacy-respecting analytics provider; no
        cross-site tracking, no selling data"). If shipping before analytics,
        keep the existing "anonymized metrics" line and add a note that
        analytics details will appear here.
- [ ] **`privacy.md` adds a "Data retention" line:** tasks/content kept until
      account deletion; logbook/history per the plan (Pro = unlimited, Free =
      per current limits — match whatever `entitlement-enforcement` ships).
- [ ] **`terms.md` "Free at launch" section is rewritten** to reflect reality:
      a "Plans and billing" section stating that ActionAmp has a free tier and
      paid plans (Pro, Prepaid, Founding 100), that prices may change with
      notice, and that a user's existing paid entitlement is honored. Reference
      `https://actionamp.com/app/settings/billing` or a future `/pricing` for
      current prices. Remove the "if we introduce a paid tier" language.
- [ ] **`terms.md` adds an age line** if not present: 13+ (or 16+ in the EU/
      UK under GDPR) — the current "13 or older" line is fine; confirm it
      covers Google's Family-policy expectations.
- [ ] **Both pages carry an effective date + "contact" line** that points at a
      real, monitored address. Current `privacy@actionamp.com` /
      `legal@actionamp.com` placeholders are kept only if they exist and are
      monitored; otherwise point at a single real address. State the address in
      the review.
- [ ] **The Signup form links to Privacy + Terms at the point of submission.**
      In `SignupPage.tsx`, below the submit button, a line like: *"By creating
      an account, you agree to our [Terms](/terms) and
      [Privacy Policy](/privacy)."* Using React Router `<Link>` (internal,
      client-side nav — no full reload).
- [ ] **The Login form links to Privacy + Terms too** (lighter touch: a single
      footer line, since login isn't fresh consent but good practice + Google's
      expectation).
- [ ] **No broken links.** Every `/privacy` and `/terms` reference resolves
      (grep the diff; the routes already exist in `main.wasp.ts`).
- [ ] **The pages render correctly** — open `/privacy` and `/terms` in the
      running app; the new sections appear, markdown renders, no raw `#`
      headings showing as text.
- [ ] **`wasp compile` passes** (these are markdown + tsx link changes; low
      risk, but confirm).

## Non-goals

- **No new routes.** `/privacy` and `/terms` already exist; `/about` too.
- **No cookie banner / consent management platform.** Only needed if
  analytics requires it (defer to `observability-minimal`); not part of legal
  pages per se.
- **No `/pricing` page.** Referred to from Terms but built in
  `public-launch-readiness`; Terms just links to billing for now.
- **No lawyer review of the wording.** The plain-language draft is the spec's
  deliverable; formal legal review is the user's call before launch (flag in
  the review). Discover is not providing legal advice.
- **No localization.** English only for v1.
- **No DPA / enterprise terms.** Consumer product.

## Open questions

- **Analytics provider name.** If `observability-minimal` hasn't chosen one
  when this ships, leave a clearly-marked placeholder in privacy.md and note
  it. Resolvable by Build reading that spec's decision or leaving the generic
  "anonymized metrics" line.
- **Contact address.** `privacy@actionamp.com` / `legal@actionamp.com` — are
  these real, monitored inboxes? If not, point at a single real address.
  Discover/user to confirm; Build uses placeholders with a TODO note if
  unknown.

## Prototypes

_(none — markdown edits + two `<Link>` additions; reuses existing
`MarkdownPage` and `AuthLayout`.)_
