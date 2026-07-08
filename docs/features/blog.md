---
slug: blog
title: "Blog (SEO-bound publication on the Astro marketing site)"
feature_area: public
status: missing
spec: blog.md                   # ready
verified: 2026-07-08
---

# Blog

**Wanted.** A static, SEO-bound publication on the Astro marketing site
(`actionamp.com`): a `/blog` index and a `/blog/[slug]` article route, authored
as markdown in `site/src/content/blog/`, rendered to pre-rendered HTML with
per-article meta + canonical + OG tags, an RSS feed, and sitemap entries. The
owned-channel/SEO play the GTM strategy calls for — ADHD / focus / GTD /
decision-overwhel intent — for a product whose binding constraint is audience,
not engineering (ROADMAP §0, §GTM).

**Today.** **No code.** The foundation is already shipped
(`infra-astro-marketing-split`, `done` 2026-07-06): Astro 7 on Cloudflare
Pages, content collections (`glob` loader in `site/src/content.config.ts`),
`PublicLayout.astro` rendering per-page `<title>`/`description`/canonical/OG,
`@astrojs/sitemap`, and `robots.txt` are all live. The blog is a
**content + collection** addition, not infrastructure. `/blog` is parked across
`PUBLIC-PAGES.md` §4 (Tier 4), `MARKETING.md` §1 (Tier 4), and `ROADMAP.md`
§GTM ("blog/SEO surface — deferred") as Phase 2.

**Spec.** `docs/specs/blog.md` (`ready` — done-conditions testable, decisions
locked).

**Why it matters.** ROADMAP §GTM: the binding constraint on the business is
attention, not engineering. The newsletter captures the audience that arrives;
the blog is how strangers arrive — owned discovery via search intent, on a
surface the repo's own roadmap says is "worth the moving parts" now that the
Astro split landed. Sits in the same Now-tier family as `newsletter` and
`observability-minimal` (the validation gauntlet), not the feature-depth tiers.

**Relationships.** Independent of `newsletter` (the blog does not build the
capture form; it designs a slot for one). Independent of the Wasp app — pure
static, no DB, no auth. Reuses `PublicLayout`, `tokens.css`, the sitemap
integration, and the Cloudflare Pages deploy already in place.
