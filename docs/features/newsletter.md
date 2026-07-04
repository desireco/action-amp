---
slug: newsletter
title: "Newsletter capture (footer + quiet hero)"
feature_area: public
status: missing
spec: newsletter.md            # draft
verified: 2026-07-03
---

# Newsletter capture

**Wanted.** A plain email-capture field on the landing page — in the footer
(always) and a quiet one in the hero (alongside the signup button). Tagline:
*"One email when there's something to say."* No invented urgency, no apology.
This is the owned distribution channel (GTM ORB "owned") for a product with
zero audience today.

**Today.** **No code.** Grep across `webapp/src/` finds no newsletter /
subscribe / mailing-list anywhere. Only signup + Founding-100 (footer link)
CTAs exist.

**Spec.** `docs/specs/newsletter.md` (`draft` — Discover owes product decisions:
provider, double opt-in, storage, welcome flow).

**Why it matters.** ROADMAP §GTM: the binding constraint on the business is
attention, not engineering. The email list is how a no-audience product builds
one without renting channels forever. It is the cheapest owned asset to stand
up — and it currently does not exist, despite PRODUCT.md and ROADMAP.md both
claiming it is "live."

**Reality note.** PRODUCT.md ("newsletter capture on the landing page — footer
+ hero") and ROADMAP.md ("the email list is now live") overclaim — they
describe intent, not shipped code. This catalog treats that as a feature to
build, not a prose error to delete.
