---
id: blog
kind: spec
title: "Blog — two-lane publication with a rotating featured zone"
status: review
priority: P1
feature: blog
spec_owner: discover
build_owner: build
created: 2026-07-08

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MigEh      # sync-managed (write-once)
gh_synced_at: 2026-07-08T15:41:46Z
---

# Spec: Blog — two-lane publication with a rotating featured zone

## Summary

A markdown-authored publication on the ActionAmp marketing site (Astro,
Cloudflare Pages, `actionamp.com`). Two streams — **Finds** (short curated
pointers: a video, an article, a tool, a quote + a one-line editorial note)
and **Essays** (longer instructional/thesis pieces) — rendered as a **two-lane
index** (Finds | Essays) below a **rotating Featured zone** that mixes the
streams. Targets search + social intent around ADHD, focus, GTD, and
decision-overwhelm: the owned-discovery channel the GTM strategy calls for.

The foundation (Astro split, content collections, sitemap, per-page meta)
already shipped via `infra-astro-marketing-split` (`done`); this is a content +
collection + layout addition, not infrastructure. Pure static SSG — no DB, no
auth, no Wasp coupling. Shareability (OG images, Twitter/LinkedIn cards, share
buttons) is split into `blog-social-meta` (this spec reserves the schema slots;
that spec fills them).

**Design prototype:** `docs/mockups/blog-directions.html` (Two-lane + Featured,
with a pattern toggle and a mobile preview toggle — Direction 1).

## Why

- **The binding constraint is audience, not engineering** (ROADMAP §0, §GTM).
  The product is soft-launched with no external users yet. The blog is how
  strangers arrive via search + social on a surface the repo owns — the
  newsletter captures the ones who arrive; the blog is discovery.
- **The foundation is already paid for.** `infra-astro-marketing-split`
  (2026-07-06) shipped Astro + content collections + sitemap + per-page meta +
  Cloudflare deploy specifically because "planned `/blog` / `/guides` … the
  moving parts are now worth it." Route ownership assigns future `/blog` →
  Astro. This is the content layer.
- **The roadmap's GTM wants it.** §GTM "Owned (ORB)" names "a blog/SEO surface
  for ADHD+focus+GTD intent (deferred)." Three docs park it as Phase 2
  (`PUBLIC-PAGES.md` §4, `MARKETING.md` §1, ROADMAP §GTM) — this spec unparks
  it.
- **It is the calmest kind of surface.** Whitespace, plain type, honest
  answers. No streaks, no red dots, no manipulation (PRODUCT.md "Fair to
  users").

## Design decisions locked (2026-07-08)

Confirmed against the prototype; these govern Build's implementation:

1. **Direction: two-lane index + featured zone.** Direction 1 from the
   prototype. The hero → Featured zone → two-lane archive (Finds | Essays). No
   other direction.
2. **Two streams, frontmatter-driven: `kind: find | essay`.**
   - **Find** = a short curated pointer (a video, article, tool, or note) +
     a one-line editorial take. Rendered dense in the Finds lane.
   - **Essay** = a titled long-form piece. Rendered spacious in the Essays lane.
3. **Find type hint, rendering-only: `findType: watch | read | tool | note`.**
   Determines the small monochrome icon + label on a find card. Not a topic;
   not a category. Does not apply to essays.
4. **Four categories, the navigable topical taxonomy:**
   **Focus · Method · Attention · Build.**
   - **Focus** — the decision thesis ("how to pick what to do next"). ADHD /
     executive-function lives here as a *lens* (per AGENTS.md "muse not
     target"), not its own category — EXCEPT the next one.
   - **Attention** — its own honest bucket for ADHD / executive function /
     working-memory pieces. Honest about the design rationale; stronger ADHD
     search-intent signal (GTM SEO goal). This is the deliberate 4th tag that
     pulls positioning slightly toward the real audience.
   - **Method** — GTD / PARA / triage / capture mechanics (instructional).
   - **Build** — in-public making, design decisions, ship notes (founder voice).
   Tags render as the teal-dotted `cat` pill on essays and as metadata on
   finds. (No dedicated tag-archive pages in v1 — see Non-goals.)
5. **Featured zone — rotating, build-time, content-agnostic.** Sits between the
   hero and the lanes. Curated items (any stream + non-post content like guides
   and offers) are promoted into it and **deduplicated out of the lanes** (an
   item shows once: featured XOR archived). Rotates between two patterns:
   - **Pattern A — Spotlight:** one full-width hero item (teal vertical rule,
     big title, lede, read-time) + two half-width takes below.
   - **Pattern B — Split:** left third = quick-take column, right two-thirds =
     essay blocks.
   The featured slots are **content-agnostic**: an essay, a find, a **Guide**
   (e.g. "A calm GTD setup in 15 minutes"), or an **Offer** (e.g. Founding 100)
   can all occupy any featured slot. Non-post featured content (guide/offer)
   uses the **amber tag** (the rare-human-emphasis accent) to distinguish it
   from regular posts.
6. **Rotation = build-time, not in-page motion.** A carousel would violate the
   calm rule. The active pattern (A or B) is selected at build time —
   editor-set per publish via a config value (lean), or date-based (even/odd
   week). Build picks one; there is no client-side toggling or auto-advance on
   the live site.
7. **Mobile: single-column collapse, both patterns.** On narrow viewports the
   lanes stack (Finds above Essays) and both featured patterns go
   single-column (Spotlight: hero → take → take; Split: takes column above
   essays column). No cross-stream mixing on mobile — that defeats the lanes'
   purpose. Touch hit-targets grow to the comfortable thumb range.

## Done-conditions

### Content collection & authoring

- [ ] A `blog` content collection in `site/src/content.config.ts` using the
      `glob` loader (same pattern as the existing `pages` collection), with a
      Zod schema covering: `title`, `description`, `pubDate` (ISO date),
      `updatedDate` (optional ISO date), `kind` (`"find"` | `"essay"`),
      `findType` (optional, `"watch"` | `"read"` | `"tool"` | `"note"` —
      required when `kind: find`, ignored otherwise), `tags` (optional array,
      drawn from `Focus | Method | Attention | Build`), `featured` (optional
      boolean, default false), `featuredAs` (optional, `"hero"` | `"take"` —
      hints slot placement), `draft` (optional boolean, default false),
      `ogImage` (optional string — reserved for `blog-social-meta`; unused
      here), `socialDescription` (optional string — reserved for
      `blog-social-meta`).
- [ ] Posts live in `site/src/content/blog/*.md` (one file per post). Slug =
      filename.
- [ ] At least **two real posts** ship in the initial PR (not lorem ipsum):
      one essay, one find. *(Suggested seed essay: "Why the list is the
      problem, not the answer" — the thesis post; suggested seed find: a real
      link with a real one-line take. Discover's call to confirm or replace.)*
- [ ] A `draft: true` post is **excluded** from the index, the article route,
      the featured zone, the RSS feed, and the sitemap (verified: a draft is
      404/unlisted).
- [ ] A `featured: true` post is **pulled out of the lanes** and rendered only
      in the featured zone (no duplication — verified by inspection).

### Routes

- [ ] `/blog` (index) renders: hero → featured zone (Pattern A or B per
      build-time config) → two-lane archive (Finds lane | Essays lane).
- [ ] The **Finds lane** is a reverse-chronological list of non-featured
      finds, each showing findType icon + label, date, the one-line editorial
      text, and a teal `→` arrow (hover shifts the arrow right).
- [ ] The **Essays lane** is a reverse-chronological list of non-featured
      essays, each showing category pill, read-time + date, title, and a
      one-line lede. Hover recolors the title to teal.
- [ ] `/blog` renders inside `PublicLayout` (nav + footer + correct
      `<title>`/meta), consistent with `/about`, `/privacy`, etc.
- [ ] `/blog/[slug]` (article) renders the post body from markdown, with the
      post's `title`/`description`/canonical/OG in the head. A find article
      page emphasizes the outbound link; an essay article page is full
      long-form.
- [ ] The article page shows, at minimum: title, pubDate (human-readable),
      updatedDate (if set), kind, tags/findType as applicable, and the body. A
      quiet "back to blog" link is present. A newsletter-capture slot is
      present (placeholder comment if `newsletter` isn't shipped — see Open
      questions).
- [ ] An unknown `/blog/<nonexistent>` slug returns a **404**, not a crash.

### Featured zone

- [ ] The featured zone renders **exactly one** of Pattern A or Pattern B,
      determined at build time by a config value (the exact config location is
      Build's discretion — a `site/src/content/blog/featured.config.ts`, a
      root `featured` frontmatter collection, or equivalent).
- [ ] **Pattern A — Spotlight** renders: one full-width hero item (teal rule,
      category/special tag, title, lede, read-time) + two half-width takes
      below it.
- [ ] **Pattern B — Split** renders: a left quick-takes column (1/3) + a right
      essays column (2/3).
- [ ] Featured slots are **content-agnostic**: a featured item may be an essay,
      a find, a guide, or an offer. Non-post featured content (guide/offer)
      renders with the **amber** special tag (not the teal category pill).
- [ ] Featured items are **deduplicated** from the two lanes below.
- [ ] **No in-page rotation / carousel motion** on the live site. The pattern
      is fixed per build.

### SEO & feeds

- [ ] Every published article has a **canonical URL**
      (`https://actionamp.com/blog/<slug>`) and unique `<title>` + meta
      description.
- [ ] Open Graph tags (`og:title`, `og:description`, `og:url`,
      `og:type=article`) render on every published article.
- [ ] Published articles + the `/blog` index appear in the generated
      **sitemap** (the existing `@astrojs/sitemap` integration; verify drafts
      and featured-only items are correctly included/excluded).
- [ ] `/rss.xml` is generated (via `@astrojs/rss`, added as a dependency) and
      lists all published posts (both streams) with title, description, link,
      pubDate.
- [ ] A `<link rel="alternate" type="application/rss+xml" href="/rss.xml">`
      tag is present in the site head.

### Navigation

- [ ] A **"Blog" link** is added to the site nav and footer so the section is
      discoverable (not an orphan route). Match the existing footer pattern in
      `PublicLayout.astro` and `index.astro`.

### Mobile

- [ ] At narrow viewports (≤ ~760px), the two lanes stack (Finds above Essays)
      and both featured patterns collapse to a single column. No horizontal
      scroll.
- [ ] Interactive rows (find cards, archive rows) have comfortable thumb
      hit-targets on mobile.
- [ ] Verify on a real 390px viewport (or the prototype's mobile mode) that
      the hero, featured zone, and both lanes remain legible and calm.

### Build & deploy

- [ ] `npm run build` (from `site/`) succeeds with no errors and produces
      static HTML for `/blog/index.html` + each `/blog/<slug>/index.html`.
- [ ] `npm run preview` renders the index, the featured zone in the active
      pattern, and at least one article correctly, including draft-exclusion
      and featured-dedup behavior.
- [ ] No new runtime dependency on the Wasp app or the DB. The blog is pure
      static SSG — confirmed by build output and by the absence of any
      `fetch`/endpoint call in blog routes.

### Tone & brand (PRODUCT.md, DESIGN-SYSTEM.md)

- [ ] Matches the calm, honest register of the site: no clickbait titles, no
      countdown/scarcity framing, no exclamation marks in the marketing voice.
- [ ] Typography and color come from `tokens.css`. Teal is the only system
      accent; amber appears only on non-post featured content (guide/offer).
      No new design system for the blog.

## Non-goals

- **No shareability/OG-image work here.** `blog-social-meta` owns OG images,
  Twitter cards, LinkedIn rich previews, and share buttons. This spec reserves
  the schema slots (`ogImage`, `socialDescription`) but does not build them.
- **No newsletter capture in this spec.** The `newsletter` spec owns the form.
  The blog reserves a slot/placeholder for it; wiring is a one-line change
  later.
- **No CMS, no authoring UI, no scheduled-publish workflow.** Posts are
  markdown committed to git; publishing = commit + deploy.
- **No dedicated tag-archive pages** (`/blog/tag/<tag>`) in v1. The four
  categories render as metadata; topical archive routes are a later editorial
  decision once there's volume.
- **No comments, reactions, or social embeds.** Calm by rule.
- **No author profiles / multi-author workflow.** One byline ("ActionAmp")
  unless/until there's a reason for named authors.
- **No reading-time calculation, "related posts," or table of contents.**
      Polish that earns its place once there's traffic and volume.
- **No client-side featured rotation / carousel.** Build-time only.
- **No programmatic/SEO content generation.** Real posts, written by a human.
- **No `/guides` or `/community` (other Tier-4 surfaces).** `/blog` only.
- **No changes to the Wasp app.** Zero coupling.

## Open questions (resolved — recorded for Build's discretion)

1. **Featured configuration mechanism.** **Resolved: Build's discretion within
   a constraint.** Use whichever clean mechanism fits the Astro content model
   (a `featured.config.ts`, a small frontmatter collection, or a convention on
   the `featured`/`featuredAs` fields). The constraint: pattern selection (A
   vs B) is a single build-time value, not client-side.
2. **Rotation cadence (if date-based).** **Resolved: not prescribed.** If
   Build picks date-based rotation, even/odd week is fine. If editor-set per
   publish, that's fine too. Either is calm; the spec doesn't care which.
3. **Should finds link outbound directly, or to an article page?** **Resolved:
   both, via the article page.** A find card links to `/blog/<slug>` (the
   article page), which carries the editorial take + the outbound link. This
   keeps internal navigation, gives OG metadata a page to render, and lets the
   find live in the archive/RSS. The outbound link is prominent on the article
   page.
4. **Are guides/offers first-class content types, or just featured-flagged
   posts?** **Resolved: featured-flagged with a `kind`-adjacent type.** Add an
   optional `contentType` field (`"post"` default | `"guide"` | `"offer"`) so
   the amber special tag renders correctly. Guides/offers still get an article
   page; the type only affects the featured-zone badge.
5. **Newsletter slot on the article page.** **Resolved: placeholder if
   `newsletter` isn't shipped; real component if it is.** Leave a clearly
   marked commented slot so later wiring is one line, not a rework.

## Decisions locked

- **Astro content collections**, not MDX or a CMS. Markdown + the existing
  `glob` loader. MDX is a later option if a post needs embedded components.
- **Pure static SSG.** No SSR, no Cloudflare Functions, no client-side data
  fetch on blog routes. The blog never touches the DB or the Wasp API.
- **`@astrojs/rss` for the feed**, added as a dependency to `site/`.
- **Slug = filename.** One source of truth for the URL.
- **Two-lane index + rotating featured zone** per the prototype (Direction 1).
- **Four categories: Focus · Method · Attention · Build.** ADHD/executive
  function split across Focus (as a lens) and Attention (its own honest
  bucket).
- **Find type hints (watch/read/tool/note) are rendering-only**, not topics.
- **Featured zone: build-time pattern (A or B), content-agnostic slots,
  deduplicated from lanes, amber tag for guides/offers.**
- **Mobile: single-column collapse for both lanes and both featured patterns.**
- **Tone and tokens inherit the site.** Teal system accent; amber rare
  human-emphasis on non-post featured content only.
- **Two real seed posts** ship in the PR (one essay, one find).

## Dependencies

- **None blocking.** The foundation (`infra-astro-marketing-split`) is `done`.
- **Soft dependency on `newsletter`** for the article-page subscribe slot
  only. The blog ships regardless; the slot is a placeholder until
  `newsletter` lands.
- **Composes with `blog-social-meta`** (the shareability split). This spec
  reserves the `ogImage`/`socialDescription` schema slots; that spec fills
  them. The two ship independently and do not block each other.
- **Aligns with `observability-minimal`** (site-wide analytics) but does not
  depend on it — the blog is static; any site-wide tracker covers it.
