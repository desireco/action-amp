# Deployment Research — Where to host ActionAmp (Wasp), incl. VoidZero & Bun

> Verdict: **Deploy to Fly.io or Railway.** Both are first-class Wasp targets with
> one-command launch. Cloudflare is client-only (official guide). **VoidZero is a
> dead end** for us (tooling company, being acquired by Cloudflare; its hosting
> product was edge-only and built on CF). **Wasp can't run on Bun** — the
> generated server hard-codes `node`.
>
> **Update 2026-07-06 (marketing split):** the analysis below is about hosting
> the **Wasp app** and remains correct. The *marketing site* is a separate
> concern and goes to **Cloudflare Pages** (static Astro SSG) — not covered by
> the "Cloudflare is client-only" line, which refers to the Wasp *server*. See
> §6 for the decision.
> Sources: wasp.sh/docs **v0.24** (pulled `2026-06-15`), VoidZero announcement,
> Wasp GitHub repo (`waspc/data/Generator/templates/server/package.json`).

## 0. Correction to earlier analysis

Previously I said "Cloudflare can't host Wasp." That was imprecise. Wasp's 0.24
docs **do** list an official Cloudflare Workers guide — but the title is
*"Deploy Wasp to Cloudflare Workers **client**."* It deploys only the static SPA
to a Worker (with an SPA-fallback fetch handler). The Node/Express **server still
has to live elsewhere.** The practical conclusion stands; I just overstated it.

---

## 1. Where to deploy Wasp (authoritative list, v0.24)

### Tier 1 — first-class, `wasp deploy <provider> launch`
One command creates everything: client + server + Postgres, wired with the right
env vars (`WASP_WEB_CLIENT_URL`, `WASP_SERVER_URL`, `DATABASE_URL`, `JWT_SECRET`).

| Provider | How | Notes |
|---|---|---|
| **Fly.io** | CLI creates 3 apps + Postgres, Docker-based, 34 regions | Traditional Wasp home; most battle-tested; cheapest to start |
| **Railway** | CLI creates services + managed Postgres | Polished dashboard, slightly pricier, project-name uniqueness quirk |

### Tier 2 — official step-by-step guides (manual, but documented)
- **Cloud providers:** Cloudflare (client only), Fly.io, Heroku, Netlify (client only), Railway, Render
- **Self-hosted:** Caprover, Coolify, plain VPS + Docker + Caddy

### Tier 3 — "anything that runs Node + serves static files + runs Postgres"
DigitalOcean App Platform, AWS/GCP/Azure, Hetzner, etc. Wasp hands you a
`Dockerfile` for the server (`.wasp/out/`) and static files for the client
(`.wasp/out/web-app/build`). Any Node-capable host works.

### CI/CD
Both Fly and Railway have documented GitHub Actions workflows (`wasp deploy
<provider> deploy` on push to main). Pin `WASP_VERSION` in the workflow to avoid
surprise breakage.

### Recommendation for ActionAmp
- **Default: Fly.io** — one command, cheapest, closest to Wasp's happy path.
- **Alternative: Railway** — better DX/dashboard, marginally more expensive. **←
  chosen for ActionAmp (2026-07-06); see §6.**
- **Render** — fine third option if you prefer its pricing model.
- **Cloudflare** — use as CDN/DDoS layer *in front of* a Node backend. Wasp's own
  deployment Extras page explicitly recommends this pattern. **Also chosen as the
  host for the separate Astro marketing site (Cloudflare Pages, static SSG) — see
  §6.**

---

## 2. VoidZero — not a fit

Investigated voidzero.dev and the acquisition announcement. Key findings:

1. **VoidZero is a *tooling* company, not a hosting platform.** They make
   **Vite, Vitest, Rolldown, Oxc, and Vite+**. That's their product line.
2. They did build a hosting product called **"Void"** (void.cloud), but their own
   announcement describes it as *"a Vite-native deployment platform built on top
   of **Cloudflare**."* So even at its peak, Void was a skin over Cloudflare's
   edge runtime — built for Vite-native/edge apps.
3. **VoidZero is being acquired by Cloudflare** (banner on homepage, 2026
   announcement post). The Void product is being absorbed; the team is joining CF
   to "make Cloudflare a better platform to deploy Vite apps on." The brand is
   effectively deprecated.

**Bottom line for Wasp:** Void/VoidZero is a dead end. It targets edge/Vite-native
apps, it's built *on* Cloudflare (so it inherits the exact Workers runtime that
can't run Wasp's Node/Express server), and the product is winding down via
acquisition. Cross it off the list.

---

## 3. Can Wasp be run by Bun? — No

Two interpretations, both negative.

### (a) Bun as the runtime for the Wasp *server* — unsupported, by design

Pulled the generated server `package.json` from Wasp's repo
(`waspc/data/Generator/templates/server/package.json`). The `start` script is:
```json
"start": "node --enable-source-maps -r dotenv/config bundle/server.js"
```
With `"engines": { "node": "..." }` and `engineStrict: true`. Node is hardwired
into the build pipeline, the start scripts, and the Dockerfile.

Bun claims Node compat and can run Express, but:
- The generated `start` / `start-production` scripts invoke `node` directly.
- Server depends on **Prisma's native query engine** (officially Node-only),
  **socket.io** (Phase-2 websockets), nodemon, rollup — all Node-ecosystem, none
  CI-tested against Bun.
- GitHub search: **zero** issues about running the Wasp server on Bun as a
  runtime. The closest thing is the open "Support for WinterCG servers" issue
  (would enable Deno/CF Workers/Bun via a standard `Request → Response`
  signature) — 1 comment, no activity. Dormant.

You could *try* `bun bundle/server.js` after `wasp build` and it might partially
boot, but you'd be in unsupported territory that any Wasp release could silently
break.

### (b) Bun as a *package manager* (replacing npm) — also unsupported
- Issue #1445 "Add support for Bun as a package manager" → closed as duplicate of
  #2262 "Support different package managers" → **still open**, not implemented.
- The generated project assumes npm.

### Verdict
Wasp is Node-locked — deliberately, by generated code, by the `engines.node`
constraint, and by framework dependency choices. If "runs on Bun" is a real
requirement, that's an argument *against* Wasp, not a config tweak.

---

## 4. TL;DR matrix

| Option | Verdict |
|---|---|
| **Fly.io** | ✅ Best default — first-class CLI, cheapest, battle-tested |
| **Railway** | ✅ Strong alt — better DX, slightly pricier |
| **Render** | ✅ Fine third option |
| **Netlify / Cloudflare Workers** | ⚠️ Client/SPA only; server must go elsewhere |
| **Cloudflare as CDN** | ✅ Recommended in front of any Node backend |
| **VoidZero (Void)** | ❌ Dead end — tooling company, edge-only, being acquired by CF |
| **Self-hosted (Caprover/Coolify/VPS)** | ✅ If you already run a server |
| **Run Wasp on Bun** | ❌ Server hard-codes `node`; package-manager support unimplemented |

---

## 5. Recommended next step

- Provision a Fly.io or Railway account when we're ready to deploy.
- Keep SQLite for local dev (current `schema.prisma`); switch to PostgreSQL before
  first production build — `wasp db migrate-dev` will scaffold the migration.
- Put Cloudflare (free tier) in front for CDN/DDoS once the app has a domain.

---

## 6. Decision (marketing/app split, 2026-07-06)

ActionAmp now runs as **two deploy targets**, not one. This records the split;
the analysis in §1–5 above is unchanged (it covers the Wasp app only).

| Surface | Host | Runtime | Notes |
|---|---|---|---|
| **Wasp app** (client SPA + server + DB) | **Railway** | Node 24 + Postgres | Existing project `afda37a6-…`, service `action-amp-server`. Serves `app.actionamp.com` (client) + `api.actionamp.com` (server). Chosen over Fly for DX. |
| **Marketing site** (Astro) | **Cloudflare Pages** | None (static SSG) | Serves `actionamp.com`. Free, global edge, PR previews. Not a Wasp deploy — Astro is a sibling project in the repo (`site/`). |

**Why Cloudflare Pages for marketing, when §1 says CF is client-only for Wasp?**
Because the marketing site *is* client-only by design — it's static HTML. The
"client-only" limitation that rules out CF for the Wasp *server* is irrelevant
to a static Astro build. CF Pages is the natural fit: free, edge-delivered, and
SEO-friendly (the whole point of the split — the marketing routes were
client-rendered-only inside the Wasp SPA, with no SSR/sitemap/meta).

**Coupling between the two deploys:** exactly one. A public read endpoint on the
Wasp server (`GET api.actionamp.com/founding-100/status`, `auth: false`) feeds
the marketing site's live spots-remaining counter. No DB access from Astro.

**DNS:** apex `actionamp.com` → Cloudflare Pages; new `app.` CNAME → Railway;
`api.` unchanged from existing setup. Implementation plan:
`docs/backlog/infra-astro-marketing-split.md`.
