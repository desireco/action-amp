# DISPATCH — Link Garden backend (standalone Typebase)

**TARGET MODEL: Codex (capable tier) — author**
Goal: spike D1-AM · Timebox: half a day · Repo: action-amp root

## Read first

1. `AGENTS.md` (repo root) — house rules.
2. `docs/plans/2026-08-31-spike-link-garden.md` — the full spike spec (you
   are building its `api/` piece).

## Scope — build exactly this, nothing more

A **standalone** Typebase backend at `spikes/link-garden/api/` (own Bun
service, its own database — never any existing ActionAmp database):

* **Schema:** `User` (better-auth) · `Link { id, userId, url, title,
  status: NEW|KEPT|DISMISSED, createdAt, keptAt? }` · `Tag { id, userId,
  name }` unique `(userId, name)` · `LinkTag { linkId, tagId }` join.
* **Actions:** `links.create(url, tags[])` (server fetches the page
  `<title>`; fall back to the URL), `links.list({status?, tag?})`,
  `links.setStatus(id, status)`, `links.addTag(id, name)`,
  `stats.today` (captured/kept counts for today). All scoped to the
  authenticated user.
* **Auth:** better-auth, whichever provider is fastest to working
  (credentials are fine for a spike). The auth *shape* is a finding, not a
  deliverable — don't let it eat the timebox.
* **Deploy:** one scratch Railway service + its own tiny Postgres. Ask Jake
  for Railway access/credentials — do not reuse any existing ActionAmp
  service or database.

## Done when

* Deployed URL answers: sign up → log in → `links.create` → `links.list`
  round-trip via curl (paste the transcript into your notes).
* Actions match the spec; unknown-user scoping is enforced.
* `spikes/link-garden/notes/api-notes.md` exists and records:
  - standalone operation: did backend-as-a-folder run as its own service
    naturally, or did you need a host shell/workarounds? (headline finding)
  - better-auth setup friction and its schema shape,
  - Bun + Railway deploy steps and anything that broke,
  - the exact HTTP endpoint shapes (method, path, payload) — the Imba client
    will consume these raw.

## Constraints

* Only create/modify files under `spikes/link-garden/api/` and
  `spikes/link-garden/notes/`. **Never touch `webapp/`, `apps/`, `packages/`,
  databases named `actionamp_*`, or anything in `docs/` except your notes
  file.**
* Commit focused, directly on `main`, prefix `spike(link-garden):`.
* Throwaway quality bar: working and documented beats polished.
