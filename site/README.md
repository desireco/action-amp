# site/ — ActionAmp marketing (Astro)

The ActionAmp marketing surface, split out of the Wasp SPA into a static Astro
site for SEO (pre-rendered HTML, per-page meta, sitemap, robots.txt). Deploys to
Cloudflare Pages at `actionamp.com`. The Wasp app (app + auth + billing + DB)
stays on Railway at `app.actionamp.com`.

Full plan: [`../docs/backlog/infra-astro-marketing-split.md`](../docs/backlog/infra-astro-marketing-split.md).
Hosting decision: [`../docs/MARKETING.md`](../docs/MARKETING.md) §5.

## Status

Phase 2 (scaffold + proof) done. `/about` is ported end-to-end. Remaining
pages (`/`, `/privacy`, `/terms`, `/roadmap`) land in Phase 3.

## Commands

| Command           | Action                                       |
|-------------------|----------------------------------------------|
| `npm install`     | Install dependencies                         |
| `npm run dev`     | Dev server at `localhost:4321`               |
| `npm run build`   | Production build to `./dist/` (static SSG)   |
| `npm run preview` | Preview the build locally                    |

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
