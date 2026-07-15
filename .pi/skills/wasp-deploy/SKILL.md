---
name: wasp-deploy
description: Deploy the Wasp app to Railway or Fly.io via the Wasp CLI, or manually to another cloud provider. Includes pre-deployment validation (config placeholders, required env vars, pending migrations, production build test). Use when the user wants to deploy, ship to production, go live, or run pre-deploy checks. Based on this project's deployment research (docs/deployment-research.md) — first-class targets are Fly.io and Railway.
---

# Deploy the Wasp App

## Pre-Deployment

1. Run pre-deployment validation via [validating-pre-deployment.md](./validating-pre-deployment.md) — catches common issues before they break a deploy.
2. Present the supported `wasp deploy` providers and ask the user to choose one.

### Supported `wasp deploy` providers (first-class)

| Provider | Command | Notes |
|---|---|---|
| **Fly.io** | `wasp deploy fly launch <app-name> <region>` | Creates 3 apps (client + server + Postgres) in one shot. 34 regions. Cheapest to start. |
| **Railway** | `wasp deploy railway launch <project-name>` | Creates services + managed Postgres. Better dashboard. |

Both auto-set `DATABASE_URL`, `WASP_WEB_CLIENT_URL`, `WASP_SERVER_URL`, `JWT_SECRET`, `PORT`.

For other targets (Cloudflare client-only, Netlify client-only, Render, Heroku, Caprover, Coolify, self-hosted VPS), see the Wasp deployment guides (fetch via the docs map) — these are manual, step-by-step.

> **This repo's research:** see `docs/deployment-research.md` for the full comparison. TL;DR — **Fly.io** is the default recommendation; **Railway** if you prefer its DX. **Cloudflare can only host the client/SPA**, not the Node server. **VoidZero and Bun are dead ends** for Wasp.

3. Follow the steps from the chosen provider's guide to deploy. Fetch the provider's raw-markdown doc from the versioned docs map for the exact commands and flags.

---

## OAuth Redirect URLs

If the user is using OAuth providers, tell them they need to add the redirect URLs to each provider's dashboard. Example:

```
https://<your-server-url>/auth/google/callback
```

More info in the Wasp Social Auth Providers docs.

---

## Deployment Interrupted? Safe to rerun.

- ✅ Safe to rerun: `wasp deploy <provider> deploy`
- ⛔ **DO NOT** rerun: `wasp deploy <provider> launch` (one-time only — it creates the provider-side apps/resources).

---

## CI/CD (re-deploy on push)

Both Fly and Railway have documented GitHub Actions workflows. Pin `WASP_VERSION` in the workflow to avoid surprise breakage. Required secrets:
- **Fly.io:** `FLY_API_TOKEN` (from `fly tokens create org`)
- **Railway:** `RAILWAY_API_TOKEN` + `RAILWAY_PROJECT_ID`

Fetch the CI/CD doc from the versioned docs map for the exact workflow YAML.
