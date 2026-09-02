# Platform Switch — Project Home

> The one place for the roadmap, current status, and how work is organized
> for moving ActionAmp off Wasp. Everything else is an artifact linked below;
> this page is the cockpit. **Any agent that lands work updates §Status
> before finishing its turn.** Last updated: 2026-09-01 (subagent parallel
> execution: all 15 P0 parity pre-studies + auth pre-study landed; F4a/F8a/F9a
> in flight under cross-review).

## Artifacts — what owns what

| Artifact | Owns |
|---|---|
| [`migration-goal.md`](migration-goal.md) | The goal: what "done" means — full parity, confirmed by the migrated + extended test suite |
| [`2026-08-31-platform-switch-v3.md`](2026-08-31-platform-switch-v3.md) | Strategy: premises, invariants I1–I5, milestones M1–M5, the switch-day runbook |
| [`2026-08-31-platform-switch-goals.md`](2026-08-31-platform-switch-goals.md) | Execution: every goal (F/S/V) with deps + done-conditions; model dispatch + cross-family review |
| [`2026-08-31-spike-link-garden.md`](2026-08-31-spike-link-garden.md) | The 2-day Typebase × Svelte-vs-Imba spike |
| v1 / v2 (same folder) | Superseded history — never execute from these |

## Roadmap

Order is fixed; within a stage, goals parallelize per the goal set.

```text
☐ Stage 0 — Link garden spike (2d)          → spike report
/Gate      — Jake reads the report, ok to proceed
☐ Stage 1 — Foundation F1–F11 (~1.5 wk)     → framework decision F7 (Jake approves)
☐ Stage 2 — Core loop S1–S4 (~2 wk)
☐ Stage 3 — Structure S5–S9
☐ Stage 4 — Account & platform S10–S15
☐ Stage 5 — Money & admin S16–S18
☐ Stage 6 — Verify & switch V1–V4 (Jake present on switch day)
☐ Stage 7 — Cleanup V5 (Jake approves deletion) · optional V6 Neon (separate)
```

## Status

| Goal | State | Notes |
|---|---|---|
| Planning (plan v3, goal set, spike design) | ✅ done | docs/plans/, commits `5e706fc`…`fb3ef2c` |
| F1 monorepo skeleton | ✅ pass | `2fc2a88` · gates re-verified |
| **Link garden spike — COMPLETE** | ✅ **ready for Jake's review** | all three apps built + browser-verified by ZCode; report: `docs/plans/spike-link-garden-report.md` |
| F2/F3 (staging, introspection) | ✗ dropped | 2026-09-01: Jake — local only, no multi-environment machinery |
| **Process change** | — | 2026-09-01: ZCode executes everything locally; no agent ferrying; Jake reviews once at the end |
| Ports (all local) | — | API `:8080` · Svelte `:5174` (5173 belongs to another project) · Imba `:3131` |
| **Framework decision** | ✅ 2026-09-01 | Jake: **Svelte + Hono + oRPC + Drizzle + Bun** — spike report read; F5–F7 resolved (Jake gate #2 done) |
| Workspace deps for new stack | ✅ `ff6339b` | hono+orpc (api), svelte 5 kit (web), drizzle 0.45 (domain), zod (contract); bun isolated linker; root scripts → bun filters |
| P0 parity pre-studies (all slices) | ✅ 2026-09-01 | 15 note sets in `packages/contract/src/s*/README.md` — routes, ops, keys, edge cases, e2e inventory per surface (feeds every slice's P0) |
| Auth pre-study (feeds F10) | ✅ 2026-09-01 | `docs/plans/auth-compatibility-notes.md` — cookie `wasp_session`, sessions unhashed (exact-match `Session.id`), PAT = SHA-256 hex of `aa_…`, expiry side effects to replicate |
| F4 domain pilot | ✅ COMPLETE | F4a `2bfc80c` · F4b `29911c5` · F4c `cbd8c54` — all reviewed; seam + port recipe in `packages/domain/README.md`; tests 54/54 under `bunx --bun vitest` (Node lacks Temporal) |
| F8 api skeleton | ✅ COMPLETE | F8a `6eac663` · F8b `7dcc577` — oRPC at /rpc over domain cores, contract typed client live in Svelte, /ready db ping, localhost-only seed; error-log gap in oRPC 500s flagged for F10 |
| F9a+F9b web shell + mock client | ✅ `193a462` | both reviewed PASS — now on the REAL client since F8b |
| P0 parity pre-studies (all slices) | ✅ `8730024` | cross-reviewed: ~200 claims fact-checked vs sources, 2 fixes |
| F10 auth validation | ✅ `0a3c175` | adversarially reviewed — session/PAT/CSRF/dev-routes + 38 tests; seed-session helper is the e2e login |
| F11 e2e harness | ✅ `de9c1ae` | 3-test smoke green; found+fixed the in-browser CSRF gap (SPA client sends x-requested-with); global-setup re-seeds fixtures |
| **S1+S4 What Now/Focus/lists** | ✅ `945873a` | reviewed pass-with-fixes — 34 procedures, simpleLists+taskExtras ports; daily loop usable |
| **S2+S3 Capture/Triage** | ✅ `325aec9` | reviewed pass-with-fixes — parser byte-verbatim (66/66), wizard keymap faithful |
| **S5+S6 Projects/Goals** | ✅ `63e9bc7` | reviewed pass-with-fixes — deleteGoal corrected (webapp bug not ported), 402 copy byte-exact |
| Wave-1 integration | ✅ `ffc9fff` | fragment composition, seam extensions, deterministic e2e seeds; 21 passed + 1 skipped (S8's), twice |
| **S7+S11 Lenses/Settings** | ✅ `1f68b8e` | reviewed pass — 2 webapp bugs fixed (409s were 500s; lens cap never fired) |
| **S8 Logbook** | ✅ `d1242a3` | reviewed approve — lens-gate gap closed (documented deviation) |
| **S9 Search+Resources** | ✅ `0fd817e` | reviewed pass-with-fixes — real fuse.js swapped in at integration |
| Wave-2 integration | ✅ `c3da0d3` | LensSwitcher/palette/capture shell mounts, theme fallback, fixme un-skipped; 38 e2e passed twice, zero skipped |
| **S10 Auth issuance** | ✅ dd45476 | adversarial pass — fail-open localhost-code hole FIXED (prod never gets 111111); Wasp-format issuance proven at row level |
| **S12+S14 Push/PWA + reminder** | ✅ 7e7328e | reviewed pass — SW/manifest byte-identical, share CSRF exception approved (Lax), atomic claim-before-send |
| **S13+S15 Onboarding + public** | ✅ d7366bc | reviewed pass-with-fixes — public endpoints byte-exact; bootstrap 500 fixed (webapp has the same hole) |
| Wave-3 integration | ✅ 9dda9cb | **INCIDENT: stash-pop from a pre-session branch applied old webapp WIP to webapp/ — I1 restored byte-clean same day; the WIP remains safely in stash@{0} (fix/today-badge-lens-scoping) for its owner**. Gates: domain 364/364, api 112/112, e2e 60/60 twice |
| **S16 Billing** | ✅ 6c097aa | reviewed pass, zero defects — webhooks verbatim + idempotent, live signed probe (FOUNDER flip + replay), test-mode only |
| **S17 Admin** | ✅ d7728a2 | reviewed approved — zero-reads-on-denial spy-pinned, deletion semantics pinned at the DB level |
| **S18 CLI conformance** | ✅ 39178be | reviewed approved — REAL unmodified CLIs ran the full surface vs the new API; 57-test conformance suite |
| Wave-4 integration | ✅ | 75/75 e2e twice (billing spec live on test-mode Stripe env); api 209/209; domain 454/454 |
| **BUILD COMPLETE — all S-goals landed** | ✅ | every slice P0→P5 with cross-review; suite: 454 domain + 209 api + 75 e2e |
| V1 parity run | ▶ next | restore a fresh prod pg_dump locally, then full suites green twice — **needs the dump (Jake/Railway)** |
| V2 rehearsal → V3 switch kit | ☐ after V1 | runbook dry run + flip/verify scripts, announcement draft, rollback one-pager |
| V4 switch day | ☐ | WITH JAKE (quiet hour) — gates #4 |
| V5 cleanup · V6 Neon (optional) | ☐ | after V4 + 2–4 wks; Jake approves deletion (gates #5) |
| Remaining S/V goals | ☐ | P0 notes ready for every slice; port order per goal set |

Blockers: none. Jake gates still open: V2 rehearsal attendance, V4 switch-day
presence, V5 deletion approval. (Spike gate and F7 framework gate are done.)

State marks: ☐ not started · ▶ in progress (add agent + worktree) · ✅ done
(add commit).

## How work is organized

**The loop — how a piece of work travels.**

1. **Dispatch:** Jake pastes the next dispatch file into the agent named in
   its header. Files for the spike live in `spikes/link-garden/dispatch/`;
   each later goal gets files in `docs/plans/dispatch/`. Filenames and
   headers carry the target model — no ambiguity.
2. **Land:** the agent works only inside its declared directory, commits to
   `main` with the goal prefix, and writes its notes file.
3. **Review:** cross-family, always. For Codex/Gemini work: hand it to ZCode
   in this workspace (standing reviewer) or paste `REVIEW-TEMPLATE.md` to
   the paired family per its table. For Z.AI-authored work: Jake ferries the
   review to Gemini or Codex.
4. **Advance:** ZCode updates §Status, marks the goal ✅ with its commit,
   and writes the dispatch files for whatever the goal unblocks.
5. **Gates:** Jake's five decisions (below) — everything else flows.

Standing roles: **Jake** ferries files, unblocks credentials (Railway, API
keys), and decides the gates. **ZCode** keeps this page true, writes the
dispatch files, reviews and integrates landings, and authors the
Z.AI-targeted goals. **pi** stays available for ZCode to run agents
headlessly when Jake would rather not ferry
(`pi --provider <p> --model <m> -p @<file>`), with the codex CLI and herdr
as fallbacks — but the ferry loop is the default because it needs zero
setup.

**Dispatch.** Goal-by-goal author/reviewer tiers live in the goal set's
dispatch tables. The two invariants bind everything: the family that wrote a
piece never reviews it, and silent-failure surfaces (auth, billing, port
pattern, schema audit, service worker, Wave 5) get capable authorship *and*
capable cross-family review.

**Mechanics.** Parallel work happens in dev worktrees
(`docs/DEV-WORKTREES.md`), max 3 concurrent, landing on `main` via
`worktree-sync.sh` only after review passes. Reviews load the `code-review`
skill, run lint/typecheck/tests, and check the goal's done-conditions
verbatim; the reviewer continues into fixes per `AGENTS.md`.

**Rules that bind every goal** (details in v3): `webapp/` is never modified ·
single backend — nothing under `apps/` touches production until V4 · zero
schema changes before the switch · parity, not redesign · snapshot before any
prod-touching operation.

**Progress recording.** A goal is done when its done-conditions are verified
by the reviewer and landed on `main`; the landing agent marks it ✅ here with
the commit hash. Escalations (two failed review rounds, gate decisions,
anything ambiguous) go to Jake.

## Human gates (Jake)

1. Spike report read → green-light the F goals.
2. F7 framework decision — approval.
3. V2 rehearsal — attendance.
4. V4 switch day — presence (quiet hour, ~half a day).
5. V5 cleanup — approval to delete Wasp, `webapp/`, Prisma.
