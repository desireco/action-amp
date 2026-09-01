# DISPATCH — Link Garden Imba client

**TARGET MODEL: Gemini (capable tier) — author**
Goal: spike D2-AM · Timebox: half a day · Repo: action-amp root
Precondition: backend deployed + Svelte client exists. Read
`spikes/link-garden/notes/api-notes.md` (endpoint shapes) and skim
`spikes/link-garden/web-svelte/` for the spec's visual baseline.

## Read first

1. `AGENTS.md` (repo root).
2. `docs/plans/2026-08-31-spike-link-garden.md` — the spike spec.
3. `spikes/link-garden/notes/api-notes.md` — raw HTTP endpoints + auth.

## Scope — build exactly this, nothing more

An **Imba** app at `spikes/link-garden/web-imba/`, consuming the **same
deployed backend** with a **hand-rolled HTTP/JSON fetch layer** (no
Typebase-generated client — Imba cannot use the TS client; that gap is the
thing being measured):

* Feature-identical to the Svelte client: `⌘K` capture (URL + `#tags`),
  status tabs (new/kept/dismissed), keys `j/k · K · D · T`, tag chips with
  click-to-filter, optimistic updates with rollback.
* Same styling: copy `tokens.css` the same way (copy, never import from
  `webapp/`); light + dark.
* Same auth flow against the deployed backend.

## Done when

* Every interaction works against the deployed backend.
* `spikes/link-garden/notes/imba-notes.md` records — **this is the headline
  deliverable of the whole spike**:
  - what the hand-rolled fetch layer cost: hours + lines, vs what the Svelte
    side got for free (types, invalidation, error handling),
  - how endpoint shapes were discovered/consumed without generated types,
  - what would have closed the gap (a shared OpenAPI/JSON schema? hand-written
    types? nothing?),
  - DX: dev-loop speed, tags/optimistic ergonomics, honest preference vs
    Svelte,
  - LOC by layer, bundle size vs the Svelte build.

## Constraints

* Only create/modify files under `spikes/link-garden/web-imba/` and your
  notes file. **Never touch `webapp/`, the backend, or the Svelte client.**
* Commit focused, directly on `main`, prefix `spike(link-garden):`.
* Feature-identical — no extras, no redesign.
