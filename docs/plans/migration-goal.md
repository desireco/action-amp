# Migration Goal — the north star

> The one-place statement of what "done" means for the platform switch.
> The docs below say *how*; this file says *what* and *when we'll know*.
> Written 2026-09-01, after the framework decision (Svelte 5 + Hono + oRPC +
> Drizzle + Bun).

## The goal

A fully functional ActionAmp rebuilt on the new stack — the web app in
`web/`, the API in `api/`, with `packages/domain` carrying the
ported business logic and `packages/contract` as the sole API surface —
that **matches the functionality of `webapp/`**.

The new app is **functionally and visually the same** as the current
webapp: same behaviors, same keyboard map, same overlays and modes, same
look (`tokens.css` carries over untouched). Parity, not redesign —
improvements come after the switch, as product work.

## How completion is confirmed

**The test suite is the arbiter.** The existing suite migrates to the new
stack and passes; where the old suite was silent, tests are added:

- the **Playwright e2e specs** (`webapp/e2e/` — 15 spec files covering
  login, capture, triage, today, next/focus, lists, projects, goals,
  logbook, search, entitlements, admin, auth regression) port to the new
  app's harness and are green — twice in a row, against a fresh prod
  snapshot (V1);
- the **Vitest unit tests** (100 `*.test.ts(x)` files, incl. the 13
  `operationsCore` test suites) port alongside their cores, signatures
  unchanged;
- **new tests are written** wherever migration reveals an untested seam —
  the suite that gates the switch must be at least as strong as the one
  that guards `webapp/` today;
- **CLI parity** is diffed, not eyeballed: both CLIs run unchanged against
  the new API and their `--json` outputs match Wasp's 100% (S18);
- **auth continuity** holds: existing Wasp session cookies and CLI PATs
  validate against the new API (F10), so nobody re-logs-in on switch day.

Visual parity is checked side-by-side against `webapp/` per surface
(screens at same breakpoints, tokens, spacing, interaction per
`docs/INTERACTION.md`) before each slice is marked done.

Nothing under `apps/` touches production until the whole bar above is met
(V4 is the single switch — see the v3 runbook).

## Main documents

| Doc | Owns |
|---|---|
| [`PLATFORM-SWITCH.md`](PLATFORM-SWITCH.md) | Project home — status, roadmap, how work is organized |
| [`2026-08-31-platform-switch-v3.md`](2026-08-31-platform-switch-v3.md) | Strategy — invariants I1–I5, milestones, switch-day runbook |
| [`2026-08-31-platform-switch-goals.md`](2026-08-31-platform-switch-goals.md) | Execution — every chunk (F/S/V) with deps + done-conditions |
| [`spike-link-garden-report.md`](spike-link-garden-report.md) | Framework decision evidence |
| [`docs/INTERACTION.md`](../INTERACTION.md) | Functional parity reference — modes, keysets, overlays |
| [`docs/WORKFLOW.md`](../WORKFLOW.md) | Functional parity reference — structure, areas, flows |
| [`docs/DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md) + [`webapp/src/styles/tokens.css`](../../webapp/src/styles/tokens.css) | Visual parity reference |
| [`webapp/e2e/`](../../webapp/e2e/) + unit tests | The suite to migrate |

## What is explicitly *not* part of this goal

Per v3: no schema changes before the switch (I2); `webapp/` is never
modified (I1); no redesign (I4); no staging machinery (dropped 2026-09-01 —
local only); Neon is a separate optional project (V6). Abort at any point =
delete `apps/` + `packages/`, zero cleanup.
