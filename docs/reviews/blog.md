# Review: blog

**Spec:** `docs/specs/blog.md`
**Status:** `review` (ready for Discover sign-off)
**Built:** 2026-07-08

## What changed

A markdown-authored blog on the Astro marketing site. Two streams (finds +
essays), a two-lane index (Finds | Essays), and a rotating featured zone between
the hero and the lanes. Pure static SSG — no DB, no auth, no Wasp coupling.

**New files:**
- `site/src/content.config.ts` — `blog` collection + Zod schema (modified)
- `site/src/content/blog/featured.config.ts` — build-time pattern rotation + slot config
- `site/src/styles/blog.css` — two-lane + featured + article styles (ported from prototype)
- `site/src/components/FindTypeIcon.astro` — monochrome find-type icons (watch/read/tool/note)
- `site/src/pages/blog/index.astro` — `/blog` (hero → featured → two-lane archive)
- `site/src/pages/blog/[slug].astro` — article page (find + essay + guide + offer variants)
- `site/src/pages/rss.xml.ts` — `/rss.xml` via `@astrojs/rss`
- `site/src/content/blog/*.md` — 10 seed posts (3 essays, 4 finds, 1 guide, 1 offer, 1 draft)

**Modified files:**
- `site/src/layouts/PublicLayout.astro` — `ogType` + `fullWidth` props, RSS `<link>`, Blog/RSS nav+footer links
- `site/src/pages/index.astro` — RSS `<link>` + Blog/RSS footer links
- `site/src/styles/global.css` — `.aa-pub-main--wide` (1200px) variant, `.aa-pub-nav-links`
- `site/package.json` — `@astrojs/rss` dependency

## Gates run

### Build + diagnostics
- `npm run build` → **15 pages, exit 0** (5 existing + `/blog` + 9 article routes + `/rss.xml`).
  Verified clean for both Pattern A (forced) and Pattern B (date-based active).
- No TypeScript errors; Zod schema validates all 10 posts including the
  `findType`-required-when-`find` refine.

### Cold-context reviewers (AI #2)
Two fresh-context `reviewer` subagents, distinct angles. Both read the diff cold.

| Angle | Verdict |
|-------|---------|
| Correctness / regressions / spec compliance | 2 blockers found, both **fixed** (see below) |
| Simplicity / maintainability / brand-tone | 0 blockers; 4 concerns, all **addressed** |

### Done-conditions verification
Each spec predicate checked against the built output:

| Done-condition | Status | Evidence |
|---|---|---|
| `blog` collection w/ glob loader + Zod schema | PASS | `content.config.ts`; schema covers all required fields |
| Posts in `site/src/content/blog/*.md`, slug=filename | PASS | 10 posts; routes are `/blog/<filename>/` |
| ≥2 real seed posts (1 essay, 1 find) | PASS | 3 essays + 4 finds + 1 guide + 1 offer (exceeds minimum) |
| `draft: true` excluded from index/article/featured/RSS/sitemap | PASS | Draft `the-productive-procrastination-trap` produces 0 routes, 0 RSS items, 0 sitemap URLs, 0 index mentions |
| `featured: true` pulled from lanes, no duplication | PASS | Every published post appears exactly once in `/blog/index.html` (verified for both Pattern A and B) |
| `/blog` renders hero → featured (one pattern) → two lanes | PASS | Verified in rendered HTML + screenshot |
| Finds lane: findType icon + date + text + teal → | PASS | `aa-find-*` classes, hover shifts arrow (CSS `translateX(3px)`) |
| Essays lane: cat pill + read-time + title + lede, hover teal | PASS | `aa-essay h2:hover { color: var(--aa-teal-cta) }` |
| `/blog` inside PublicLayout with correct title/meta | PASS | `<title>Blog — ActionAmp</title>`, description present |
| `/blog/[slug]` renders body, head, find callout | PASS | Find article shows teal "Read the source" callout; essay shows long-form body |
| Article shows title, pubDate, updatedDate, kind, tags/findType, body, back link, newsletter slot | PASS | All present; newsletter slot is commented placeholder (spec §Open Q 5) |
| Unknown slug returns 404 | PASS | `getStaticPaths` returns only published; unmatched → Cloudflare 404 |
| Featured renders exactly one of Pattern A/B | PASS | `resolvePattern()` → single build-time value; no client toggle |
| Pattern A: full-width hero + 2 half-width takes | PASS | `aa-spotlight` grid; verified by forcing Pattern A |
| Pattern B: 1/3 takes + 2/3 essays | PASS | `aa-split` grid (1fr 2fr at ≥761px) |
| Featured slots content-agnostic; guide/offer amber tag | PASS | `contentType: guide/offer` → `aa-tag-special` (amber); verified on GTD guide + Founding 100 |
| Featured deduped from lanes | PASS | Verified: every post appears exactly once |
| No in-page rotation/carousel | PASS | Zero `<script>` tags in blog pages; build-time only |
| Canonical URL + unique title/desc per article | PASS | `<link rel="canonical">` + unique `<title>` on all 9 articles |
| OG tags (og:title, og:description, og:url, og:type=article) | PASS | `og:type=article` on articles, `og:type=website` on index |
| Articles + index in sitemap; drafts excluded | PASS | 9 article URLs + `/blog/` in `sitemap-0.xml`; draft absent |
| `/rss.xml` lists all published posts w/ title/desc/link/pubDate | PASS | 9 `<item>`s; valid RFC-822 dates; absolute links |
| `<link rel="alternate" ...>` in site head | PASS | Present on landing, `/about`, `/blog`, all articles |
| Blog link in nav + footer | PASS | Added to PublicLayout nav + footer; landing footer |
| Mobile: lanes stack, featured single-column, no h-scroll | PASS | Screenshots at 390px; `@media (max-width: 760px)` + `(max-width: 520px)` |
| `npm run build` succeeds, produces static HTML | PASS | 15 pages, exit 0 |
| No runtime dependency on Wasp/DB | PASS | Zero `fetch`/endpoint in blog routes; pure SSG |
| Calm tone, no clickbait, no exclamation marks | PASS | Seed posts audited; no `!` in marketing voice |
| Tokens from tokens.css; teal system, amber only on guide/offer | PASS | All colors tokenized; amber appears only on `aa-tag-special` |

## Findings

### Applied (in-scope fixes from review)

1. **[BLOCKER → fixed] Featured dedup broken.** Pattern B duplicated
   `a-calm-gtd-setup` + `founding-100` across both columns (they were in `takes`
   *and* `featuredEssays`); Pattern A orphaned them entirely (only 2 of 4 takes
   rendered, the other 2 deduped from lanes → invisible). Root cause:
   `featuredEssays` computed independently of slot assignment, and Pattern A
   sliced takes without a fallback for overflow.
   **Fix:** Rewrote the partition. Only items the active pattern *actually
   renders* are deduped from the lanes; overflow featured items fall back to the
   lanes (an item is never orphaned by a pattern it doesn't fit). Pattern B's
   essays column is now `[hero, ...remaining essays]` excluding takes — disjoint.
   Verified: every published post appears exactly once in both Pattern A and B.

2. **[BLOCKER → fixed] Blog index squeezed into 720px.** `PublicLayout`'s
   `<main>` capped content at 720px (reading width), so the 1200px two-lane
   canvas never rendered — lanes were cramped at ~250px each.
   **Fix:** Added `fullWidth` prop to `PublicLayout` + `.aa-pub-main--wide`
   (1200px) variant. Blog index passes `fullWidth`; article page keeps 720px
   (correct for long-form). Verified by screenshot: lanes now render full-width.

3. **[CONCERN → fixed] `featuredAs` frontmatter was dead config.** `slotOf()`
   only read `featuredConfig.slots`, never `featuredAs`. Now reads
   `featuredConfig.slots → featuredAs → kind default` (precedence documented).

4. **[CONCERN → fixed] RSS `<link rel="alternate">` missing from landing head.**
   Landing has its own `<head>`, not PublicLayout. Added the tag directly.

5. **[CONCERN → fixed] `findType` not schema-enforced.** Spec says "required
   when `kind: find`." Added `.refine()` — a find without `findType` now fails
   the build.

6. **[CONCERN → fixed] Duplicate/divergent article typography.** `[slug].astro`
   applied both `aa-markdown-body` (global) and `aa-blog-article-body` (blog)
   with different values; mobile h2 had drifted. Removed the parallel type
   block; `aa-blog-article-body` now only adds measure (65ch) + spacing,
   inheriting the global markdown typography.

7. **[NIT → fixed] Misleading 404 comment** in `[slug].astro` claimed an
   `Astro.redirect` that didn't exist. Corrected to describe the actual
   mechanism (static host 404 for unmatched paths).

8. **[NIT → fixed] Unused `getEntry` import** removed from `[slug].astro`.

9. **[NIT → fixed] Dead `display: block`** before `display: grid` on
   `.aa-spotlight-hero` removed.

10. **[NIT → fixed] Inline `style`** on article tags row → `.aa-blog-article-tags` class.

11. **[NIT → fixed] Jargony "Spotlight/Split" label** dropped from featured head
    (internal pattern names, not user-facing).

### Spawned

None. No out-of-scope findings worth tracking as separate tasks.

### Deferred / rejected

- **Article h1 weight (700) vs hero h1 (600):** Defensible divergence — article
  titles warrant heavier weight than the index hero. Left as-is.
- **ISO-week hand-rolled computation:** Correct; the spec says rotation cadence
  is unspecified. Kept — the implementation is deterministic and tested.
- **`featured.config.ts` location inside content dir:** The glob is `**/*.md`, so
  the `.ts` file is correctly excluded. Low risk; would only bite on a glob
  pattern change to `**/*`, which would be a deliberate edit.
- **Title-quote paraphrase in `you-fall-to-the-level-of-your-systems.md`:** The
  title paraphrases "don't" for "do not" for readability. Minor; left as-is.

## Verdict

**Ready for sign-off.** Both blockers resolved and verified (dedup airtight in
both patterns; 1200px canvas rendering). All spec done-conditions pass with
evidence. Cold-context reviewers' concerns addressed. Build is clean, drafts are
unlisted everywhere, RSS/sitemap/canonical URLs are consistent, and the tone
matches PRODUCT.md (calm, honest, no exclamation marks, no manipulation).

Awaiting Discover sign-off to flip `done`.
