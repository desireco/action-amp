# DISPATCH — Link Garden Svelte client

**TARGET MODEL: Z.AI (capable tier) — author**
Goal: spike D1-PM · Timebox: half a day · Repo: action-amp root
Precondition: the backend from `D1-api-codex.md` is deployed — get its URL
and read `spikes/link-garden/notes/api-notes.md` first.

## Read first

1. `AGENTS.md` (repo root).
2. `docs/plans/2026-08-31-spike-link-garden.md` — the spike spec.
3. `spikes/link-garden/notes/api-notes.md` — endpoints and auth shape.

## Scope — build exactly this, nothing more

A Svelte 5 / SvelteKit app at `spikes/link-garden/web-svelte/`, talking to
the deployed backend via **Typebase's generated TypeScript client** pointed
at the remote deployment:

* **Capture:** `⌘K` opens a capture box — paste URL, optional `#tag` tokens.
* **List:** links under status tabs — new / kept / dismissed.
* **Keys:** `j/k` move · `K` keep · `D` dismiss · `T` tag · `⌘K` capture.
* **Tags:** chips on rows; clicking one filters the list to that tag.
* **Optimistic:** status/tag changes apply instantly, roll back on error.
* **Styling:** copy `webapp/src/styles/tokens.css` into the app (**copy the
  file — never import from `webapp/`**) and style with it; light + dark.

## Done when

* Every interaction above works against the deployed backend.
* `spikes/link-garden/notes/svelte-notes.md` records:
  - did client generation work cleanly against a *separate* deployment, or
    did it assume co-location? (headline finding)
  - DX: time to first working screen, friction points, error handling,
  - LOC by layer (components / client glue / styles),
  - anything you'd want from the contract that was missing.

## Constraints

* Only create/modify files under `spikes/link-garden/web-svelte/` and your
  notes file. **Never touch `webapp/`, the backend, or other clients.**
* Commit focused, directly on `main`, prefix `spike(link-garden):`.
* Feature-identical to the spec — no extras, no redesign.
