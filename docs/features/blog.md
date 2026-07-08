---
slug: blog
title: "Blog (two-lane publication with a rotating featured zone)"
feature_area: public
status: missing
spec: blog.md                   # ready
verified: 2026-07-08
---

# Blog

**Wanted.** A static, SEO-bound publication on the Astro marketing site
(`actionamp.com`): two streams — **Finds** (short curated pointers) and
**Essays** (long-form instructional/thesis pieces) — rendered as a **two-lane
index** (Finds | Essays) below a **rotating Featured zone** that mixes streams
and also surfaces non-post content (guides, offers). Markdown-authored posts
in `site/src/content/blog/`, pre-rendered HTML, per-article meta + canonical +
OG, RSS feed, sitemap entries. Targets ADHD / focus / GTD / decision-overwhelm
search + social intent — the owned-discovery channel (where `newsletter` is the
capture channel).

**Design locked (2026-07-08).** Direction 1 from the prototype at
`docs/mockups/blog-directions.html`: hero → Featured zone (rotating Pattern A
Spotlight / Pattern B Split, build-time) → two-lane archive. Four categories:
Focus · Method · Attention · Build (ADHD/executive-function split across Focus
as a lens and Attention as its own honest bucket). Find type hints
(watch/read/tool/note) are rendering-only, not topics. Featured slots are
content-agnostic; guides/offers use the amber special tag (rare human
emphasis). Mobile: both lanes and both featured patterns collapse to a single
column. Teal is the only system accent.

**Today.** **No code.** The foundation is already shipped
(`infra-astro-marketing-split`, `done` 2026-07-06): Astro 7 on Cloudflare
Pages, content collections (`glob` loader in `site/src/content.config.ts`),
`PublicLayout.astro` rendering per-page `<title>`/`description`/canonical/OG,
`@astrojs/sitemap`, and `robots.txt` are all live. The blog is a **content +
collection + layout** addition, not infrastructure. `/blog` was parked across
`PUBLIC-PAGES.md` §4 (Tier 4), `MARKETING.md` §1 (Tier 4), and `ROADMAP.md`
§GTM as Phase 2; unparked 2026-07-08.

**Spec.** `docs/specs/blog.md` (`ready` — design locked, done-conditions
testable).

**Split spec.** `docs/specs/blog-social-meta.md` (`ready`) — OG images,
Twitter/LinkedIn rich-preview tags, and a calm share-row component. Split out
because shareability is a per-post-asset + platform-contract problem (and OG
images are a content task), not a layout problem. `blog` reserves the schema
slots; this spec fills them. The two compose; they don't block each other.

**Why it matters.** ROADMAP §GTM: the binding constraint on the business is
attention, not engineering. The newsletter captures the audience that arrives;
the blog is how strangers arrive — owned discovery via search + social, on a
surface the repo's own roadmap says is "worth the moving parts" now that the
Astro split landed. Sits in the same Now-tier family as `newsletter` and
`observability-minimal` (the validation gauntlet), not the feature-depth tiers.

**Relationships.** Independent of `newsletter` (the blog reserves a slot, does
not build the form). Independent of the Wasp app — pure static, no DB, no
auth. Reuses `PublicLayout`, `tokens.css`, the sitemap integration, and the
Cloudflare Pages deploy already in place.
