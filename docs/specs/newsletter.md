---
id: newsletter
kind: spec
title: "Newsletter capture on the landing page"
status: draft
priority: P1
feature: newsletter
spec_owner: discover
build_owner: build
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsbJ      # sync-managed (write-once)
gh_synced_at: 2026-07-07T18:16:34Z   # sync-managed (drift detection)
---

# Spec: Newsletter capture (landing page)

> **Intake (2026-07-03).** Promoted from a known gap: PRODUCT.md and
> ROADMAP.md describe a newsletter capture as "live," but no such code exists.
> Confirmed as a real intended feature. This is a `draft` — done-conditions
> need refinement (provider + consent model are open).

## Summary

Add a plain email-capture field on the public landing page: in the footer
(always present) and a quiet one in the hero (alongside the signup button, not
replacing it). Captured emails go to a list we own and can send to. Tagline:
*"One email when there's something to say."* Honest, calm, low-frequency by
intent.

## Why

- **The binding constraint is audience, not engineering** (ROADMAP §0, §GTM).
  The email list is the owned distribution channel for a product with zero
  audience today; renting channels (Reddit, social) forever is not a strategy.
- **It is the cheapest owned asset to stand up**, yet it does not exist, while
  the docs already promise it.
- **It is fair-play** per PRODUCT.md §"Fair to users": a plain, honest ask with
  no invented urgency. The signup CTA and the Founding 100 are also in-bounds;
  this is the third.

## Done-conditions (draft — some predicates TBD pending open questions)

- [ ] A visible email-capture field in the **footer of every public page**
      (always present).
- [ ] A quiet email-capture affordance in the **landing hero**, alongside (not
      replacing) the signup button.
- [ ] Submit validates email format; empty/invalid shows a calm inline error.
- [ ] On submit, the email is persisted to **<provider TBD>** (not just logged).
- [ ] **Double opt-in** flow: user receives a confirmation email; only
      confirmed addresses are added to the list. *(Open: required by provider
      policy / GDPR? — lean: yes regardless, it's the fair-play default.)*
- [ ] A welcome/stored confirmation that sets expectations ("one email when
      there's something to say").
- [ ] **One-click unsubscribe** in every send (CAN-SPAM/GDPR). Working, not
      theoretical.
- [ ] Captured addresses are exportable (we own the list — no lock-in per
      PRODUCT.md "Fair to users").
- [ ] Analytics event(s) wired so `observability-minimal` can count
      newsletter-submits as a funnel step (distinct from signup).
- [ ] PRODUCT.md / ROADMAP.md "live" claims reconciled with reality (either
      this ships, or the prose is corrected — done as part of this spec's
      review).

## Non-goals

- **No blog/SEO surface yet.** This is capture-only; the publication surface is
  a separate, later decision (PUBLIC-PAGES.md Tier 4 / BACKLOG).
- **No automated drip/nurture sequence at launch.** Frequency is "when there's
  something to say" — manual sends first. Automation is a later option.
- **No newsletter during onboarding/in-app.** This is a public-site surface.
- **Not replacing the signup CTA.** Newsletter and signup coexist; the hero
  shows both (signup primary, newsletter quiet).

## Open questions (for Discover to resolve before `ready`)

1. **Provider.** Resend is already wired for transactional auth/billing email —
   does it support a list/audience + double opt-in, or do we add a dedicated
   tool (Buttondown, ConvertKit, Mailchimp)? Lean: the simplest thing that
   gives a real, exportable list with confirmed opt-in.
2. **Storage + ownership.** Where does the list live, and is it exportable
   (PRODUCT.md "no data lock-in")? Must be a real owned list, not a SaaS
   hostage.
3. **Consent model.** Double opt-in default? (Lean: yes — fair-play, better
   deliverability, lower spam-trap risk.)
4. **Where the hero affordance sits.** Quiet = how quiet? Below the signup
   button, smaller, lower-contrast — but not hidden (it has to actually
   capture). Needs a quick mock decision.
5. **Frequency policy statement.** What exactly do we promise on the form?
   (Lean: the PRODUCT.md line verbatim — "One email when there's something to
   say.")

## Prototypes

None yet. A quick footer + hero mock is the right disposable artifact before
locking done-conditions.

## Dependencies

- `observability-minimal` — so newsletter-submit is a counted funnel event
  (not a hard dep for the capture itself, but the value of the feature is
  measured through analytics).
