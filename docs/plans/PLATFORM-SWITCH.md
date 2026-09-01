# Platform Switch — Project Home

> The one place for the roadmap, current status, and how work is organized
> for moving ActionAmp off Wasp. Everything else is an artifact linked below;
> this page is the cockpit. **Any agent that lands work updates §Status
> before finishing its turn.** Last updated: 2026-09-01 (D1-api reviewed
> pass-after-fixes; F1 reviewed pass; next: F2 paste + D1-svelte by ZCode).

## Artifacts — what owns what

| Artifact | Owns |
|---|---|
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
| All other F/S/V goals | ☐ | gated on spike report + Jake's go |

Blockers: none. Open decisions for Jake: none yet (first gate is the spike
report).

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
