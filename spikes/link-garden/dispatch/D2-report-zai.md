# DISPATCH — Link Garden comparison report

**TARGET MODEL: Z.AI (capable tier) — author**
Goal: spike D2-PM · Timebox: 2 hours · Repo: action-amp root
Precondition: all three notes files exist under `spikes/link-garden/notes/`
(`api-notes.md`, `svelte-notes.md`, `imba-notes.md`) and both clients work.

## Task

Write `docs/plans/spike-link-garden-report.md` answering, with evidence from
the three notes files and the code:

1. **Multi-client reality** — did the second client require any backend
   change? CORS/auth friction? How were endpoints consumed without the TS
   client?
2. **The Imba delta** — what the generated client provides in Svelte vs what
   was hand-rolled in Imba, in hours and lines; would a shared
   OpenAPI/JSON-schema contract have closed the gap?
3. **Head-to-head** — time to parity, LOC by layer, bundle size,
   optimistic-update ergonomics, dev-loop, honest preference.
4. **better-auth greenfield taste** — friction, schema, session shape.
5. **Standalone operation** — did Typebase run as its own service naturally,
   awkwardly, or only inside a host app? (Priced into the F7 decision.)
6. **Verdict inputs + escape-hatch score** — inputs for the F7 framework
   decision; if Svelte were replaced by Imba (or Gleam/Lustre) in year two,
   what actually gets rewritten, scored 1–5 with reasoning.

Style: calm, direct, evidence-first; no hype. End with a one-paragraph
recommendation. Update `docs/plans/PLATFORM-SWITCH.md` §Status afterwards
(spike ✅, report landed, next gate: Jake reads it).

## Constraints

Only create the report, update the home page §Status, and (optionally)
`git mv`-tidy the notes. Never touch code, `webapp/`, or the plan docs.
Commit prefix `spike(link-garden):`.
