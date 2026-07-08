---
id: blog
kind: spec
title: "Blog — SEO-bound publication on the Astro marketing site"
status: ready
priority: P1
feature: blog
spec_owner: discover
build_owner: build
created: 2026-07-08

# sync-managed (do not hand-edit; written by duet sync):
# gh_node_id:    # populated on first sync
# gh_synced_at:  # populated on sync
---

# Spec: Blog — SEO-bound publication on the Astro marketing site

## Summary

Add a markdown-authored publication to the ActionAmp marketing site (Astro,
Cloudflare Pages, `actionamp.com`): a `/blog` index page listing posts in
reverse-chronological order, a `/blog/[slug]` article page rendering each post,
and an `/rss.xml` feed. Posts are authored as markdown files with frontmatter
in `site/src/content/blog/`. The surface targets search intent around ADHD,
focus, GTD, and decision-overwhelm — the owned-discovery channel the GTM
strategy calls for. The foundation (Astro split, content collections, sitemap,
per-page meta) already shipped via `infra-astro-marketing-split` (`done`); this
is a content + collection addition, not infrastructure. Pure static SSG — no
DB, no auth, no Wasp coupling.

## Why

- **The binding constraint is audience, not engineering** (ROADMAP §0, §GTM).
  The product is soft-launched with no external users yet. The blog is how
  strangers arrive via search intent on a surface the repo owns — the
  newsletter captures the ones who arrive; the blog is discovery.
- **The foundation is already paid for.** `infra-astro-marketing-split`
  (2026-07-06) shipped Astro + content collections + sitemap + per-page meta +
  Cloudflare deploy specifically because "planned `/blog` / `/guides` … the
  moving parts are now worth it." Route ownership (infra plan §Route ownership)
  already assigns future `/blog` → Astro. This spec is the content layer on top.
- **The roadmap's own GTM section wants it.** ROADMAP §GTM "Owned (ORB)"
  names "a blog/SEO surface for ADHD+focus+GTD intent (deferred)" as a needed
  owned channel. Three docs park it as Phase 2 (`PUBLIC-PAGES.md` §4,
  `MARKETING.md` §1, ROADMAP §GTM) — this spec unparks it.
- **It is the calmest kind of surface.** Whitespace, plain type, honest
  answers. No streaks, no red dots, no manipulation (PRODUCT.md "Fair to
  users"). A blog is the opposite of a growth-hack funnel.

## Done-conditions

### Content collection & authoring

- [ ] A `blog` content collection is defined in `site/src/content.config.ts`
      using the `glob` loader (the same pattern as the existing `pages`
      collection), with a Zod schema covering: `title`, `description`,
      `pubDate` (ISO date), `updatedDate` (optional ISO date), `tags`
      (optional string array), `draft` (optional boolean, default false).
- [ ] Posts live in `site/src/content/blog/*.md` (one file per post).
- [ ] At least **one real post** ships in the initial PR (not lorem ipsum) —
      written to the audience and intent in §Why. Title, slug, body all real.
      *(Suggested seed topic, discover's call to confirm or replace: "Why the
      list is the problem, not the answer" — the thesis post. It mirrors the
      landing page's pitch and is the single most defensible article to rank.)*
- [ ] A `draft: true` post is **excluded** from the index, the article route,
      the RSS feed, and the sitemap (verified: a draft is 404/unlisted).
- [ ] A post with `updatedDate` set renders a visible "Updated <date>" line on
      the article page (distinct from the original `pubDate`).

### Routes

- [ ] `/blog` (index) renders a reverse-chronological list of published posts,
      each showing title, description, and pubDate, linking to the article.
- [ ] `/blog` renders inside `PublicLayout` (nav + footer chrome + correct
      `<title>`/meta), consistent with `/about`, `/privacy`, etc.
- [ ] `/blog/[slug]` (article) renders the post body from markdown, with the
      post's `title`/`description`/canonical/OG in the head via
      `PublicLayout`. (If `PublicLayout` doesn't currently accept per-page OG
      overrides, extend its props — keep the existing pages working.)
- [ ] The article page shows, at minimum: title, pubDate (human-readable),
      updatedDate (if set), tags (if set), and the body. A quiet "back to blog"
      link and a newsletter-capture slot are present (the slot may be a
      placeholder comment if `newsletter` isn't shipped yet — see Open
      questions #4).
- [ ] An unknown `/blog/<nonexistent>` slug returns a **404**, not a crash.

### SEO & feeds

- [ ] Every published article has a **canonical URL** (`https://actionamp.com/blog/<slug>`)
      and unique `<title>` + meta description in the rendered HTML.
- [ ] Open Graph tags (`og:title`, `og:description`, `og:url`, `og:type=article`)
      render on every published article.
- [ ] Published articles appear in the generated **sitemap** (the existing
      `@astrojs/sitemap` integration picks up real pages automatically — verify
      `/blog` + each `/blog/<slug>` is listed, drafts are not).
- [ ] `/rss.xml` is generated (via `@astrojs/rss`, added as a dependency) and
      lists all published posts with title, description, link, pubDate.
- [ ] A `<link rel="alternate" type="application/rss+xml" href="/rss.xml">` tag
      is present in the site head (or at least on `/blog`).

### Navigation

- [ ] A **"Blog" link** is added to the site nav and/or footer so the section
      is discoverable from the rest of the site (not an orphan route). The
      footer links in `PublicLayout.astro` and `index.astro` are the natural
      spots — match whichever pattern the existing pages use.

### Build & deploy

- [ ] `npm run build` (from `site/`) succeeds with no errors and produces
      static HTML for `/blog/index.html` + each `/blog/<slug>/index.html`.
- [ ] `npm run preview` renders the index and at least one article correctly,
      including the draft-exclusion behavior.
- [ ] No new runtime dependency on the Wasp app or the DB. The blog is pure
      static SSG — confirmed by build output and by the absence of any
      `fetch`/endpoint call in blog routes.

### Tone & brand (PRODUCT.md, DESIGN-SYSTEM.md)

- [ ] The blog matches the calm, honest register of the rest of the site: no
      clickbait titles, no countdown/scarcity framing, no exclamation marks in
      the marketing voice (PRODUCT.md tone rules).
- [ ] Typography and color come from `tokens.css` (the same tokens the webapp
      and other marketing pages use). No new design system for the blog.

## Non-goals

- **No newsletter capture in this spec.** The `newsletter` spec owns the
  capture form. The blog may reserve a slot/placeholder for it (Open question
  #4), but building the actual subscribe form is out of scope here.
- **No CMS, no authoring UI, no scheduled-publish workflow.** Posts are
  markdown files committed to git; publishing = commit + deploy. A CMS (Decap,
  Tina, etc.) is a deliberate later option, not this spec.
- **No comments, no reactions, no social embeds.** Calm by rule; if these
  ever come, they come later and behind a thoughtful decision.
- **No author profiles, no multi-author workflow.** One byline ("ActionAmp")
  unless/until there's a reason for named authors. A `tags` field exists for
  topical organization, not a taxonomy UI.
- **No analytics/event wiring beyond what `observability-minimal` provides
  site-wide.** The blog doesn't define its own funnel events.
- **No programmatic/SEO content generation.** Real posts, written by a human,
  to the thesis. No AI bulk-publishing to game search.
- **No `/guides` or `/community` (other Tier-4 surfaces).** This is `/blog`
  only. Those remain parked.
- **No changes to the Wasp app.** Zero coupling — the blog is fully on the
  Astro side.

## Open questions (resolved — recorded for Build's discretion)

1. **RSS vs. JSON feed vs. both?** **Resolved: RSS (`/rss.xml`) only.** RSS is
   the universal default; JSON feed is a nice-to-have not worth the surface
   area for a one-author blog at launch. Build uses `@astrojs/rss`.
2. **Tag pages (`/blog/tag/<tag>`)?** **Resolved: no dedicated tag pages in
   v1.** Tags render as metadata on posts and (optionally) as clickable
   filters on the index later. A tag taxonomy with its own index/route is
   premature until there are enough posts to justify navigation. Build renders
   tags as plain labels.
3. **Newsletter slot on the article page.** **Resolved: include a clearly
   marked placeholder, do not build the form.** If `newsletter` hasn't shipped
   when the blog does, the article page leaves a commented slot ("newsletter
   capture goes here — see spec `newsletter`") so wiring it later is a one-line
   change, not a layout rework. If `newsletter` has shipped, build uses its
   real component/form.
4. **Reading time, "related posts," table of contents?** **Resolved: none in
   v1.** These are polish that earn their place once there's traffic and more
   than a handful of posts. Keep the article template minimal: title, date,
   body, back-link, newsletter slot.
5. **Featured/hero post on the index?** **Resolved: no.** Reverse-chronological
   flat list is the calm default. Curation/featuring is a later editorial
   decision, not a build decision.

## Decisions locked

- **Astro content collections, not MDX or a CMS.** Markdown + the existing
  `glob` loader. Matches the `pages` collection already in `content.config.ts`.
  MDX (for embeddable components in posts) is a later option if a post needs it.
- **Pure static SSG.** No SSR, no Cloudflare Functions, no client-side data
  fetch on blog routes (unlike the landing's Founding-100 counter). The blog
  never touches the DB or the Wasp API.
- **`@astrojs/rss` for the feed**, added as a dependency to `site/`.
- **Slug = filename.** `<slug>` in the route comes from the markdown file's
  name (via the collection's `id`), not a separate frontmatter field. One
  source of truth for the URL.
- **Tone and tokens inherit the existing site.** No separate blog design
  system; the blog reads `tokens.css` and lives inside `PublicLayout`.
- **One real seed post ships with the PR.** Not a placeholder. Discover's
  suggested seed ("Why the list is the problem, not the answer") can be
  confirmed or swapped; the done-condition is "a real post exists," not "this
  specific post."

## Dependencies

- **None blocking.** The foundation (`infra-astro-marketing-split`) is `done`.
- **Soft dependency on `newsletter`** for the article-page subscribe slot only.
  The blog ships regardless; the slot is a placeholder until `newsletter`
  lands. The two specs are designed to compose, not block each other.
- **Aligns with `observability-minimal`** (site-wide analytics) but does not
  depend on it — the blog is a static surface, and any site-wide tracker covers
  it automatically once that spec ships.
