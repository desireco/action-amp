# Platform Switch — Goal Set (simplified 2026-09-01)

> Companion to [`2026-08-31-platform-switch-v3.md`](2026-08-31-platform-switch-v3.md).
> Stack decided after the link-garden spike: **Svelte 5 + Hono + oRPC +
> Drizzle + Bun** (report: `spike-link-garden-report.md`). One worker (ZCode),
> all local, Jake reviews at the gates. IDs are stable — reference them in
> commits.

## Working rules (all that remain)

1. `webapp/`, `cli/`, `admin-cli/` are never modified. Abort = delete
   `apps/` + `packages/`.
2. Nothing under `apps/` touches production until V4. Development runs
   against local databases; when real data matters (F4a, V1), restore a
   prod `pg_dump` into a local DB — one command, still local.
3. Every chunk ends green: tests / e2e / typecheck / lint, per its own
   done-line. Commit per chunk with the goal ID.
4. Dev loop: API `bun --hot`, frontends vite; vite dev-proxy (`/api`, `/rpc`)
   is the standard (spike-proven — same-origin cookies, no CORS surface).
5. `bun install`, never npm (crashes on this machine). Ports 5173/3000 are
   taken by other projects; pick quiet ports.

## Path

```text
F1 ✓ → F4a → F4b → F4c → F8a → F8b → F10a → F10b/c → F11
                    └── F9a → F9b (parallel, mock client)
S1 → S4 → S2 → S3 → S5 → S7 → S6 → S8 → S9 → S11 → S12 → S13 → S10 → S14 → S15 → S16 → S17 → S18
V1 → V2 → V3 → V4 (switch, with Jake) → V5 → (V6 optional)
```

Each block below is sized for **one focused sitting** (½–1 day). Tick the
checkboxes in order; park anywhere between blocks.

---

## Foundation

### F1 — Monorepo skeleton ✅ (2026-09-01, `2fc2a88`)

`apps/` + `packages/` workspaces; install/test/typecheck/lint green at root.

### F4 — Domain pilot (the pattern everything copies) — 3 chunks

The 13 `operationsCore.ts` files take a Prisma-shaped `entities` object and
do DB work inside; tests mock that seam. The port keeps signatures and
tests, re-binds the seam to Drizzle.

- [ ] **F4a — Local schema + defaults audit** (½d): `drizzle-kit pull`
  against `actionamp_dev` (read-only) → commit schema under
  `apps/api/db/schema/`; write `docs/plans/introspection-report.md` listing
  every column whose default lives only in the Prisma **client**
  (`uuid()`, `cuid()`, `updatedAt`) — those values become the domain
  layer's job on insert. Done: report + schema committed.
- [ ] **F4b — Entity seam + tasks core port** (1d): `packages/domain/db/`
  implementing exactly the entity-method surface the tasks core uses, over
  Drizzle; `tasks/operationsCore.ts` + deps (`activePool`,
  `billing/entitlements`) moved in with signatures unchanged. Done: core
  compiles against the seam; used-query inventory documented.
- [ ] **F4c — Tests green + pattern doc** (½d): port
  `operationsCore.test.ts` + `activePool.test.ts` (mock the new seam);
  write `packages/domain/README.md` — the port recipe all 12 remaining
  cores follow. Done: tests green; lint/typecheck green.

### F8 — API skeleton (Hono + oRPC) — 2 chunks

- [ ] **F8a — Server shell** (½d): Hono app, `bun --hot src/index.ts`
  (edit-and-save, no restarts), JSON logging with request IDs, `/health`,
  `/ready`. Done: edit → reload < 1s, logs visible.
- [ ] **F8b — oRPC router + typed client** (1d): router over the domain
  package; `tasks.list` working; typed error taxonomy with proper 4xx on
  validation; Router type + client exported via `packages/contract` (the
  spike-proven `createRouterClient<Router>` pattern, zero codegen). Done:
  seeded local user served; Svelte consumes the client end-to-end.

### F9 — Web shell — 2 chunks (parallel with F8, mock client first)

- [ ] **F9a — Shell from the spike** (½d): seed `apps/web` from
  `spikes/link-garden/web-svelte/` structure — runes stores, scoped styles,
  `tokens.css`, adapter-static SPA (`ssr = false`), modal-nav shell per
  `docs/INTERACTION.md`. Done: shell renders, keyboard nav works.
- [ ] **F9b — Mock client + store wiring** (½d): contract client behind a
  mock transport; first real store + screen skeleton against it. Done: a
  screen works with mocked data; no import outside `packages/contract`.

### F10 — Auth validation (Wasp-compatible) — 3 chunks

The switch's superpower: nobody re-logs-in on switch day, both CLIs keep
working.

- [ ] **F10a — Session validation** (½d): read the Wasp session cookie →
  `Session → Auth → User` lookup (read-only, local DB). Done: a real Wasp
  cookie (captured once, format documented) authenticates via curl.
- [ ] **F10b — PAT validation** (¼d): `ApiKey` lookup for CLI tokens.
  Done: a minted PAT authenticates.
- [ ] **F10c — Test affordances** (½d): session-seeding helper (INSERT a
  `Session` row — how e2e logs in), dev-only `devEmail=` equivalent, CSRF
  stance (SameSite + custom header). Done: seed helper mints a working
  session; expired/absent/invalid covered by tests.

### F11 — E2E harness · deps: F8b, F9b, F10c · ½–1d

- [ ] Playwright config against local; port `webapp/e2e/` helpers with
  login via the F10c seed. Done: one example spec green end-to-end.

---

## Surface slices

**Every slice uses the same chunk checklist** — tick in order, commit per
chunk:

- [ ] P0 — read the Wasp impl + e2e spec + docs; jot the parity notes
      (behaviors, keys, edge cases) into the slice's contract file header
- [ ] P1 — contract types in `packages/contract/<surface>`
- [ ] P2 — domain core port per `packages/domain/README.md` (+ entity-seam
      additions), tests green
- [ ] P3 — oRPC endpoints over the domain core
- [ ] P4 — Svelte screens (tokens, keyboard parity per
      `docs/INTERACTION.md`), stores following the spike's pattern
- [ ] P5 — port the surface's e2e spec(s); green

**Surface map** (what to read before each slice):

| # | Surface | Domain core | Wasp impl | e2e spec(s) | Key docs |
|---|---|---|---|---|---|
| S1 | What Now + Focus | `tasks` | `src/app/` | `next.spec` | `WORKFLOW.md` §2.3 |
| S2 | Capture + NL parse | `inbox` | `src/app/` | `capture.spec` | `WORKFLOW.md` §2.1 |
| S3 | Inbox / triage | `inbox` | `src/inbox/` | `triage*.spec` | `TRIAGE.md` |
| S4 | Tasks & lists | `tasks`, `simpleLists` | `src/tasks/`, `src/lists/` | `today.spec`, `simple-lists.spec` | `INTERACTION.md` |
| S5 | Projects | `projects` | `src/projects/` | `project-detail.spec` | — |
| S6 | Goals | `goals` | `src/goals/` | `goal-planning.spec` | — |
| S7 | Lenses / areas | `lenses` | cross-cutting | — | `WORKFLOW.md` |
| S8 | Logbook | `logbook` | `src/logbook/` | `logbook.spec` | — |
| S9 | Search + Resources | `search`, `resources` | `src/search/` | `search.spec` | — |
| S10 | Auth pages + issuance | — | `src/auth/` | `login.spec`, `auth-regression.spec` | `EMAIL-INTEGRATION.md` |
| S11 | Settings / account | — | `src/app/` | — | — |
| S12 | Push + PWA/share | — | `src/share/` | — | `features/pwa-notifications.md` |
| S13 | Onboarding | — | `src/onboarding/` | — | — |
| S14 | Emails + cron | — | emailSender, `sendDailyTodayReminder` | — | `EMAIL-INTEGRATION.md` |
| S15 | Public/landing | — | `src/public/`, `src/landing/` | — | `PUBLIC-PAGES.md` |
| S16 | Billing + entitlements | `billing` | `src/billing/` | `entitlements.spec` | `BILLING-INTEGRATION.md` |
| S17 | Admin dashboard + routes | `admin`, `feedback` | `src/admin/` | `admin-users.spec` | — |
| S18 | CLI `/api/cli/*` | all cores | `src/auth/patRoutes.ts` | conformance | `cli/README.md` |

**Order and why:** S1→S4 together (same core/contract files), then S2→S3
(capture→triage pipeline). S5, S7 after those contracts settle (lenses are
cross-cutting). S6, S8, S9 independent — any order. S10 late on purpose
(bridge carries auth until then; issuance = Wasp-format sessions + Resend
passwordless per the email doc). S16 last before admin (money), S18 any
time after F10b — path-compatible routes, both CLIs unchanged,
`--json` outputs diffed against Wasp's = 100% match.

## Verification & switch

- [ ] **V1 — Parity run** (2–3d): restore fresh prod dump locally; entire
  e2e + unit suites green, twice in a row; fixes included.
- [ ] **V2 — Rehearsal** (1–2d): run the v3 §6 runbook end-to-end against
  local/scratch — backup, flip, Stripe test-mode webhook, verification
  checklist, rollback drill; every step timed.
- [ ] **V3 — Switch kit** (1d): flip/verify script skeletons, announcement
  email draft (`PRODUCT.md` tone), rollback one-pager with triggers.
- [ ] **V4 — Switch day** (with Jake, quiet hour): execute v3 §6.
- [ ] **V5 — Cleanup** (2–4 wks after V4): delete Wasp + `webapp/` +
  Prisma; first Drizzle migration (ownership handover); doc cascade.
- [ ] **V6 — Neon** (optional, separate): pooled `DATABASE_URL` swap.

---

## Spike learnings applied (2026-09-01)

* **Framework**: Hono + oRPC over Typebase — regen-restart DX vs
  `bun --hot`; oRPC keeps the typed client with zero codegen.
* **Dev proxy standard**: vite proxies `/api` + `/rpc`; same-origin cookies.
* **F9 seeds from** `spikes/link-garden/web-svelte/` (stores, components,
  svelte-check 0/0, SPA mode).
* **Imba**: 1/5 at current toolchain (cheatsheet has every trap); revisit
  on Imba 2 final.

## Effort

~30–36 focused days total for one worker: foundation ≈ 5–7d, slices ≈
18–24d, verification + switch ≈ 5–7d. Calendar depends on GTM — the
campaign always wins.
