# Review: blog-social-meta

**Spec:** `docs/specs/blog-social-meta.md`
**Status:** `review` (ready for Discover sign-off)
**Built:** 2026-07-08

## What changed

Makes every blog post render a rich preview when shared to X, LinkedIn, Slack,
iMessage, and any OG/Twitter-Card reader. Composes with the shipped `blog`.

**New files:**
- `site/public/og/default.png` — default OG image (1200×630, branded teal + mark)
- `site/scripts/og-default.html` — the template the PNG was rendered from (Playwright screenshot source)
- `site/src/components/ShareRow.astro` — Copy link + X + LinkedIn, plain anchors + clipboard

**Modified files:**
- `site/src/layouts/PublicLayout.astro` — extended Props (ogImage, socialDescription, twitterCard, publishedTime, modifiedTime, author, tags); emits og:image + dims + alt, twitter:card/title/description/image, article:* tags
- `site/src/pages/blog/[slug].astro` — passes social meta to PublicLayout; renders ShareRow
- `site/src/styles/blog.css` — share row styles + copied/failed states
- `site/src/content.config.ts` — `ogImage` schema tightened to require a root-absolute path

## Gates run

### Build
- `npm run build` → **15 pages, exit 0**. Verified before and after review fixes.

### Cold-context reviewers (AI #2)
Two fresh-context reviewers, distinct angles:

| Angle | Verdict |
|-------|---------|
| Correctness / regressions / spec compliance | 2 blockers + 4 concerns found; blockers **fixed** |
| Simplicity / maintainability / brand-tone | 0 blockers; 3 concerns, all **addressed** |

### Done-conditions verification

| Done-condition | Status | Evidence |
|---|---|---|
| Default OG at `public/og/default.png`, 1200×630 | PASS | PNG verified 1200×630, branded |
| Per-post `ogImage` override + fallback | PASS | `[slug].astro` passes `d.ogImage ?? "/og/default.png"`; schema requires leading slash |
| `og:image:width`/height emitted | PASS | 1200×630, only when ogImage set |
| `og:image:alt` emitted | PASS | Set to post title |
| `twitter:card` = summary_large_image on posts | PASS | Verified in built HTML |
| `twitter:title`/description/image | PASS | All present on article pages |
| `article:published_time` (ISO 8601) | PASS | `2026-07-05T00:00:00.000Z` |
| `article:modified_time` (updatedDate else pubDate) | PASS | Falls back correctly |
| `article:author` = "ActionAmp" | PASS | |
| `article:tag` per category | PASS | Verified Focus/Method/Attention tags emit |
| `og:site_name` | PASS | Already site-wide |
| `socialDescription` overrides in share tags only | PASS | SEO `<meta description>` still uses `description` |
| Share row: Copy link + X + LinkedIn | PASS | Plain anchors, no third-party scripts |
| Copy confirms calmly (~2s) | PASS | "Link copied" teal state for 2s |
| Copy failure has honest feedback | PASS | "Press ⌘C to copy" amber state (post-review fix) |
| X/LinkedIn intent URL formats | PASS | Both encoded; absolute canonical URLs |
| Calm styling, teal accents | PASS | Pill buttons, teal hover, no "SHARE NOW" |
| No third-party scripts | PASS | One inline `<script>` (clipboard handler); zero external src |
| Absolute URLs for og:image/twitter:image | PASS | `new URL(ogImage, siteUrl).href` |
| No OG image on non-blog pages (non-goal) | PASS | `/privacy` has 0 og:image tags (post-review fix) |
| Validation (LinkedIn/X/Slack) | DEFERRED | Manual — see Findings |

## Findings

### Applied (in-scope fixes from review)

1. **[BLOCKER → fixed] Copy link silently no-op'd on failure.** The empty
   `catch (e) {}` swallowed clipboard failures with zero feedback — a user clicks
   "Copy link", nothing happens, no error. Brand rule: "honest, not salesy."
   **Fix:** added a `fail()` path that shows "Press ⌘C to copy" in amber for ~3s.
   The clipboard promise now chains `.then(done, fail)` and the `execCommand`
   fallback checks its return value.

2. **[BLOCKER → fixed] Non-blog pages leaked the blog-branded OG image.**
   `/privacy`, `/terms`, etc. got `og:image = /og/default.png` — an image that
   says "Essays on focus, decisions..." on a legal page. Violated the spec's
   "no work outside /blog" non-goal. **Fix:** `ogImage` has no default now; the
   OG image tags only emit when `ogImage` is passed. `[slug].astro` passes
   `"/og/default.png"` explicitly. Verified: `/privacy` now has 0 og:image tags.

3. **[CONCERN → fixed] `ogImage` path-resolution hazard.** A relative path
   (`og/foo.png`, no leading slash) would resolve against the article URL, not
   the site root → 404 OG image. **Fix:** schema now requires
   `/^\/[^/].*$/` (root-absolute); a malformed path fails the build.

4. **[CONCERN → fixed] Dead `ogImageAlt` prop.** No caller ever set it; it
   always fell through to `title`. Removed per spec lean ("title is enough").

5. **[CONCERN → fixed] Article-meta conditionals repeated the `ogType === "article"`
   gate four times.** Consolidated into one `<Fragment>` block — reads as
   "article tags" not four parallel checks.

### Deferred / rejected

- **Validation done-conditions (LinkedIn Post Inspector / X card validator /
  Slack paste):** These require publishing to a publicly-crawable URL and
  pasting into each platform's tool. Deferred to post-deploy — the meta tags are
  verified correct by inspection, but platform rendering can diverge (LinkedIn
  caches, X ignores `og:image:alt`). Recommend running one post through the
  LinkedIn Post Inspector after deploy and noting results here.
- **Magic-number spacing in ShareRow CSS (`6px`):** The reviewer flagged it as
  off-token. Kept — `6px` sits between `--aa-space-xs` (4px) and `--aa-space-sm`
  (8px) and gives the pill buttons the right visual density at this size.
  Defensible either way; not worth a token change for one component.
- **OG template color drift risk:** The `og-default.html` hardcodes oklch values
  mirroring `tokens.css`. Accepted — it's a one-off render source, not shipped
  to browsers. If the brand shifts, regenerating the PNG catches it.

## Verdict

**Ready for sign-off.** Both blockers resolved (copy failure is honest; non-blog
pages no longer leak the blog image). All spec done-conditions pass with evidence
except the three manual platform-validations, which are deferred to post-deploy
(they require a public URL). Build is clean, no external scripts, OG image
branded and on-spec, share row calm.

Awaiting Discover sign-off to flip `done`.
