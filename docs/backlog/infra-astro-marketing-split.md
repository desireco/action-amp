---
id: infra-astro-marketing-split
kind: backlog
title: "Split marketing site into Astro on Cloudflare Pages (subdomain split)"
status: done
priority: P1
spec_owner: user
build_owner: build
gates: marketing SEO, content velocity, Founding 100 discoverability
created: 2026-07-06
completed: 2026-07-06
---

# Astro marketing split

> **DONE 2026-07-06.** All 7 phases shipped. The marketing surface is live on
> Astro (Cloudflare Pages) at `actionamp.com`; the Wasp app + auth + billing + DB
> is on Railway at `app.actionamp.com` / `api.actionamp.com`; the Wasp marketing
> routes are deleted. Verified end-to-end in production. The writeup below is the
> plan as executed; only the Stripe Dashboard follow-up remains (add
> `app.actionamp.com/founding-100/welcome` to the Stripe allowed success_url
> origins before the first real Founding 100 checkout).
>
> **Revised 2026-07-06:** `/founding-100` stays in Wasp entirely (offer page +
> auth + checkout + webhook + welcome). Astro only reads a public count endpoint
> to surface scarcity and link into the app. This drops the hardest port (the
> auth-gated checkout handoff) and removes the prior "keep a minimal Wasp
> `/founding-100`" ambiguity.

## What

Move ActionAmp's marketing surface out of the Wasp SPA into a separate Astro
site, deployed as static SSG on Cloudflare Pages, behind a **subdomain split**.
The Wasp app (app + auth + billing + DB) stays on Railway. Astro never touches
the database; all money and identity flows remain in Wasp.

### Why

The five SEO-bound marketing routes (`/`, `/about`, `/privacy`, `/terms`,
`/roadmap`) currently live inside the Wasp SPA and are **client-rendered only**
— no SSR, no sitemap, no `robots.txt`, no per-page `<title>`, meta description,
or Open Graph tags. For a marketing surface that's the biggest gap in the repo.
Astro in static mode fixes all of it: pre-rendered HTML, per-page frontmatter
meta, generated sitemap, global edge delivery. (`/founding-100` and
`/founding-100/welcome` stay in Wasp — see "Route ownership" below.)

This reverses a deliberately documented decision (`MARKETING.md` §5 /
`PUBLIC-PAGES.md` §6: "Wasp public routes, one deploy, one domain" — the
separate static site was "considered, rejected for the extra moving parts"). The
trade-off was reasonable before organic discovery mattered. With `MARKETING.md`,
`PUBLIC-PAGES.md`, a `/roadmap` page, and planned `/blog` / `/guides` all in
scope, the moving parts are now worth it.

## Target architecture (decisions locked)

```
actionamp.com          → Cloudflare Pages  → Astro (static SSG, zero DB access)
app.actionamp.com      → Railway            → Wasp client SPA
api.actionamp.com      → Railway            → Wasp server + Postgres (existing)
```

Decisions confirmed with user 2026-07-06:
- **Domain split:** subdomain (not path-based). Cleaner origin separation, no
  edge rules; rewrites CTAs and adds `WASP_WEB_CLIENT_URL` repoint.
- **Astro hosting:** Cloudflare Pages (free, global edge, PR previews, native
  fit for static SSG). Not Railway.
- **Repo:** monorepo sibling `site/` (not separate repo).
- **DB:** stays in Railway, Wasp-only. Astro has no DB access.
- **Founding 100:** the entire route + functionality stays in Wasp (offer page,
  auth, checkout, webhook, welcome). Astro only reads a public count endpoint so
  the marketing site can surface scarcity ("X of 100 left") and link into
  `app.actionamp.com/founding-100`. No auth-gated logic crosses into Astro.

### Route ownership

| Route | Lives in | Why |
|---|---|---|
| `/`, `/about`, `/privacy`, `/terms`, `/roadmap` | **Astro** | Static, SEO-bound |
| `/blog`, `/guides`, `/help` (future) | **Astro** | Content-native |
| `/founding-100`, `/founding-100/welcome` | **Wasp** | Auth-gated checkout + webhook + welcome — whole flow stays together |
| `/app/*`, `/login`, `/signup`, `/auth/*`, `/webhooks/*` | **Wasp** | Transactional |

Astro surfaces Founding 100 scarcity on the landing page via the public count
endpoint (Phase 4) and links to `app.actionamp.com/founding-100`.

### Why Astro never writes to the DB

The Founding 100 flow has four pieces; only the webhook is a true write, and it
already lives in Wasp (`main.wasp.ts:203`). If Astro wrote to Postgres it would
need SSR/Workers + a second Prisma client + re-implemented Wasp JWT auth — and
the Wasp webhook would still have to stay. Two codebases, two auth paths, one
shared schema, more moving parts. Keeping the whole `/founding-100` route in
Wasp is the same logic applied one level up: Astro is static and SEO-only; Wasp
owns everything that touches money or identity.

---

## Phase 1 — Lock the decision (doc cascade)

Authority chain for this reversal: `MARKETING.md §5 → PUBLIC-PAGES.md §6 →
deployment-research.md`. **`WORKFLOW.md` and `AGENTS.md` are NOT in this chain**
(hosting ≠ app structure) and need no edits. The "Structure changes start in
WORKFLOW.md" rule does not apply.

### `docs/MARKETING.md`
- **§5 (lines 127–133):** replace "Where it lives — DECIDED: Wasp public routes
  (one domain)" with the new decision: Astro (Cloudflare Pages) owns marketing;
  Wasp (Railway) owns app + auth + billing; subdomain split.
- **§8 line 157:** update the strikethrough "Resolved decisions" record — mark
  the reversal with date (2026-07-06), matching the doc's own pattern at lines
  161.

### `docs/PUBLIC-PAGES.md`
- **§6 handoff diagram (lines 200–208):** rewrite the bare-relative-path diagram
  into cross-subdomain paths. `/login`, `/signup`, `/founding-100`,
  `/founding-100/welcome`, `/app` live on `app.actionamp.com`; marketing routes
  on `actionamp.com`.
- **§6 "Public routes" para (lines 210–213):** reframe — the marketing routes
  are no longer Wasp `authRequired: false` routes; they're Astro pages. Note
  which routes remain Wasp-side (`/founding-100`, `/founding-100/welcome`,
  `/login`, `/signup`).
- **§9 Cascade history (lines 251–267):** add a new dated entry recording the
  hosting reversal, matching the established cascade-entry pattern.

### `docs/research/deployment-research.md`
- **Verdict block (lines 3–9):** add a clause — CF Pages now hosts the marketing
  site; "Cloudflare is client-only" stays true for the Wasp app.
- **§1 Recommendation (lines 46–52):** concretize "Default: Fly.io or Railway"
  → **Railway chosen** for app + DB; add marketing→CF Pages decision.
- **New §6 "Decision (marketing/app split, 2026-07-06)":** dated decision record
  mirroring the MARKETING.md/PUBLIC-PAGES.md pattern. Lowest-friction,
  non-destructive; keeps original research as history.

---

## Phase 2 — Scaffold `site/` and prove the pipeline

### Install (from repo root)
```bash
npm create astro@latest site     # Empty project · Strict TS · npm
cd site && npm install @astrojs/sitemap
```

### Repo layout
```
site/
├── src/
│   ├── pages/             index.astro, about.astro, privacy.astro,
│   │                      terms.astro, roadmap.astro
│   ├── layouts/           PublicLayout.astro
│   ├── components/        Button.astro, BrandMark.astro, Faq.astro
│   ├── content/           about.md, privacy.md, terms.md (moved from webapp/src/public-content/)
│   └── styles/tokens.css  copy of webapp/src/styles/tokens.css
├── public/                favicon.svg, favicon.ico, apple-touch-icon.png (copied)
├── astro.config.mjs       site: "https://actionamp.com"; integrations: [sitemap()]
├── .env                   PUBLIC_APP_URL=http://localhost:4000 (dev); prod override at deploy
├── package.json
└── tsconfig.json
```

### Port shared assets
| Wasp source | Astro target | How |
|---|---|---|
| `webapp/src/styles/tokens.css` | `site/src/styles/tokens.css` | Copy (dedupe to workspace package later if drift bites) |
| `webapp/src/components/ui/Button.{tsx,css}` | `site/src/components/Button.astro` | Rewrite as native `.astro` |
| `webapp/src/shared/PublicLayout.tsx` + `.css` | `site/src/layouts/PublicLayout.astro` | Port; nav/footer links become absolute to `app.` subdomain |
| `webapp/src/shared/{MarkdownPage.tsx,markdown.ts}` | **Drop** | Use Astro's built-in Markdown |
| `webapp/src/public-content/{about,privacy,terms}.md` | `site/src/content/` | Move (keep copies in webapp until Phase 7) |

### Proof point: build `/about` end-to-end first
Port the simplest static page through `PublicLayout.astro` + `tokens.css` + the
markdown content. Verify `npm run dev` renders it, then `npm run build` produces
static HTML. Confirm per-page `<title>`/meta in frontmatter works. **Only
proceed to Phase 3 once this one page is clean.**

---

## Phase 3 — Port the remaining marketing pages

Port in order of static-ness (easiest → most dynamic):

1. **`/privacy`, `/terms`** — pure markdown via Astro's built-in renderer;
   near-identical to `/about`.
2. **`/roadmap`** — hand-curated static content (`webapp/src/public/RoadmapPage.tsx`,
   325 lines). Pure markup, no data calls. Port to `.astro`.
3. **`/`** (landing) — the big one: `webapp/src/landing/LandingPage.tsx` (422
   lines) → `site/src/pages/index.astro`. **Port to native `.astro`, do not
   mount the React component as an island** (defeats SEO). Convert CTAs from
   `<Link to="/signup">` to `<a href="${appUrl}/signup">` using
   `import.meta.env.PUBLIC_APP_URL`. If the landing page teases Founding 100,
   the "X spots left" counter comes from Phase 4's endpoint and the CTA links to
   `app.actionamp.com/founding-100`.

`/founding-100` is **not** ported — the whole route stays in Wasp (see Route
ownership). This is the simplification: no auth-gated checkout handoff to port.

All CTAs and nav links into the app use `${import.meta.env.PUBLIC_APP_URL}/...`
so dev → prod switches cleanly. Add per-page SEO frontmatter (`title`,
`description`, Open Graph) to every page — the headline benefit of the split.

---

## Phase 4 — Live spots counter for the landing page (public endpoint + Astro fetch)

The whole `/founding-100` route stays in Wasp, but Astro's landing page surfaces
the scarcity signal ("X of 100 spots left") and links into the app. That needs
one public read endpoint — the only coupling point between Astro and the DB.

### Wasp side: new public REST endpoint
Add a thin `api()` route in `webapp/main.wasp.ts` alongside the existing Stripe
webhook (line 203):
```ts
api("GET", "/founding-100/status", founding100StatusHandler, { auth: false })
```
Wraps the **existing** `getFounding100Status` logic (a single
`User.count({ where: { plan: "FOUNDER" } })`, already `auth: false` at
`main.wasp.ts:200`, PII-free) and returns `{ cap, claimed, remaining, isFull }`.
Gives Astro a stable public URL (`https://api.actionamp.com/founding-100/status`)
decoupled from Wasp's internal RPC format. No new DB access, no secrets. This is
also the value Astro checks to know when to cut off the offer (`isFull` → stop
surfacing, or show "All 100 spots claimed").

### Astro side: client-side fetch
On `site/src/pages/index.astro` (landing) — wherever the Founding 100 teaser
lives — add an inline `<script>` that fetches the status endpoint and renders
`remaining` into the counter element. When `isFull`, swap the CTA to "All 100
spots claimed" (disabled) or hide the block. Fallback: if the fetch fails, hide
the counter (the page still renders). Client-side only — Astro stays 100%
static SSG.

### Verify
- Endpoint returns 200 unauthenticated with correct shape.
- Landing page shows the live number; disabling network hides it gracefully.
- When `isFull`, the teaser reflects the cut-off state.

---

## Phase 5 — Deploy Astro to Cloudflare Pages (parallel/preview)

1. Push `site/` to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
   → select repo.
3. Settings:
   - **Root directory:** `site`
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
   - **Environment variable:** `PUBLIC_APP_URL=https://app.actionamp.com`
4. **Custom domain:** add `actionamp.com` + `www` → Cloudflare manages apex DNS.
   (DNS cutover happens in Phase 6; until then use the Cloudflare preview
   subdomain to verify.)
5. Verify on the preview domain: per-page `<title>`/meta present in view-source,
   `sitemap.xml` + `robots.txt` reachable, HTML pre-rendered (not empty
   `<div id="app">`), CTAs point at `app.actionamp.com`.

---

## Phase 6 — DNS cutover + Wasp env updates

Live-switch phase — sequence carefully, do during a low-traffic window.

### DNS (Cloudflare)
- **Apex `actionamp.com`** → Cloudflare Pages (was pointing at Wasp).
- **New CNAME `app`** → Railway service (the Wasp client).
- `api.actionamp.com` → unchanged.

### Wasp config
- **`webapp/.env.server` (prod):** `WASP_WEB_CLIENT_URL=https://app.actionamp.com`
  (was apex). Auto-fixes Stripe `success_url`/`cancel_url`
  (`billing/operations.ts:100–106`) and welcome email
  (`onboarding/welcomeEmail.ts:60`) — no code changes.
- **`webapp/main.wasp.ts:93`:** `onAuthFailedRedirectTo: "/"` → absolute
  `https://actionamp.com` (verify Wasp 0.24 accepts an absolute URL here; if
  not, add a Wasp `/` route that 302-redirects to the marketing apex).
- **Stripe dashboard:** add `https://app.actionamp.com/founding-100/welcome` to
  allowed `success_url` origins.
- **CORS:** confirm Wasp server allows the `actionamp.com` origin for the public
  status endpoint.

### Verify post-cutover
- `actionamp.com` serves Astro (static HTML in view-source).
- `app.actionamp.com/login` works; email auth links land on `app.` subdomain.
- Founding 100: landing page counter → click → `app.actionamp.com/founding-100`
  → Stripe → `app.actionamp.com/founding-100/welcome`.
- Astro spots counter hits `api.actionamp.com/founding-100/status`.

---

## Phase 7 — Remove marketing routes from Wasp + cleanup

Only after Phase 6 is verified stable in production.

### Remove from `webapp/main.wasp.ts`
Routes (and their `page()` imports): `LandingRoute`, `AboutRoute`,
`PrivacyRoute`, `TermsRoute`, `RoadmapRoute`. **Keep:** `Founding100Route`,
`Founding100WelcomeRoute`, `LoginRoute`, `SignupRoute`, `AppRoute`, all
`/app/*` (the entire Founding 100 flow stays in Wasp).

### Delete now-orphaned files
- `webapp/src/landing/` (LandingPage.tsx, LandingPage.css)
- `webapp/src/public/` except `Founding100Page.tsx` and `Founding100WelcomePage.tsx`
  (delete AboutPage, PrivacyPage, TermsPage, RoadmapPage + their CSS)
- `webapp/src/public-content/` (about.md, privacy.md, terms.md — now in
  `site/src/content/`)
- `webapp/src/shared/PublicLayout.{tsx,css}`, `MarkdownPage.tsx`, `markdown.ts`
  — **verify no remaining Wasp page imports these before deleting**
  (`Founding100Page` / `Founding100WelcomePage` may still use `PublicLayout`; if
  so, keep or inline).

### Verify
- `wasp compile` succeeds (no dangling imports).
- No broken internal links — grep the remaining Wasp client for `to="/about"`,
  `to="/"`, etc. and fix any pointing at removed routes (should be absolute
  `actionamp.com/...` links).
- E2E: full signup → app flow still works; Founding 100 checkout still works
  end-to-end on the `app.` subdomain.

---

## Sub-decisions made (flag if any are wrong)

1. **New public REST endpoint** (`GET /founding-100/status`) rather than calling
   the existing Wasp query directly from Astro. Decouples Astro from Wasp's
   internal RPC format; stable contract.
2. **Doc cascade is Phase 1**, before code. Matches the repo's doc-first culture
   and the fact that this is a documented-decision reversal.
3. **`/founding-100` stays in Wasp entirely** — offer page, auth, checkout,
   webhook, welcome. Astro only reads the public count endpoint and links in.
   Avoids porting any auth-gated checkout logic. (Revised 2026-07-06; supersedes
   the earlier "keep a minimal Wasp `/founding-100`" option.)
4. **Astro = 100% static SSG**, no SSR/Node adapter, no Cloudflare Workers
   Functions. The spots counter is a client-side `fetch`; everything else is
   build-time HTML.
5. **Copy `tokens.css` into `site/`** rather than a shared workspace package
   now. Defer workspace/package sharing until drift becomes a real problem.

## Out of scope
- `docs/WORKFLOW.md` (hosting is outside its cascade).
- Root `AGENTS.md` + `webapp/AGENTS.md` (routing rows still point at the correct
  docs).
- The Wasp app's `/app/*`, `/login`, `/signup`, `/auth/*`, `/webhooks/*`,
  `/founding-100/*`, billing, auth, DB.
