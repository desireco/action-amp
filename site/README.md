# site/ — ActionAmp marketing (Astro)

The ActionAmp marketing surface, split out of the Wasp SPA into a static Astro
site for SEO (pre-rendered HTML, per-page meta, sitemap, robots.txt). Deploys to
Cloudflare Pages at `actionamp.com`. The Wasp app (app + auth + billing + DB)
stays on Railway at `app.actionamp.com`.

Full plan: [`../docs/backlog/infra-astro-marketing-split.md`](../docs/backlog/infra-astro-marketing-split.md).
Hosting decision: [`../docs/MARKETING.md`](../docs/MARKETING.md) §5.

## Status

All five marketing pages ported (`/`, `/about`, `/privacy`, `/terms`,
`/roadmap`) + Founding 100 teaser wired to the live status endpoint. Deployed
to Cloudflare Pages at `actionamp-site.pages.dev`. Phase 6 (DNS cutover so the
apex `actionamp.com` points here) is the remaining step before the public
launch. `/founding-100` itself stays in Wasp — not ported.

## Commands

| Command           | Action                                       |
|-------------------|----------------------------------------------|
| `npm install`     | Install dependencies                         |
| `npm run dev`     | Dev server at `localhost:4321`               |
| `npm run build`   | Production build to `./dist/` (static SSG)   |
| `npm run preview` | Preview the build locally                    |
| `npm run deploy`  | Build with prod env vars + push to Cloudflare Pages |

## Deploy

`npm run deploy` builds with the prod subdomains baked in
(`PUBLIC_APP_URL=https://app.actionamp.com`,
`PUBLIC_API_URL=https://api.actionamp.com`) and uploads `dist/` to the
**`actionamp-site`** Cloudflare Pages project (`--branch=main` = production).

- **Auth:** `wrangler login` (OAuth, one-time). The repo-root `.env` holds a
  DNS-scoped `CLOUDFLARE_API_TOKEN` that wrangler auto-loads and that blocks
  OAuth — run `wrangler login` from a directory with no `.env` (e.g. `/tmp`).
- **Project:** `actionamp-site`, account `17229b0b004cf34f38f75d7bd247d905`.
- **Live URL:** `actionamp-site.pages.dev` (custom domain `actionamp.com`
  wired in the dashboard during the Phase 6 DNS cutover).
- **Env vars are bake-time, not dashboard-time** — they're inlined into the
  static HTML at build, so the dashboard env-var panel doesn't apply.
- **Direct upload, not git-connected** — re-run `npm run deploy` to ship
  changes. (Git-connected auto-rebuild can be added later if desired.)
- `wrangler.toml` holds the project name + output dir; deploy doesn't need it
  (the script passes flags explicitly) but it documents the config.

## Structure

```
src/
├── pages/           index.astro (placeholder), about.astro
├── layouts/         PublicLayout.astro — nav + footer chrome + head/meta
├── components/      BrandMark.astro, Button.astro
├── content/         about.md (frontmatter: title, description)
├── content.config.ts  pages collection (glob loader, Astro 7 API)
└── styles/
    ├── tokens.css   copied from webapp/src/styles/tokens.css (source of truth)
    └── global.css   bundles tokens + public-layout + button CSS
```

## Env

- `PUBLIC_APP_URL` — the Wasp client origin (dev: `http://localhost:4000`,
  prod: `https://app.actionamp.com`). Used by `PublicLayout.astro` for
  app-side links (e.g. the Founding 100 footer link). Prod override happens in
  the Cloudflare Pages dashboard, not this repo.

## Notes

- Astro 7 — uses the glob loader + `render(entry)` API (not the legacy
  `entry.render()` or `src/content/config.ts` location).
- `tokens.css` is a verbatim copy of the webapp's; keep them in sync (or extract
  a shared package — deferred per the plan).
- `/founding-100` is **not** ported — the whole route stays in Wasp. Astro's
  only coupling to the DB is a public read endpoint (Phase 4).
