---
id: blog-social-meta
kind: spec
title: "Blog shareability — OG images, Twitter/LinkedIn cards, share buttons"
status: review
priority: P1
feature: blog
spec_owner: discover
build_owner: build
created: 2026-07-08

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MigHK      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:23:56Z
---

# Spec: Blog shareability — OG images, Twitter/LinkedIn cards, share buttons

## Summary

Make every blog post render a proper rich preview when shared to X, LinkedIn,
Slack, iMessage, and any platform that reads Open Graph / Twitter Card /
LinkedIn rich-preview metadata. Split out of the `blog` spec (which owns the
layout + content model) because shareability is a **per-post asset +
platform-contract** problem, not a layout problem — and because OG images in
particular are a content/design task, not a Build task. This spec reserves
nothing in `blog`'s schema (those slots already exist: `ogImage`,
`socialDescription`); it fills them and adds the platform tags + a share
component.

## Why

- **Social is the mobile channel.** A blog visitor from X/LinkedIn is almost
  always on a phone, and what they see in the embed *is* the landing page.
  Text-only embeds (no OG image) get roughly half the click-through of image
  embeds. For a blog whose discovery strategy is social-first, that's the
  whole game.
- **The basics are already in `blog`.** Canonical, `og:title`, `og:description`,
  `og:url`, `og:type` ship with the blog spec. This spec covers the *rest* —
  what makes a link "understand" the post on each platform.
- **It's split because the work splits.** The meta tags are Build work; the
  OG image strategy is a content/design decision (template-generated vs
  per-post vs none); the share buttons are a small component. Splitting keeps
  the blog spec buildable-as-standalone and lets the shareability work pull
  independently.

## Done-conditions

### OG image

- [ ] **A default OG image** exists at `site/public/og/default.png` (or
      `.jpg`), 1200×630, branded (ActionAmp mark + token teal). Used when a
      post has no per-post `ogImage`.
- [ ] A post with `ogImage` set (a path relative to `site/public/`) renders
      that image as `og:image` / `twitter:image`; a post without it falls back
      to the default.
- [ ] `og:image:width` and `og:image:height` (1200×630) are emitted alongside
      `og:image` on every post.
- [ ] `og:image:alt` is emitted, set to the post title (or a per-post
      `ogImageAlt` if added — Build's discretion; lean: title is enough).

### Twitter / X cards

- [ ] `twitter:card` = `summary_large_image` on every post (we always have an
      image, so large-image is correct).
- [ ] `twitter:title` = post title; `twitter:description` = post description.
- [ ] `twitter:image` mirrors `og:image`.
- [ ] (Optional, Build's discretion) `twitter:site` / `twitter:creator` if an
      ActionAmp X handle exists — leave unset if not.

### LinkedIn rich previews

- [ ] `article:published_time` = the post's `pubDate` (ISO 8601).
- [ ] `article:modified_time` = `updatedDate` if set, else `pubDate`.
- [ ] `article:author` = "ActionAmp" (single-byline per the blog spec).
- [ ] `article:tag` = each of the post's category tags
      (Focus | Method | Attention | Build).
- [ ] `og:site_name` = "ActionAmp" (likely already set site-wide; verify).

### Social description

- [ ] If a post sets `socialDescription`, it is used for `og:description` /
      `twitter:description` instead of the plain `description`. (Lets the
      share-card copy differ from the on-page meta description.)
- [ ] If `socialDescription` is unset, `description` is used (the `blog` spec
      default).

### Share buttons (article page)

- [ ] A quiet, calm share row on the article page (end of body, or a small
      sticky element on mobile — Build's discretion). Contains, at minimum:
      **Copy link** (copies the canonical URL; confirms with a calm toast) and
      **Share to X** (opens `https://twitter.com/intent/tweet?url=<canonical>&text=<title>`).
- [ ] (Optional) **Share to LinkedIn**
      (`https://www.linkedin.com/sharing/share-offsite/?url=<canonical>`).
      Lean: include — you named LinkedIn explicitly.
- [ ] The share row is **not** loud. No "SHARE NOW" styling; matches the
      article's calm register. Teal accents only where the design system
      already uses them (links/icons).
- [ ] **No third-party share widget / no external scripts.** Plain anchor
      links + a clipboard call. No AddThis/ShareThis/etc.

### Validation

- [ ] **Every published post** passes: paste its URL into the [LinkedIn Post
      Inspector](https://www.linkedin.com/post-inspector/) and it renders the
      title, description, image, and date correctly.
- [ ] At least one post verified in X's card validator (or by a real test
      tweet that shows the large-image card).
- [ ] At least one post verified in a Slack/iMessage paste (shows the OG
      preview unfurl).

## Non-goals

- **No custom per-post OG image design.** The default template + optional
  per-post override is the strategy. Generating bespoke images per post (AI
  or otherwise) is out of scope; the `ogImage` field simply points at an
  image that exists.
- **No automated OG image generation at build time** (e.g. Satori, or a
  Puppeteer render). A static default + optional manual overrides only.
  Auto-generation is a later option if the manual flow becomes friction.
- **No analytics on share-button clicks** beyond what `observability-minimal`
  provides site-wide. Not a separate funnel.
- **No Open Graph video/`og:video` support.** Static images only.
- **No comments or reaction embeds.** (Inherited from the blog spec.)
- **No work outside `/blog`.** Other site pages (`/about`, `/privacy`, etc.)
  already get the site-wide OG from `PublicLayout`; this spec is blog-only.

## Open questions (resolved — recorded for Build's discretion)

1. **Default OG image source.** **Resolved: a single branded default,
   manually produced.** ActionAmp mark on a teal-tinted surface, 1200×630.
   Discover/user supplies the image; Build places it at
   `site/public/og/default.png`. (If the user wants a template-generated
   default later, that's a new spec.)
2. **Share-row placement: end-of-body or sticky-on-mobile?** **Resolved:
   Build's discretion.** Either is calm as long as it's not loud. End-of-body
   is the lean (simpler, less chrome).
3. **Copy-link confirmation UX.** **Resolved: a calm inline confirmation** —
   the button label briefly becomes "Link copied" (≈2s), no modal, no toast
   sound. Matches the no-guilt-trip tone.
4. **Include a "Share to Mastodon/Bluesky" button?** **Resolved: no for v1.**
   X + LinkedIn + Copy-link covers the named targets. Adding per-instance
   Mastodon is friction (needs the user's instance); Bluesky's share intent
   can come later.

## Decisions locked

- **`summary_large_image`** Twitter card type — we always have an image.
- **Default OG image + optional per-post override** via `ogImage` (no
  auto-generation).
- **Share buttons: Copy link + X + LinkedIn**, plain anchors, no third-party
  widget.
- **`socialDescription` is optional** and overrides `description` in share
  tags only.
- **Article-type OG + `article:*` tags** for LinkedIn rich previews.
- **Validation is a done-condition**, not an afterthought — LinkedIn Post
  Inspector + X card check + one Slack/iMessage paste.

## Dependencies

- **`blog` (soft).** This spec fills slots the blog spec reserves
  (`ogImage`, `socialDescription`) and renders share UI on the article page
  the blog spec builds. The two compose; they do not block each other. The
  blog can ship without this; this can't ship without the blog's article
  route existing.
- **Default OG image asset** — a content/design item (user/Discover supplies
  it; Build places it). Gates the OG-image done-conditions; the rest of the
  meta work can land without it and fall back to no-image temporarily if
  needed (though that's the state we're trying to fix).
- **An X handle (optional).** `twitter:site`/`twitter:creator` are unset if no
  handle exists; not a blocker.
