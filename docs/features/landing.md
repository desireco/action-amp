---
slug: landing
title: "Landing page (signup + Founding-100 CTAs; NO newsletter)"
feature_area: public
status: partial
spec: —
verified: 2026-07-03
---

# Landing page

**What.** Public home at `/` (`landing/LandingPage.tsx`). Sections: hero with
animated Next-card demo, "How it works" (Capture/Triage/Focus), "The home screen
is a decision", Methodology (GTD + PARA→Goals), FAQ, final CTA, footer.

**CTAs present:**
- "Make an account" → `/signup` (hero + final).
- "Log in" → `/login` (nav + final).
- Founding 100 link → `/founding-100` (**footer only**).

**⚠ Newsletter: intended, not shipped.** PRODUCT.md ("newsletter capture on the
landing page — footer + hero") and ROADMAP.md ("the email list is now live")
both claim a newsletter capture is live. **The code has no newsletter/subscribe/
mailing-list anywhere** (grep-confirmed). Only signup + Founding-100-in-footer
exist. **Confirmed as a feature to build** — see [newsletter](./newsletter.md)
(`missing`, spec `draft`). Catalog status `partial` reflects this gap.

**Files.** `landing/LandingPage.tsx`.
