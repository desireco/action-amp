# ActionAmp Platform Transition — Plan v2

> Status: proposed. Supersedes
> [`2026-08-31-platform-transition-svelte-typebase.md`](2026-08-31-platform-transition-svelte-typebase.md)
> (v1 + review). Date: 2026-08-31. Owner: Jake, with agents executing phases.

---

## 1. Goals

Wasp solved bootstrapping; it is now the constraint — generated-code opacity,
framework-coupled ops/auth/client, and a debug loop that runs through code
generation. Postgres and Railway are not the problem; they stay.

**Goals (measurable):**

* **G1 — Escape Wasp completely.** By end of Phase 5: no `wasp` CLI, no
  generated server, no Prisma client, no Wasp ops in the runtime path.
* **G2 — Modularity proven in code, not aspiration.** `apps/web` imports only
  `packages/contract`. Swapping the API implementation (Typebase → Hono, or
  Svelte → anything) touches exactly one `apps/` folder.
* **G3 — Production safety.** Zero data-loss and zero billing incidents; every
  traffic cutover reversible in under 10 minutes until the final retirement;
  the September GTM campaign never waits on this migration.
* **G4 — Simpler to maintain.** The whole app is readable as
  `apps/web + apps/api + packages/domain` — no generated-code archaeology.
* **G5 — Port business logic, don't rewrite it.** The 13 existing
  `operationsCore.ts` files move into `packages/domain` with their tests.

**Non-goals:** no UX redesign (behavior parity per `docs/INTERACTION.md`), no
schema redesign, no product features bundled into migration work, no database
move (Neon is a separate project, Phase 6).

---

## 2. Target architecture and the contract rule

```text
apps/web        SvelteKit — routing, rendering, interaction
   │  imports ONLY packages/contract
packages/contract   request/response types + typed client
   │
apps/api        Typebase or Hono (Phase 0 decides) on Bun
   │  calls ONLY packages/domain for logic
packages/domain     the 13 operationsCore files, pure, I/O-free
   │
Drizzle → PostgreSQL (Railway) → later Neon
```

The one structural rule v1 stated but never operationalized: the escape
hatches become **package boundaries**. `packages/domain` is pure TypeScript
(already true today — these files are shared by Wasp ops and `/api/cli/*`
routes). `packages/contract` is the only thing the frontend sees. Whatever
framework sits in `apps/api` is an implementation detail.

**Decisions kept from v1:** SvelteKit, Bun, Railway, Postgres-first /
Neon-last, incremental strangler migration.

**Decisions reopened in v2:**

| Decision | v1 | v2 |
|---|---|---|
| API layer | Typebase, Hono as fallback | Phase 0 bake-off: Typebase vs Hono/oRPC control arm; hard gates decide |
| Auth | "bootstrap" listed as first migrated feature | Read-only session **bridge** during migration; issuance only at Phase 5 |
| CLI surface | not mentioned | Phase 3 — the first real-traffic cutover |
| Tailwind | in the stack | off by default; existing `tokens.css` + scoped styles carry the design system |
| Frontend boundary | prose rule | enforced by package imports (G2) |

---

## 3. Ground rules (invariants for the entire transition)

* **R1 — One system of record per surface.** Wasp owns every surface until
  that surface's cutover completes. No dual-writing of business state.
* **R2 — Prisma owns the schema** until the Phase 5 handover. Every Prisma
  migration is followed by a `drizzle-kit pull` regen; a CI drift check fails
  red on any drift.
* **R3 — Writes widen gradually.** The new backend uses a read-only DB role
  until Phase 2's dogfood; blast radius grows one step per phase (see §4).
* **R4 — Every cutover is a routing flip** with a documented revert that
  stays possible until 2 weeks of stable production.
* **R5 — New features land once.** During the window, a feature goes to
  whichever stack owns that surface — never both.
* **R6 — Same-day snapshot before any first-write milestone**
  (`pg_dump`, restorable).
* **R7 — Parkable and abortable.** The plan can pause at any phase boundary;
  a full abort back to Wasp stays available until the Phase 5 domain flip.
* **R8 — Port behavior, don't redesign.** Parity per `docs/INTERACTION.md`
  and the existing Playwright suite; redesign happens later, on the new
  stack, as normal product work.

---

## 4. Phase overview

Effort in **focused days** (one person-day with agent support, no context
switching). Calendar time is longer — see the gate column.

| Phase | Outcome | Blast radius | Est. | Gate to start |
|---|---|---|---|---|
| **P0** Spike & API decision | decision doc, RO spike service on Railway | none | 3–4 | this plan approved |
| **P1** Backend skeleton & auth bridge | contract + domain + session bridge serving read-only endpoints | none | 4–6 | P0 decision |
| **P2** Svelte slice (What Now + Focus) & dogfood | Jake's daily driver on `next.` subdomain | Jake only | 5–8 | P1 exit + campaign steady |
| **P3** CLI cutover | `/api/cli/*` on the new backend — first real traffic | CLI users (≈ Jake) | 2–4 | P2 dogfood ≥ 1 week green |
| **P4** Surface waves W1–W5 | all product surfaces migrated, per-surface flips | all users, per surface | 26–41 | P3 green |
| **P5** Auth cutover, domain flip, Wasp retirement | Wasp deleted | all users | 5–8 | P4 done + checklist |
| **P6** Postgres → Neon | DB moved (separate project) | all | 2–3 | ≥ 1 month stable after P5 |

**Write-access ladder** (R3 made concrete):

| Phase | DB role | Who can reach the new backend |
|---|---|---|
| P0–P1 | read-only (`actionamp_ro`) | nobody (no routed traffic) |
| P2 | read/write | Jake only, via subdomain |
| P3 | read/write | CLI users via `/api/cli/*` route flip |
| P4 | read/write | all users, one surface at a time |
| P5 | read/write | all users, everything |

**Calendar shape (soft):** P0–P1 during September alongside GTM (they touch
nothing user-visible); P2–P3 in October once the campaign is steady; P4
Nov–Dec; P5 January; P6 after. Standing rule: when they conflict, **the
campaign wins and the migration pauses** — never the reverse.

The defining property of this plan: **the work is front-loaded.** P0–P3
builds all the machinery once (contract, domain, auth bridge, routing,
one full slice, first traffic). After that, every P4 wave is mostly UI +
e2e parity over already-ported logic.

---

## 5. Phase details

### Phase 0 — Spike & API-layer decision

**Timebox: one calendar week. If the decision isn't clear at the end, the
default is Hono + oRPC + Drizzle** (boring, proven, and the same Drizzle
foundation either way).

Entry criteria: clean `main`; Railway project access; nothing else.

Work items:

1. Monorepo skeleton — `apps/web`, `apps/api`, `packages/domain`,
   `packages/contract`, npm workspaces. Existing `webapp/`, `cli/`,
   `admin-cli/` untouched.
2. Read-only DB role `actionamp_ro` on Railway Postgres.
3. Snapshot tooling — `scripts/db/snapshot.sh`: `pg_dump` prod → restore to a
   local copy; re-run before every later phase.
4. `drizzle-kit pull` against the snapshot. Diff against
   `webapp/schema.prisma` and record every mismatch — with special attention
   to Prisma **client-side** defaults (`uuid()`/`cuid()`, `updatedAt`) which
   introspection cannot see, and `timestamp(3)` precision.
5. Extract `webapp/src/tasks/operationsCore.ts` + one more core into
   `packages/domain` verbatim; their vitest suites run green there.
   (Webapp keeps its copies until P5 — temporary duplication, deliberate.)
6. **Typebase arm:** `tasks.list` + one write action against the local
   snapshot; generated client; run under Bun; deploy as an isolated Railway
   service pointed at the RO role; verify logs and error visibility.
7. **Control arm:** the same two endpoints in Hono + Drizzle (~half a day) —
   calibration, not competition for its own sake.
8. Drift-check script — regen + `git diff --exit-code`, wired into CI.
9. **Decision doc** (in `docs/plans/`), answering v1's checkpoint questions
   plus the rubric below.

Hard gates (both arms must pass; failure in Typebase = Hono by default):

* Session auth can be implemented as a custom read-only bridge, without
  adopting better-auth's schema.
* Bun runs the server cleanly on Railway.
* Introspected schema is adequate to serve real reads.

Rubric (score each 1–5 in the decision doc): DX/verbosity, typed-client
quality, error-handling fit, understandability of framework code, lock-in
surface, release-cadence risk.

Rollback/park: delete the spike service; prod was never touched.

### Phase 1 — Backend skeleton & auth bridge

Work items:

1. `apps/api` scaffolded per the P0 decision; CI = typecheck + domain tests
   + drift check; deploy as Railway service `actionamp-api-next`.
2. `packages/contract` v1: `user` + `task` surfaces (types + typed client).
3. **Auth bridge v1 (design doc required — `docs/plans/auth-bridge.md`):**
   * Read the Wasp session cookie → look up `Session → Auth → User`,
     read-only. Same for PATs (`ApiKey`) — that part serves P3.
   * **Cookie scope is the first question.** If Wasp's session cookie is
     host-only, subdomain routing (`next.actionamp.com`) will never see it —
     the doc must decide: path-routed proxy on the same host, or a bridge
     endpoint that re-issues the cookie with `Domain=actionamp.com`.
   * CSRF stance for a cookie-authenticated API (SameSite + custom-header
     requirement; no permissive CORS).
   * Dev autologin equivalent of `/login?devEmail=` for agent QA.
4. Structured JSON logging with request IDs; typed error taxonomy mapped to
   contract errors.
5. **Routing mechanics decided and built** — how a path (`/api/cli/*`, later
   per-surface paths) routes to one backend or the other. Options: Cloudflare
   path rule (if CF fronts the domain), a thin Caddy proxy as single entry,
   or DNS/subdomain splits. This must be boring and tested before P3.
6. Smoke endpoints in production (RO): `user.current`, `tasks.list`.

Exit: endpoints live read-only on Railway; Jake's real session validates via
curl; drift CI green; routing flip mechanism proven.

Rollback: delete the service.

### Phase 2 — Svelte vertical slice & dogfood

The slice is **What Now (`/do`) + Focus session + complete task** — the
product's heart, exercising auth, reads, writes, keyboard flow, and the
design system. Capture (NL parsing) is deliberately not in the slice.

Work items:

1. SvelteKit scaffold in `apps/web` (adapter per P0 finding); `tokens.css`
   imported as-is — the design system carries over untouched.
2. Contract client wired; login redirect to the Wasp `/login` page (cookie
   shared per the P1 bridge doc), then back.
3. The slice: optimistic updates, loading/error states, keyboard parity for
   everything in the slice (`docs/INTERACTION.md`), TaskSession accounting.
4. Playwright e2e for the slice, run against the local snapshot.
5. Deploy to the dogfood URL (subdomain or path, per P1's cookie decision).
   Same-day snapshot before first write.

Dogfood protocol: Jake uses the new app for What Now/Focus daily for at
least a week while Wasp handles everything else. Because both stacks share
one database, parity is checked directly against the Wasp view.

Exit: 7 consecutive green days; no data anomalies; design/keyboard parity
reviewed against `docs/DESIGN-SYSTEM.md`.

Rollback: stop using the dogfood URL. Nothing else changes.

### Phase 3 — CLI cutover (first real traffic)

Why the CLI goes first: no UI, `--json` only, PAT auth already bridged, and
its routes are thin wrappers over the same `operationsCore` files — the
highest confidence-to-risk ratio available, and it proves the flip/rollback
mechanics before any user-facing surface depends on them.

Work items:

1. Port the remaining `operationsCore` files into `packages/domain`
   (mechanical — they're pure and already test-covered).
2. Implement `/api/cli/*` in `apps/api`, **path-compatible** so `cli/` and
   `admin-cli/` binaries change by nothing (admin routes can wait for W5;
   auth-gating on `isAdmin` is preserved).
3. Conformance harness: run every CLI command with `--json` against both
   backends (staging), diff outputs. 100% match required.
4. Same-day snapshot; flip the `/api/cli/*` route; watch logs and latency
   for 3 days.

Rollback: revert the route — minutes.

### Phase 4 — Product surface waves

Each surface follows one loop:

```text
domain ops (often already ported) → contract types → Svelte UI
  → e2e ported → flip route → 48h watch → next surface
```

Wasp code for flipped surfaces is **not deleted per flip** — deletion is
batched at P5 so Wasp keeps compiling and rolling back stays trivial.

| Wave | Surfaces | Existing e2e to port | Est. |
|---|---|---|---|
| **W1 Core loop** | Capture (⌘K + NL parse), Inbox / triage, What Now polish, Focus completion | `capture`, `triage`, `triage-dispatch`, `next`, `today` | 8–12 |
| **W2 Structure** | Tasks & lists (Today/Upcoming/Someday + row editors), Projects, Goals, Lenses, Logbook, Search, Resources | `today`, `simple-lists`, `project-detail`, `goal-planning`, `logbook`, `search` | 8–12 |
| **W3 Account & comms** | Settings, Web Push (VAPID keys carry over), PWA share target + manifest, onboarding, email prefs | `login`, `auth-regression` | 5–8 |
| **W4 Money & entitlements** | Pricing, checkout, portal, Stripe webhooks, plan caps | `entitlements` | 3–5 |
| **W5 Admin & ops** | In-app admin dashboard, admin-cli routes, feedback triage | `admin-users` | 2–4 |

Wave-specific rules:

* **W1 is the commitment point.** After W1, most daily sessions could run on
  the new stack — if W1 lands badly, that's the honest moment to reconsider
  (the abort path is still fully open).
* **W3 prepares the PWA takeover:** the service worker plan (versioned SW,
  old SW self-destruct, kill-switch) is designed here, executed at P5.
* **W4 never dual-writes billing state.** Stripe can send webhooks to two
  endpoints — the new receiver runs in **shadow mode** (receives, logs,
  validates signatures, writes nothing) for a week; then the primary flips;
  then the old endpoint is removed. Plus a Stripe test-mode dry run first.
* New features follow R5; exceptions are written down per wave.

### Phase 5 — Auth cutover, domain flip, retirement

1. **Auth issuance design doc.** Default: implement Wasp-compatible session
   issuance (cookie + `Session` row — a simple table) and reproduce the
   passwordless flow (six-digit code + one-time link, Resend directly —
   provider and hashing rules per `docs/EMAIL-INTEGRATION.md`). Alternatives
   (parallel sessions table with a both-validate window; better-auth with a
   data migration) are evaluated but not defaulted to.
2. Port the one scheduled job (`sendDailyTodayReminder`) to a cron in the
   new stack.
3. **Domain flip:** main domain serves SvelteKit; service-worker takeover
   per the W3 plan; Wasp stays warm on `legacy.actionamp.com` for 14 days as
   the rollback.
4. **Schema handover:** final Prisma migration; Drizzle becomes the source
   of truth (`drizzle-kit generate` from here on); the drift check proves
   the handover is clean.
5. Retirement checklist before deleting anything: login/logout, sessions,
   task lifecycle, projects, billing (webhook primary confirmed on the new
   endpoint), email, the cron job, analytics/events, admin workflows, error
   handling, backups, monitoring, dev autologin parity.
6. Delete: Wasp service, `webapp/`, wasp config, Prisma. Update the doc
   cascade (`AGENTS.md`, `docs/ROADMAP.md` §Shipped, feature catalog).

Exit: 14 stable days on the new stack, then the rollback window is closed
deliberately.

### Phase 6 — Postgres → Neon (separate project)

Unchanged from v1, condensed: pooled `DATABASE_URL` swap in a quiet window;
verification checklist (row counts, sequences, indexes, billing references,
timestamps); rollback = repoint the URL. Bonus afterwards: Neon branching
becomes the staging/preview mechanism, replacing snapshot restores.

---

## 6. Cross-cutting workstreams

* **Auth bridge** — design doc at P1; evolves at P3 (PATs live), P5
  (issuance). The single most important document in this plan.
* **Schema ownership** — drift CI from P0; handover ceremony at P5.
* **Testing** — conformance harness (P3, reused at P5), e2e ported per
  surface, snapshot fixtures for local runs, dogfood parity checks.
* **Observability** — structured logs + error tracking verified at P1, before
  any traffic; latency sanity check at every flip.
* **Backups** — Railway PG backups plus R6's same-day `pg_dump` before every
  first-write milestone.

---

## 7. Risk register

| Risk | L | I | Mitigation | Trigger |
|---|---|---|---|---|
| Typebase immaturity (0.1.x, undocumented Bun/Railway path, better-auth mismatch) | H | M | P0 bake-off with Hono control; contract-first makes swap local to `apps/api` | any hard-gate failure → Hono by default |
| Auth bridge complexity (cookie scope, CSRF, session semantics) | M | H | read-only bridge; login stays Wasp until P5; design doc before any traffic | session semantics can't be validated in P1 → dedicated design week before P2 |
| Strangler stall / dual-maintenance fatigue | M | M | front-loaded machinery; wave budgets; park-anywhere; abort stays open | 2 weeks zero migration progress → re-plan or abort cleanly |
| Schema drift during the long window | M | H | R2 + CI drift check | any undetected drift |
| GTM collision | H | M | campaign-steady gate at P2; campaign always wins | campaign needs > migration pauses |
| Data incident | L | H | RO ladder, same-day snapshots, bounded blast radius, reversible flips | — |
| PWA/service-worker breakage at domain flip | M | M | SW plan in W3, takeover at P5, 14-day warm rollback | — |
| Billing breakage | L | H | shadow-receive, test-mode dry run, quiet-window flip | — |
| Solo-founder time slicing stalls everything | M | M | focused-day budgets; phases sized to land complete | — |

---

## 8. Options considered and rejected

* **Big-bang rewrite** — rejected: production continuity + GTM.
* **Backend-only first, keep React** — rejected: Wasp ops *are* the React
  app's data layer; replacing Wasp while keeping React means rewriting every
  query/mutation call site anyway — same cost, and you keep the complexity
  you're trying to escape.
* **Bundling redesign into the port** — rejected (R8): parity first;
  redesign later as normal product work on the new stack.
* **better-auth from day one** — rejected: its schema fights the existing
  auth tables; bridge now, decide issuance at P5.
* **Tailwind** — off by default: `tokens.css` + scoped styles already carry
  the design system and match the "native, not custom" ethos.
* **CLI late (v1's omission)** — inverted: CLI at P3, the cheapest
  real-traffic proof available.
* **Neon early** — rejected: v1's principle stands — never two migrations in
  one debugging problem.

---

## 9. What changed from v1, and why

| v1 | v2 | Why |
|---|---|---|
| Auth listed as the first migrated *feature* | Read-only bridge during migration; issuance only at P5 | Removes the riskiest work from the migration loop; login stays on battle-tested Wasp code |
| Typebase chosen, Hono as fallback | P0 bake-off with a Hono/oRPC control arm and hard gates | v1's own review found Typebase undocumented on Bun/Railway and better-auth-mismatched; decide with data, default to boring |
| "Frontend must not import backend" (prose) | `packages/contract` / `packages/domain` package boundaries | Escape hatches become enforceable structure (G2) |
| Business logic "migrated into actions" | 13 `operationsCore.ts` files move verbatim | They already exist, pure and test-covered — the port is mechanical |
| CLI + admin surface absent | P3 cutover + W5 | `/api/cli/*` must move or both CLIs break at retirement; early = low-risk real traffic |
| Flat 10-item feature list | 5 waves with e2e mappings and budgets | Waves sized so each ends in a stable, parkable state |
| No rollback thinking | Every phase has a revert; flips are routing changes; 14-day warm rollback at P5 | Reversibility is the whole game in a strangler migration |
| No timing | Campaign-steady gate; calendar shape; campaign always wins | GTM September is the business; migration is infrastructure |
| Prisma-defaults gotcha unmentioned | Explicit P0 deliverable (drift report incl. client-side defaults) | Silent data corruption otherwise |
| No estimates | Focused-day budgets per phase | Honest sizing for a solo founder slicing time |

---

## 10. The immediate backlog (replaces v1 §8)

Phase 0, work items 1–9 above. Timebox one week, read-only everywhere,
deliverable is the decision doc. Nothing in P0 can affect production, the
campaign, or the existing app.
