# Spike — Link Garden: Typebase × Svelte vs Imba

> Status: ready to dispatch. Two throwaway example apps, **one shared Typebase
> backend**, two frontends: Svelte 5 and Imba. Date: 2026-08-31. Timebox:
> **2 focused days**. Code lands under `spikes/link-garden/` — isolated from
> `webapp/`, `apps/`, and `packages/`; nothing here is production code.

---

## Why this spike exists

It answers four questions the platform switch depends on, cheaply:

1. **Can Typebase run as a standalone service serving two structurally
   different clients?** Typebase is "backend-as-a-folder" — designed to live
   inside one frontend project. The real migration needs it as a standalone
   `apps/api`, so the spike builds it standalone from the start. If the
   framework fights that, the spike records it — a heavy mark against
   Typebase in the F7 decision.
2. **How much of the typed contract survives a non-TypeScript frontend?**
   The Svelte client uses Typebase's generated TS client; the Imba client
   cannot — Imba is its own language, so it consumes the HTTP/JSON endpoints
   with hand-shaped calls. That delta is the real cost of the plan's
   "Svelte → Imba later" escape hatch, measured instead of assumed.
3. **An honest head-to-head.** Same domain, same screens, same keyboard map,
   same `tokens.css` in both — then compare velocity, code volume, bundle
   size, dev-loop, and optimistic-update ergonomics.
4. **A greenfield taste of Typebase's intended path**, better-auth included
   (no Wasp constraints in a spike — the opposite of the real migration's
   custom bridge; both flavors get learned).

This spike front-runs and deepens **F5 (Typebase arm)**; its report is a
direct input to **F7 (framework decision)**.

## The domain (fixed spec — both clients implement exactly this)

Capture → triage, in miniature:

* **Capture:** a `⌘K` box — paste a URL, title auto-derived (server-side
  fetch of `<title>`), optional tags entered inline (`#tag` tokens).
* **List:** links grouped under status tabs — **new / kept / dismissed**.
* **Triage keys:** `j/k` move · `K` keep · `D` dismiss · `T` tag · `⌘K`
  capture. Optimistic state changes with rollback on error.
* **Tag filter:** clicking a tag chip filters the list to that tag.

Schema:

```text
User                 (better-auth)
Link   { id, userId, url, title, status: NEW|KEPT|DISMISSED,
         createdAt, keptAt? }
Tag    { id, userId, name }          unique (userId, name)
LinkTag{ linkId, tagId }             join

stats.today           — captured/kept counts for today
```

Actions: `links.create(url, tags[])`, `links.list({status?, tag?})`,
`links.setStatus(id, status)`, `links.addTag(id, name)`.

## Structure

```text
spikes/link-garden/
  api/          standalone Typebase backend — own Bun service, own tiny
                Postgres, deployed once; the single source of truth
  web-svelte/   Svelte 5 client of api/ (generated TS client)
  web-imba/     Imba client of api/ (hand-rolled HTTP/JSON layer)
```

The two frontends are exact peers: same deployed backend, same spec, same
copied tokens. Neither hosts the backend; neither is privileged. If Typebase
refuses to run outside a host app's folder, wrap it in the thinnest possible
shell — and record the friction as a finding, since it prices the real
migration's `apps/api` shape.

Build order:

1. **Day 1 AM — backend (Codex capable):** standalone `api/` — schema +
   actions + better-auth, deployed to a scratch Railway service with its own
   Postgres, smoke-tested with curl before any UI exists.
2. **Day 1 PM — Svelte client (Z.AI capable):** full spec above, generated
   TS client pointed at the deployed api — whether client generation works
   cleanly against a separate deployment is itself a finding. `tokens.css`
   copied from `webapp/src/styles/` (copied, not imported).
3. **Day 2 AM — Imba client (Gemini capable):** same spec, same deployed
   backend, hand-rolled fetch layer, same copied tokens.
4. **Day 2 PM — report + contract-export probe (Z.AI fast):** write the
   comparison report; then, if time allows, try exporting a machine-readable
   contract (OpenAPI or JSON Schema) from the actions and generating the
   Imba fetch layer from it — the cheapest way to close the non-TS client
   gap, and a candidate pattern for the real migration's `packages/contract`.

Dispatch follows the goal set's cross-family rules; reviews run the
`code-review` skill with lint gates inside the spike workspace.

## Report card (the deliverable)

`docs/plans/spike-link-garden-report.md`, answering explicitly:

1. Multi-client reality — did the second client need any backend change?
   CORS/cookie friction? How were endpoints discovered without the TS client?
2. The Imba delta — what the generated client provides in Svelte (types,
   invalidation, error handling) vs what had to be hand-rolled in Imba, in
   hours and lines. Would a shared OpenAPI/JSON schema have closed the gap?
3. Head-to-head — time to feature parity, LOC by layer, bundle size,
   optimistic-update ergonomics, dev-loop/refresh speed, honest preference.
4. better-auth greenfield taste — friction, schema, session shape.
5. Standalone operation — did the backend-as-a-folder framework run as its
   own service naturally, awkwardly, or only inside a host app? (Answered by
   construction on day 1; priced into F7.)
6. Verdict inputs for F7, plus an escape-hatch realism score: if Svelte is
   replaced by Imba (or Gleam/Lustre) in year two, what actually gets
   rewritten?

## Non-goals

No production data, no Wasp contact, no `.env` sharing with the main app,
no polish beyond the spec, no retention — the spike is deleted or archived
after the report. Design fidelity to ActionAmp is limited to shape (capture
→ triage, tokens, keys); it is not a product prototype.
