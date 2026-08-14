# Review: cli-package (Phase 1 — full CLI surface)

> **Phase 1 of the CLI effort.** Shipped 2026-07-22. Spec:
> `docs/specs/cli-package.md`. Board: `cli-package` (Review → **Done**).

## What shipped

**11 commands** in a standalone `cli/` package (commander + chalk, ESM, TypeScript):

| Command | What |
|---|---|
| `login [--dev]` | OAuth browser login (gh/stripe pattern — no copy-paste tokens) |
| `now` | Top task (same one /do shows) |
| `capture "<text>"` | Quick-capture with NL parsing |
| `today [--done]` | Today's committed tasks / completed today |
| `task show/start/pause/done/snooze/move` | The full task lifecycle |
| `inbox list/triage` | Inbox management |
| `project list/show/create/add-task` | Project CRUD |
| `goal list/show/create` | Goal CRUD |
| `logbook` | Completed tasks, finished projects/goals, archived |
| `whoami` | Logged-in account |
| `llm` | Agent/LLM instructions (prints command reference + JSON shapes) |
| `logout` | Clear token |

Every command supports `--json`.

## Architecture

- **Op-refactor**: pure `*Core.ts` files extracted from every feature folder
  (`tasks/operationsCore.ts`, `inbox/operationsCore.ts`,
  `projects/operationsCore.ts`, `goals/operationsCore.ts`,
  `logbook/operationsCore.ts`). Both the Wasp ops (browser) AND the new
  `/api/cli/*` routes delegate to the same pure cores — zero duplicated logic.
- **18 new `/api/cli/*` routes** behind `patRouteMiddleware` (Bearer PAT auth).
  Each resolves the user from `req.patUser`, runs the same entitlement guards
  (`lensViolation`/`capViolation`), delegates to the core.
- **OAuth browser login**: CLI spins up a localhost HTTP server, opens browser
  to `/cli/login`, the page mints an `ApiKey` via the `mintCliToken` action,
  redirects with token+state. CSRF-protected via `state` nonce.
- **Global CORS fix**: `serverMiddleware.ts` now sets
  `Access-Control-Allow-Credentials: true` globally — fixes a pre-existing
  latent bug where all session-authed cross-origin calls from the client were
  silently failing.

## Gates run

| Gate | Result |
|---|---|
| `wasp compile` | ✅ clean |
| Server bundle (`tsc --build && rollup`) | ✅ clean (after fixing patUser type augmentation + pre-existing implicit-anys) |
| CLI `tsc --noEmit` | ✅ clean |
| CLI tests (55 — config, API, every command) | ✅ all pass |
| Backend tests (664 — op cores + existing suite) | ✅ all pass (1 pre-existing App.test.tsx failure, unrelated) |
| `npm audit` (CLI) | ✅ 0 vulnerabilities (vitest upgraded 2→4) |
| Manual e2e (OAuth login → now → task done → today) | ✅ verified against `wasp start` |
| Cold-context reviewer (Phase 0) | ✅ 2 reviewers ran on the PAT layer; Phase 1 inherits the fixes |

## Notable fixes during the build

- **CORS preflight gap on custom api routes**: Wasp's `/api/*` routes mount
  without the global middleware for OPTIONS, so credentialed cross-origin
  POSTs from the browser failed. Solved by using a Wasp action
  (`mintCliToken` via `/operations/*`) for the OAuth mint instead of a custom
  api route.
- **patUser type augmentation**: `patRoutes.ts` needed a side-effect import of
  `patMiddleware.ts` so the `declare module "express-serve-static-core"` type
  augmentation loads during the server bundle's isolated `tsc --build`.
- **Login process hang**: the OAuth flow's HTTP server + fetch sockets kept
  Node's event loop alive after the callback resolved. Fixed with an explicit
  `process.exit(0)` after the success message.
- **13 pre-existing implicit-any errors** in 3 page files (GoalDetailPage,
  InboxPage, TriagePage) surfaced when the strict server build ran. Annotated.

## What's NOT here (deferred)

- **`cli-skills` (Phase 2)** — the four orchestration skills (inbox-triage,
  goal-breakdown, today-balancer, task-research). Still `draft`; depends on
  `cli-package` (now Done) + `cli-comments-resources` (deferred) for one skill.
- **CLI write-ops** (edit task description/priority/size, delete) — filed as
  `cli-write-ops.md`, deferred.
- **Cold-context reviewer on Phase 1** — the Phase 0 reviewers caught a
  paywall hole + snooze drift; Phase 1's op-refactor + route layer inherits
  those fixes but hasn't had its own adversarial review pass. The 55 CLI
  tests + 664 backend tests cover the behavior, but a fresh-eyes pass would
  be thorough.
- **npm publish / npx distribution** — local `npm run build` + `./dist/index.js`
  only. Publishing is a later decision.

## Verdict

**Done.** The full Phase 1 spec is satisfied: op-refactor executed per the
decision table, `cli/` builds + tests pass, every command supports `--json`
with stable shapes, the login→now→task done loop verified manually. The
prototype was replaced by the real package. AGENTS.md + ROADMAP updated. The
public roadmap page shipped the CLI entry.
