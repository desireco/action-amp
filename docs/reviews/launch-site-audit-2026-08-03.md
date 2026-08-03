# Launch Site Communication Audit

> Status: ACTIVE
> Audited: 2026-08-03
> Surfaces: `https://actionamp.com/`, `https://app.actionamp.com/founding-100`, `http://localhost:4321/`
> Scope: site structure, launch copy, pricing communication, Founding 100 comparison, responsive behavior, and conversion paths

## Outcome

ActionAmp has a strong visual identity and a clear product thesis. It does not
yet explain the purchase decision clearly enough for launch. The main issue is
not the $99 Founding price. Visitors see that price before they see what Free
includes, what regular Pro costs, or why Founding is unusually favorable.

The launch surface also contains conversion and interaction defects: the
signup experience conflicts with the passwordless-login story, Founding intent
is lost after login, the mobile landing page forces a long scroll-snap journey,
and two hero interactions do not behave as their labels promise.

## Evidence reviewed

- Production and local landing pages at desktop and 390px mobile widths.
- Production and local Founding 100 offer pages.
- Public navigation, footer, blog index, blog article template, About, Roadmap,
  Privacy, Terms, sitemap, RSS, and application billing UI.
- Canonical product, brand, pricing, public-pages, marketing, success, and
  roadmap documents.
- User feedback supplied 2026-08-03, treated as one data point and checked
  against rendered behavior rather than accepted as direction.

### Verification results

- All checked production routes returned HTTP 200.
- Astro production build passed: 15 pages generated.
- No landing-page console errors or failed network requests locally.
- No horizontal overflow at 1440px or 390px.
- Founding status endpoint returned `claimed: 0`, `remaining: 100`.
- Local mobile landing scroll container measured 7,277px across eight
  full-screen sections, before the footer.

Screenshots live outside the repository:

- Production: `~/.codex/visualizations/2026/08/03/019fc87c-4c02-7923-acc0-c580bcc891ab/actionamp-launch-audit/`
- Local: `~/.codex/visualizations/2026/08/03/019fc87c-4c02-7923-acc0-c580bcc891ab/actionamp-local-audit/`

## Locked pricing facts

| Plan | Price | Current product boundary |
|---|---:|---|
| Free | $0 forever | Core focus loop, personal scope, 3 projects, 1 goal |
| Pro annual | $79.50/year | Unlimited structure and paid lenses |
| Pro prepaid | $90/year | Same Pro product, no auto-renew |
| Pro monthly | $12.95/month | Same Pro product, cancel anytime |
| Founding 100 | $99 once | Lifetime Pro, capped at 100 memberships |

Founding costs $19.50 more than the first annual year and $9 more than one
prepaid year. It pays back against annual Pro after about 15 months. Lowering
the Founding price is not recommended before measurement; communicating the
anchor is the immediate need.

Recommended public framing:

> Lifetime Pro for $99 once. Regular Pro is $79.50/year. Founding membership
> costs $19.50 more than your first year, with no renewal bill.

## Finding queue

Work top-down. Mark each item resolved with implementation evidence and
verification notes.

### P0 — Conversion and truth

- [x] **F01 — Unify signup and passwordless authentication.** Landing CTAs send
      visitors to `/signup`, which renders email, password, and full name.
      `/login` promises a code and no password. Pick one coherent new-account
      flow and use it everywhere.
      - Evidence: `site/src/pages/index.astro`; `webapp/src/auth/email/SignupPage.tsx`;
        `webapp/src/auth/email/LoginPage.tsx`.
      - Done when: a new visitor can start from every public CTA, create or
        access an account through one clearly explained flow, and reach `/app`.
      - Resolved 2026-08-03: `/signup` and `/login` now share one passwordless
        email-code component while preserving route-specific framing. Signup
        says “Start free” and contains no password or full-name field. Local
        browser verification created an account and reached `/app` with no
        console errors. Seven auth client tests and `wasp compile` passed.

- [x] **F02 — Preserve Founding purchase intent through authentication.** A
      logged-out Founding CTA sends the visitor to `/login`; successful login
      sends them to `/app`, not back to `/founding-100`.
      - Evidence: `webapp/src/public/Founding100Page.tsx` explicitly notes that
        no return-path support is wired.
      - Done when: logged-out visitor selects Founding, authenticates, returns
        to the offer, and can enter Stripe checkout without navigating back.
      - Resolved 2026-08-03: the Founding CTA now sends a validated local
        `returnTo=/founding-100` through both code entry and emailed magic-link
        login. External and protocol-relative destinations fall back to
        `/app`. Browser verification with a new local account returned directly
        to the offer and exposed the authenticated `$99` checkout CTA with no
        console errors. Eighteen auth tests and `wasp compile` passed.

- [x] **F03 — Publish public pricing.** Regular Pro prices and Free boundaries
      are visible only inside authenticated Settings. The public site mentions
      `$99` without an anchor.
      - Recommended surface: homepage pricing section plus `/pricing` canonical
        page.
      - Public hierarchy: Free, Pro annual, Founding 100. Monthly and prepaid
        remain secondary alternatives under Pro.
      - Done when: a logged-out visitor can compare Free, Pro, and Founding
        without creating an account.
      - Resolved 2026-08-03: `/pricing` now presents Free ($0 forever), annual
        Pro ($79.50 every 12 months), monthly Pro ($12.95 every month), and
        Founding 100 ($99 once) in a public, calm comparison. The home-page
        Founding module names the annual anchor and links to the comparison.
        Founding plainly states that it costs $19.50 more than the first Pro
        year, has no renewal bill, and breaks even after about 15 months. Astro
        build passed; desktop and 390px browser checks passed.

- [x] **F04 — Correct launch-state copy.** Homepage says “When does it launch?
      Soon” while the product is live and accepting accounts and payments.
      - Recommended answer: “ActionAmp is live in early access. Start free
        today.”
      - Done when: homepage, FAQ, marketing docs, roadmap, and CTAs agree on
        current availability.
      - Resolved 2026-08-03: the public FAQ now asks whether ActionAmp is
        available and answers, “Yes. ActionAmp is live in early access. Start
        free today.” The final CTA reference now says “Start free. No card
        required.” Marketing and public-pages source docs match; `ROADMAP.md`
        already identified the product as soft-launched.

- [ ] **F05 — Add minimal funnel measurement before distribution.** StatCounter
      base tracking is now installed across the production marketing site and
      app; explicit visitor-to-signup and visitor-to-checkout events remain
      unknown.
      - Source spec: `docs/specs/observability-minimal.md`.
      - Done when: landing view, signup complete, first app open, and checkout
        started form one privacy-respecting production funnel.

### P1 — Site structure and product comprehension

- [x] **F06 — Remove mandatory mobile scroll snapping.** Mobile forced eight
      full-screen sections and roughly nine swipes before the footer. This
      prevents normal launch-page skimming and exaggerates empty space.
      - Evidence: `site/src/styles/landing.css` mobile rules; measured landing
        scroll height 7,277px at a 390x844 viewport.
      - Done when: mobile uses normal document flow, content determines section
        height, and footer remains naturally reachable.
      - Resolved 2026-08-03: removed the mobile-only fixed-height scroll
        container, mandatory snap targets, and viewport-height section rules.
        The responsive padding remains; sections now size to their content and
        the footer follows in ordinary document flow.

- [x] **F07 — Repair hero demo semantics.** “Switch” did nothing. “Do this”
      immediately changed to “Done ✓” and cycled tasks, teaching that starting
      work equals completing work.
      - Done when: Switch visibly changes the proposed task; Do this previews a
        focus/working state or is relabeled to match completion behavior.
      - Resolved 2026-08-03: “Start focus” now enters a visible in-focus state,
        “Switch task” changes the recommendation, and only the completion ring
        marks a task done before advancing to the next recommendation.

- [ ] **F08 — Simplify hero task-card parsing.** Current card contains an
      unlabeled completion ring, `Right now · 30 min`, `Due today · 15 min`, an
      amber reason badge, and two actions. Available time and estimate are easy
      to confuse.
      - Recommended labels: `30 min available`; `15 min estimate · Due today`;
        `Why this: important and due today`.
      - Done when: a first-time viewer can explain each visible value without
        learning the app first.

- [ ] **F09 — Put reassurance beside the core promise.** Hero says ActionAmp
      “hides the rest.” The reassurance that the list remains available appears
      several sections later. This validates the supplied anxiety feedback
      without prescribing a permanent progress bar.
      - Recommended hero subhead: “Capture everything. ActionAmp brings one
        task forward, tells you why, and keeps your plan one click away.”
      - Done when: first viewport communicates both focus and retained control.

- [ ] **F10 — Make FAQ keyboard-accessible.** FAQ rows are clickable `<div>`
      elements with no role or `tabindex`, conflicting with the keyboard-first
      promise.
      - Recommended primitive: `<details>/<summary>` or a native `<button>` with
        `aria-expanded` and controlled panel association.
      - Done when: FAQ works with Tab, Enter, Space, pointer, and screen-reader
        state announcements.

- [ ] **F11 — Bring interactive targets to 44px on mobile.** Measured examples:
      28px completion circle, 37px hero buttons, 36px footer links.
      - Done when: mobile interactive controls meet the 44px target without
        making visual chrome feel oversized.

### P1 — Pricing and Founding presentation

- [ ] **F12 — Rebuild Founding page around customer value.** Page currently
      explains business risk and churn math before showing a CTA. “Everything
      in Pro” is undefined because Pro is not described.
      - Above fold: `$99 once`, regular `$79.50/year` anchor, concise Pro
        inclusion list, live/calm availability, primary CTA, free alternative.
      - Below fold: direct-line benefit, cap rationale, lifetime definition,
        business-risk disclosure, roadmap link.
      - Done when: visitor can answer “what do I get, why is this better than
        annual Pro, what is the risk, and what happens next?” above the fold.

- [ ] **F13 — Stop advertising zero traction as the headline.** `100 of 100
      spots left` is honest but works as negative social proof.
      - Recommended homepage line while none are claimed: “Founding memberships
        open · capped at 100.”
      - Keep exact availability on the detailed offer or expose it after claims
        begin. Do not invent demand or urgency.
      - Done when: scarcity remains factual without making zero sales the main
        message.

- [ ] **F14 — Resolve two competing Founding surfaces.** Public blog article
      explains Founding, while app-subdomain page owns purchase. Their jobs and
      canonical relationships are unclear.
      - Recommended: public pricing/Founding page owns discovery and comparison;
        app route owns authenticated checkout handoff.

### P1 — Capture interested visitors

- [ ] **F15 — Add newsletter capture.** Blog and non-buying traffic have no
      owned follow-up path. Article template contains only a commented slot.
      - Source spec: `docs/specs/newsletter.md`.
      - Surfaces: quiet hero alternative, every public footer, article end.
      - Done when: validated email, clear consent, confirmation, unsubscribe,
        exportability, and analytics event work in production.

- [ ] **F16 — Add conversion actions to blog and site navigation.** Non-landing
      public pages offer only Log in; new visitors must discover homepage before
      finding signup.
      - Recommended nav: Product, How it works, Pricing, Blog, Log in, Start
        free.

### P2 — Trust, sharing, and consistency

- [ ] **F17 — Add homepage and public-page social images.** Homepage has OG
      title/description but no `og:image`; Twitter card is `summary`.

- [ ] **F18 — Strengthen maker trust without invented social proof.** About page
      says one person built the product but does not identify the maker or show
      meaningful proof beyond Roadmap.
      - Use real maker identity, shipping record, and direct contact only if the
        owner wants those public. Do not fabricate testimonials or customer
        counts.

- [ ] **F19 — Reconcile stale copy and implementation comments.** Known drift:
      `$139` remains in `PRODUCT.md`, billing comments, integration docs, and a
      review; marketing docs claim a Founding login redirect that does not
      exist; newsletter is described as live in some canonical prose but is
      absent.

- [ ] **F20 — Calibrate “ActionAmp picks” against current matcher truth.** Site
      promises that ActionAmp picks the next thing, while `SUCCESS.md` describes
      the current matcher as a priority sort whose surprise/value remains
      unvalidated.
      - Do not weaken the thesis. Avoid implying more intelligence than shipped
        logic supports until matcher validation passes.

## Recommended homepage order

1. Hero: one-task promise, retained-control reassurance, Start free.
2. Simplified product proof: one legible task card.
3. Focus without losing the map: Today/plan remains one click away.
4. Capture → Plan → Focus.
5. Real product screenshots or short walkthrough.
6. Public Free / Pro / Founding comparison.
7. Short methodology credibility section.
8. Built-in-public proof: maker, roadmap, recent shipping.
9. FAQ: availability, pricing, data, cancellation, Founding terms.
10. Final Start free CTA plus quiet newsletter capture.

## Proposed copy baseline

### Hero

**One task. The next one that matters.**

Capture everything. ActionAmp brings one task forward, tells you why, and
keeps your plan one click away.

Primary CTA: **Start free**

Support: **No card required.**

### Pricing headline

**Start free. Pay when you need more structure.**

Free keeps the full focus loop. Pro adds unlimited structure and every lens.
Founding members get Pro for life with one $99 payment.

### Founding headline

**Lifetime Pro for $99 once.**

Regular Pro is $79.50/year. Founding membership costs $19.50 more than your
first year, with no renewal bill. Capped at 100 memberships because lifetime
plans must stay limited.

## Decisions not implied by supplied feedback

- Do not add a permanent daily progress bar from one report. First fix the
  communication that the plan remains available; test whether orientation
  anxiety remains.
- Do not lower Founding pricing before visitors see regular pricing and before
  analytics make the objection measurable.
- Do not add fake social proof, fake urgency, countdowns, or concealed
  availability.

## Work log

Append one entry per resolved finding:

| Date | Finding | Change | Verification | Commit |
|---|---|---|---|---|
| 2026-08-03 | F01 | Shared passwordless flow for `/signup` and `/login`; removed password signup UI | 7 auth tests; local account creation → `/app`; `wasp compile` | Uncommitted |
| 2026-08-03 | F02 | Validated Founding `returnTo` through code and magic-link authentication | 18 auth tests; logged-out Founding → new account → returned offer; `wasp compile` | Uncommitted |
| 2026-08-03 | F03 | Public Free / annual Pro / monthly Pro / Founding comparison and homepage annual-price anchor | Astro build; desktop + 390px browser checks | Uncommitted |
| 2026-08-03 | F04 | Replaced pre-launch and beta copy with live early-access language | Astro build; stale-copy search | Uncommitted |
