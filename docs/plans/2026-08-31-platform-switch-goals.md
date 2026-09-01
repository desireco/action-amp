# Platform Switch — Agent Goal Set

> Companion to [`2026-08-31-platform-switch-v3.md`](2026-08-31-platform-switch-v3.md).
> Every goal is self-contained: outcome, dependencies, done-conditions,
> verification. Hand one goal per agent. IDs (F/S/V) are stable — reference
> them in commits and board items. Date: 2026-08-31.

---

## How to dispatch

**Rules that bind every goal:**

1. **`webapp/` is never modified.** If a goal seems to need it, stop and
   escalate. Abort of the whole program = delete `apps/` + `packages/`.
2. **Single backend.** Nothing under `apps/` ever connects to the production
   database. All work runs against the staging snapshot; production is
   touched exactly once — by V4, the switch.
3. **Parallel agents work in dev worktrees** (`docs/DEV-WORKTREES.md`,
   `webapp/scripts/dev-worktree.sh`), land via `worktree-sync.sh`, commit to
   `main` focused-per-concern.
4. **Verification is part of every done-condition:** domain work = unit
   tests green; UI work = the surface's e2e spec ported and green against
   staging; everything = typecheck + `npm run lint` clean.
5. **Merge discipline for shared packages:** one surface = one contract
   file; `entities`-slice additions to `packages/domain/db` are centralized
   in that goal's PR and pulled before the next slice syncs.

**Dependency map** (arrows mean "blocks"):

```text
F1 skeleton ──┬── F4 domain pilot ──┬── F5 Typebase arm ─┐
              │                     └── F6 Hono arm ─────┴── F7 decision
F2 snapshot/staging ── F3 introspection ─────────────────────┤
F9 web shell (mock client) ─────────────────────────────────  F8 api skeleton ── F10 auth validation
                                                             │        └────────── F11 e2e harness
                                                             ▼
   WAVE 1 (core loop, 2 agents): S1+S4 | S2+S3
   WAVE 2 (structure, 2–3 agents): S5+S7 | S6+S8 | S9
   WAVE 3 (account/platform, 2 agents): S10+S13 | S11+S12, S14, S15
   WAVE 4 (money/admin, 1–2 agents): S16 | S17+S18
   WAVE 5: V1 parity → V2 rehearsal → V3 switch kit → V4 SWITCH → V5 cleanup
```

**Critical path:** F1→F2/F3→F4→F5/F6→F7→F8→F10→F11→Wave 1→V1→V2→V4.
F9 and Wave 3's S11/S13 can start early off the mock client.

**Realistic parallelism: 3 agents** (2 full-stack slices + 1
infra/platform). More than that collides in `packages/contract` and
`packages/domain`.

---

## Wave 0 — Foundation

### F1 — Monorepo skeleton + CI · deps: none · 0.5–1d

Outcome: `apps/web`, `apps/api`, `packages/domain`, `packages/contract` as
npm workspaces; root scripts (`dev`, `build`, `test`, `lint`, `typecheck`).

Done when: fresh clone → `npm install && npm test && npm run typecheck`
green; CI runs on `main` covering the new packages only; the diff touches
nothing outside the new folders + root config.

### F2 — Snapshot + staging environment · deps: none · 1d

Outcome: `scripts/db/snapshot.sh` (pg_dump production — run by Jake or with
his creds) and `scripts/db/restore-staging.sh` (refresh the staging Postgres
from the snapshot); a staging Postgres instance provisioned (Railway second
service or local), with its URL documented as the only `DATABASE_URL` the
new stack ever uses.

Done when: snapshot→restore→`apps/api` (once it exists) connects round-trip
documented in the script headers; restore is idempotent (drops + recreates).

### F3 — Introspection + schema diff report · deps: F2 · 1d

Outcome: `drizzle-kit pull` against the restored staging DB; generated
schema committed under `apps/api/db/schema`; report at
`docs/plans/introspection-report.md`.

Done when: report covers every table, enum, FK, index, unique constraint,
and default vs `webapp/schema.prisma`; it explicitly lists (a) columns whose
defaults live only in the Prisma **client** (`uuid()`, `cuid()`,
`updatedAt`) and must be supplied by the domain layer on insert, and (b)
type mappings to watch (`timestamp(3)`, enums, JSON columns). This report is
the contract for F4's data-access layer.

### F4 — Domain pilot: tasks core + the port pattern · deps: F1, F3 · 2d

**The highest-leverage goal in the set — it fixes the pattern all 13 ports
follow.**

The cores are not I/O-free: each takes a Prisma-shaped `entities` object as
its first argument and does DB work inside; their tests mock that seam
(`mockContext`). The port pattern to establish:

- Move the core into `packages/domain/<feature>/` with **signatures, args,
  and return shapes unchanged** (tests port nearly verbatim).
- Replace `@prisma/client` type imports with domain-owned types (generated
  from the F3 schema).
- Introduce `packages/domain/db/` — a thin data-access layer exposing the
  **same entity-method surface the core actually uses**
  (`Task.findMany`, `TaskSession.create`, …), implemented over Drizzle.
  Inventory the used query surface first (which methods × which where/
  include shapes); implement exactly that, no more.

Done when: `tasks/operationsCore.ts` (1,014 lines — the largest core) and
its deps (`activePool`, `billing/entitlements`, temporal helpers) run in
`packages/domain` with `operationsCore.test.ts` + `activePool.test.ts`
ported and green against mocked entities; the pattern is written up in
`packages/domain/README.md` (rules + how to add entity-slice methods);
lint/typecheck green.

### F5 — Spike: Typebase arm · deps: F3, F4 · 1d
### F6 — Spike: Hono control arm · deps: F3, F4 · 1d — parallel with F5

Outcome per arm: `tasks.list` + one write over the ported tasks core,
against staging; generated/typed client (Typebase) or oRPC client (Hono);
running under Bun locally; one throwaway Railway deploy pointed at staging.

Done when: both endpoints work; notes recorded for the F7 rubric on DX,
typed-client quality, error handling, logging visibility, deploy friction,
and how naturally the custom Wasp-compatible auth (not better-auth) fits.

### F7 — Framework decision doc · deps: F5, F6 · 0.5d

Done when: `docs/plans/framework-decision.md` answers v1's checkpoint
questions + scores the rubric; hard gates evaluated (custom auth possible,
Bun clean on Railway, schema adequate); the framework is chosen. Default on
any tie or gate failure: **Hono + oRPC + Drizzle**.

### F8 — `apps/api` skeleton · deps: F7 (parallel: F9) · 1–2d

Outcome: chosen framework scaffolded; typed error taxonomy mapped to
contract error codes; JSON logging with request IDs; `/health`, `/ready`;
`tasks.list` served over the domain package; CI; deployed to a Railway
staging service.

Done when: staging URL serves `tasks.list` for a seeded user; logs show a
request end-to-end; deploy is one command and documented.

### F9 — Web shell with mock client · deps: F1 only · 2d — parallel with F4–F8

Outcome: SvelteKit scaffold in `apps/web`; `tokens.css` imported as-is
(light/dark both work); app shell per `docs/INTERACTION.md` (modal
navigation, keyboard-first chrome); the contract client wired behind a
**mock transport** so screens can be built before the API exists.

Done when: shell renders with mocked data on the dev server; keyboard
navigation works; no import from anything outside `packages/contract` (mock
lives in `apps/web/lib/api/mock.ts`).

### F10 — Auth validation (Wasp-compatible) · deps: F8 · 2d

Outcome: the new backend authenticates **existing-format** credentials
against the staging DB: session cookie → `Session → Auth → User` lookup;
PAT → `ApiKey` lookup (serves S18 later). Plus: a session-seeding helper
(INSERT a `Session` row — this is how e2e and staging dogfood log in), a
dev-only autologin equivalent of `/login?devEmail=`, and the CSRF stance
(SameSite + custom header on writes, no permissive CORS).

Done when: a real Wasp session cookie (captured once from the current app,
format documented) authenticates on staging; the seed helper mints sessions
e2e can use; tests cover expired/absent/invalid cookies. **This goal is the
switch's superpower: nobody re-logs-in on switch day.**

### F11 — E2E harness · deps: F8, F9, F10 · 1–2d

Outcome: Playwright config against staging; `webapp/e2e/` helpers ported
(`global-setup/teardown`, `helpers.ts`) with login replaced by the F10 seed
helper; dark-mode/screenshot helpers.

Done when: one example spec runs green end-to-end against staging from a
clean snapshot restore.

---

## Waves 1–4 — Surface slices

Every slice goal has the same done-shape, so it's stated once:

> **Slice done =** contract file for the surface in `packages/contract` ·
> endpoints over the ported domain core in `apps/api` (entity-slice
> additions centralized per merge rule 5) · Svelte screens in `apps/web`
> styled from `tokens.css` with keyboard parity per `docs/INTERACTION.md` ·
> behavior parity with the Wasp implementation (read the listed e2e spec —
> port it and make it green) · unit + e2e + lint + typecheck green.

**Surface reference map** (read these before starting a slice):

| Surface | Domain core | Wasp implementation | e2e spec to port | Key docs |
|---|---|---|---|---|
| S1 What Now + Focus | `tasks` (+TaskSession) | `src/app/` What Now | `next.spec` | `WORKFLOW.md` §2.3, §5 |
| S2 Capture + NL parse | `inbox` + parser | `src/app/` capture | `capture.spec` | `WORKFLOW.md` §2.1, `features/capture.md` |
| S3 Inbox / triage | `inbox` | `src/inbox/`, `src/app/` triage | `triage.spec`, `triage-dispatch.spec` | `TRIAGE.md` |
| S4 Tasks & lists | `tasks`, `simpleLists` | `src/tasks/`, `src/lists/` | `today.spec`, `simple-lists.spec` | `WORKFLOW.md`, `INTERACTION.md` |
| S5 Projects | `projects` | `src/projects/` | `project-detail.spec` | `WORKFLOW.md` |
| S6 Goals | `goals` | `src/goals/` | `goal-planning.spec` | `WORKFLOW.md` |
| S7 Lenses / areas | `lenses` | lens scoping across pages | — | `WORKFLOW.md` (Lens scoping) |
| S8 Logbook | `logbook` | `src/logbook/` | `logbook.spec` | — |
| S9 Search + Resources | `search`, `resources` | `src/search/`, `src/resources/` | `search.spec` | — |
| S10 Auth pages + issuance | — | `src/auth/` | `login.spec`, `auth-regression.spec` | `EMAIL-INTEGRATION.md` |
| S11 Settings / account | — | `src/app/` settings | — | — |
| S12 Push + PWA/share | — | `src/share/`, push | — | `features/pwa-notifications.md` |
| S13 Onboarding | — | `src/onboarding/` | — | — |
| S14 Emails + cron | — | Wasp emailSender, `sendDailyTodayReminder` | — | `EMAIL-INTEGRATION.md` |
| S15 Public/landing | — | `src/public/`, `src/landing/` | — | `PUBLIC-PAGES.md` |
| S16 Billing + entitlements | `billing/entitlements` | `src/billing/` | `entitlements.spec` | `BILLING-INTEGRATION.md` |
| S17 Admin dashboard + routes | `admin`, `feedback` | `src/admin/` | `admin-users.spec` | admin-dashboard spec |
| S18 CLI `/api/cli/*` | all cores | `src/auth/patRoutes.ts` | conformance harness | `cli/README.md` |

### Wave 1 — Core loop (2 agents, after F8–F11)

- **Agent A: S1 (What Now + Focus) then S4 (Tasks & lists).** Same domain
  core and contract files — one agent avoids the worst merge contention.
  Include row editors, When semantics, due-chip rules (behavior parity:
  port the specs, don't re-judge design).
- **Agent B: S2 (Capture + NL parser — the parser is pure, port with its
  tests) then S3 (Inbox/triage keymap per `TRIAGE.md`).**

### Wave 2 — Structure (2–3 agents, after Wave 1 contracts settle)

- **Agent C: S5 (Projects), then S7 (Lenses)** — lenses cut across surfaces,
  so they land after Wave 1's contracts stabilize.
- **Agent D: S6 (Goals), then S8 (Logbook).**
- **S9 (Search + Resources)** is read-heavy and low-risk — first free agent
  picks it up.

### Wave 3 — Account & platform (2 agents; S11/S13 can start after F9+F10)

- **Agent E: S10 (auth pages + issuance)** — passwordless six-digit code +
  one-time link via Resend directly, hashing/expiry/rate limits per
  `EMAIL-INTEGRATION.md`, dev code `111111`, **issuing Wasp-format sessions**
  (same cookie, same `Session` rows — Wasp accepts them unchanged, which the
  rehearsal proves). Then **S13 (Onboarding)**.
- **Agent F: S11 (Settings/account), then S12 (push + PWA/share target)**
  — VAPID keys carried over as staging-then-prod env; service-worker
  takeover plan for the domain flip written here, executed at V4. Then
  **S14 (remaining transactional emails + port `sendDailyTodayReminder` to
  a Bun cron)** and **S15 (public/landing — default: port the in-app pages,
  leave marketing on Cloudflare; confirm with Jake).**

### Wave 4 — Money & admin (1–2 agents, after Wave 1)

- **S16 (Billing + entitlements + Stripe webhooks)** — endpoints and portal
  flows over the ported `billing` logic; webhook handler verified against
  Stripe test-mode events; never dual-write (irrelevant here anyway — the
  handler goes live only at V4).
- **S17 (Admin dashboard + admin routes)** — `isAdmin` gating preserved.
- **S18 (CLI `/api/cli/*`)** — reimplement path-compatible under PAT auth
  (F10); both CLIs' binaries unchanged; **conformance harness**: run every
  `cli/` and `admin-cli/` command with `--json` against Wasp (dev) and the
  new backend (staging snapshot), diff outputs, 100% match required.

---

## Wave 5 — Verification & switch

### V1 — Full parity run · deps: all slices · 2–3d

Refresh the staging snapshot from production; run the entire ported e2e
suite + unit suites; fix gaps (budget: this goal includes the fixes). Done
when: the whole suite is green on a fresh restore, twice in a row.

### V2 — Rehearsal · deps: V1, S10, S12, S14 · 1–2d

Execute the v3 §6 runbook end-to-end **against staging/scratch infra**:
freeze-sim, backup (of staging), flip a scratch domain to the new stack,
Stripe test-mode webhook delivered to the new URL, verification checklist,
rollback drill, all timed. Done when: every step is timed, the rollback
works, and the timings feed the V4 go/no-go.

### V3 — Switch kit · deps: V2 · 1d

The scripts and documents V4 runs from: freeze/backup/flip/verify script
skeletons, the announcement email draft (honest, calm — see `PRODUCT.md`
tone), the rollback one-pager with trigger conditions, the user comms list.

### V4 — Switch day · deps: V3 + Jake · 0.5–1d

Execute the v3 §6 runbook on production. Preconditions and rollback are
defined there. Jake + one agent, in a quiet hour.

### V5 — Cleanup + schema handover · start 2–4 weeks after V4 · 2–3d

Wasp stopped-but-startable immediately, deleted at the end of the window
along with `webapp/` and Prisma; **first Drizzle migration happens now** —
Drizzle becomes the source of truth; doc cascade updated (`AGENTS.md`,
`docs/ROADMAP.md` §Shipped, feature catalog, this goal set marked done).

### V6 — Postgres → Neon · optional, separate project · 2–3d

Per v3 §5 P3: pooled `DATABASE_URL` swap in a quiet window, verification
checklist, rollback = repoint the URL. Only after V5.

---

## Parallelism summary

| With | Elapsed (part-time) |
|---|---|
| Serial (Jake + 1 agent) | ~8–10 weeks |
| 3 agents (recommended) | ~4–6 weeks: Wave 0 ≈ 1.5 wk, Waves 1–2 ≈ 2 wk, Waves 3–4 ≈ 1–1.5 wk, Wave 5 ≈ 1 wk |

Total estimated effort ≈ 30–40 focused days — the same rebuild v3 sized,
now with the idle time parallelized. The rebuild itself is irreducible;
what parallelism removes is calendar.
