---
feature: cli
status: ready
spec_owner: discover
build_owner: build
---

# Feature: ActionAmp CLI + orchestration skills

## Summary

A new top-level `cli/` package that talks to the ActionAmp HTTP API (never the
database), authenticated via **Personal Access Tokens (PATs)** added to the
backend. It is built as a **typed library + thin binary** so paired agent
skills can shell out (`actionamp <cmd> --json`) while remaining human-usable.
The CLI is the *only* API client the skills use.

The headline command is `actionamp now` — print the next task that matters
(the same `getTopTask` that powers `/app`). Around it: start/pause/complete a
task, move it between Today/Upcoming/Someday, capture + triage inbox items,
browse/create projects, goals, and the logbook — everything the existing
operations already support. Missing writes (edit description, delete,
comments, attach/list resources) are filed as two follow-up specs
(`cli-write-ops`, `cli-comments-resources`) and are **out of scope** here:
this spec ships only what the backend already exposes, plus the PAT plumbing
that makes non-browser auth possible.

## Why

A focus app whose thesis is "decision, not capture" is a natural fit for a
terminal: the single-task answer should be reachable without opening a browser
tab, and the loop (capture → triage → start → done) is short enough to live on
the command line. Beyond the human-facing use, the CLI is the **machine
interface** for orchestration skills — a triage assistant, a goal→tasks
breaker-down, a Today-list balancer, a task/project researcher. Those skills
need a typed, scriptable surface with stable `--json` output; the CLI is that
surface, so the skills are paired with it.

PATs (not the user's password, not a browser session cookie) are the auth
model because the existing session token can expire and because no one should
paste their account password into a CLI. The token is issued from the web UI
and pasted once.

> **Where this sits strategically.** This is a power-user / developer surface,
> not part of the validation gauntlet in `docs/ROADMAP.md` §"Now." The
> roadmap's own thesis: adding surfaces before proving anyone wants the
> existing product is malpractice. So this is `ready` for Build to pull
> **opportunistically** — it does not jump the queue ahead of
> `observability-minimal`, `retention-criticalpath`, etc. It's here so that
> when Build wants a self-contained, well-scoped piece of work (or the skills
> need a machine interface), the spec is ready and not re-discovered.

## Decisions locked (so this is `ready`, not blocked)

- **Write gaps → CLI-first.** The CLI calls only operations that exist today.
  Missing writes (edit description / priority / size, delete task/project/
  goal, comments, attach + list resources) are filed as
  `cli-write-ops.md` and `cli-comments-resources.md`.
- **Auth → Personal Access Tokens.** New `ApiKey` Prisma model + custom
  `api` routes. Token issued from the Settings UI, pasted once into the CLI;
  no password entry in the CLI.
- **Location → new top-level `cli/`** (sibling of `docs/` and `webapp/`).
  Standalone `package.json` + `tsconfig`; mirrors the repo's two-part framing.
- **Types → generated from the Wasp SDK.** The CLI uses `import type` from
  `wasp/client/operations` (erased at compile time, no react-query runtime)
  for arg/result shapes, with a bespoke HTTP transport that sends the Bearer
  header.
- **Skill ↔ CLI link → shell out with `--json`.** Every command emits a
  documented, stable JSON shape. Skills parse that; humans get calm,
  human-readable output by default.
- **PAT transport = Option A.** Authed `api` routes under `/api/cli/<op>`
  with custom middleware that resolves the user from the PAT. Each endpoint
  delegates to a pure function shared with the browser ops. *Rejected: Option
  B (mint a Wasp session from the PAT, reuse stock `/operations/*`) — zero op
  duplication but couples to Wasp session internals; fragile across upgrades,
  the kind of coupling `webapp/scripts/` already flags as a "ponytail."*

## Architecture

### Phase 0 — backend PAT plumbing

This is the **only** backend slice. Everything else in this spec is frontend
(CLI) + agent skills.

**`webapp/schema.prisma`** — new model + relation:

```prisma
model ApiKey {
  id          String    @id @default(uuid())
  createdAt   DateTime  @default(now())
  lastUsedAt  DateTime?
  label       String    // user-given name, e.g. "laptop-cli"
  hashedToken String    @unique // store a hash, never the plaintext
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId String
}
```

Add `apiKeys ApiKey[]` to `User`. Apply with
`wasp db migrate-dev --name add-api-keys` (per `webapp/AGENTS.md`: always with
`--name`; verify with `wasp compile`, **not** `tsc`).

**PAT issuance** — a new custom `api` route, following the Stripe-webhook
precedent (`webapp/src/billing/webhook.ts` + `main.wasp.ts:168`):

- `POST /api/pat/issue` (session-authed, called from the browser) → generates
  a random token, returns the plaintext **once**, stores only its hash. Reuse
  the hashing already used by `webapp/scripts/create-verified-user.mjs`
  (`@wasp.sh/lib-auth/node`).
- `POST /api/pat/revoke` (session-authed) → delete an `ApiKey` by id.
- `GET /api/pat/list` (session-authed) → list the user's keys (id, label,
  createdAt, lastUsedAt; **never** the hash).
- **Settings UI** — a small "Personal Access Tokens" section
  (`src/app/SettingsPage.tsx` or a new route under `/app/settings`) to
  create/revoke, showing label + last-used. The plaintext token is shown once
  at creation with a "copy" affordance and a warning it won't be shown again.

**PAT transport (Option A)** — custom middleware + delegating routes:

- New middleware (modeled on `webapp/src/billing/webhookMiddleware.ts`) reads
  `Authorization: Bearer <token>`, hashes it, looks up `ApiKey` by
  `hashedToken`, stamps `lastUsedAt`, and resolves the `User` onto the
  request context. Missing/revoked/wrong token → 401.
- One `api` route per CLI operation under `/api/cli/<op>` (e.g.
  `/api/cli/now`, `/api/cli/tasks/:id/done`). Each is thin: parse the body,
  call a **pure function** factored out of the existing `operations.ts`
  (`src/tasks/operations.ts`, `src/projects/operations.ts`, etc.), return
  JSON. The pure functions are shared by the browser ops and the CLI routes,
  so business rules live in one place.
- The Stripe webhook is the only existing custom `api` route; this follows
  its shape (`entities`, `middlewareConfigFn` in `main.wasp.ts`).

### Phase 1 — the `cli/` package

**Layout:**

```
cli/
  package.json          # name: "actionamp", bin: { actionamp: "./dist/cli.js" }, type: module
  tsconfig.json         # strict, module esnext, moduleResolution bundler
  src/
    cli.ts              # entry — shebang, commander, command dispatch
    config.ts           # load/save ~/.config/actionamp/config.json (apiUrl + token)
    auth.ts             # login / whoami / logout / token (set from paste)
    client.ts           # the HTTP transport: fetch → apiUrl, Bearer header, error shaping
    types.ts            # `export type` re-export from wasp/client/operations (path-mapped)
    commands/
      now.ts            # getTopTask → the headline "what's next"
      task.ts           # task show / start / pause / done / snooze / move
      today.ts          # today list / today --done
      inbox.ts          # inbox list / capture / triage
      project.ts        # project list / show / create / add-task
      goal.ts           # goal list / show / create
      logbook.ts        # logbook
    render/
      human.ts          # default calm output (ActionAmp tone: no streaks/badges/guilt dots)
      json.ts           # --json: stable, documented schema per command
  vitest.config.ts
  tests/                # unit tests for client + render; MSW mocks the API
  README.md             # install, auth, command reference, --json schema
```

**Stack:** `commander` (arg parsing), native `fetch` (Node 22+), `chalk` /
`cli-truncate` for human output, `vitest` + `msw` for tests. ESM
(`"type": "module"`), TypeScript 5.9, `tsc` build. **`tsc` is correct here** —
unlike `webapp/`, this package is outside Wasp's build graph.

**Type sourcing:** `cli/src/types.ts` does an `export type *` from
`wasp/client/operations`, with a `tsconfig` `paths` mapping to
`webapp/.wasp/out/sdk/wasp/dist`. A build-time check asserts the SDK is
generated (so a stale checkout fails loudly). Each command's arg/result types
come from `Parameters<typeof getTopTask>[0]` etc. — drift-proof against
`main.wasp.ts` changes.

**Every command supports `--json`** with a documented stable shape (the
contract the skills depend on). Human output is the default and follows
ActionAmp's calm register — no exclamation marks, no streaks, no guilt-trip
dots.

**Command surface (existing ops only):**

| Command | Backing op | Notes |
|---|---|---|
| `now` | `getTopTask` | headline; active lens resolved from `getAppData` |
| `task show <id>` | `getTask` | |
| `task start <id>` / `pause` / `done` | `startTask` / `pauseTask` / `toggleTaskDone` | "start working on a task" |
| `task snooze <id> --preset <p>` | `snoozeTask` | presets: `1h\|3h\|tomorrow\|weekend\|someday` |
| `task move <id> --to <t>` | `updateTaskStatus` | `today\|upcoming\|someday` |
| `today` / `today --done` | `getTasks` / `getDoneToday` | |
| `inbox list` / `inbox capture <text>` | `getInboxItems` / `createInboxItem` | |
| `inbox triage <id> --decision <d>` | `triageInboxItem` | |
| `project list` / `show <id>` / `create` / `add-task` | `getProjects` / `getProject` / `createProject` / `createTask` | |
| `goal list` / `show <id>` / `create` | `getGoals` / `getGoal` / `createGoal` | |
| `logbook` | `getLogbook` | |
| `login` / `whoami` / `logout` / `token` | PAT flow | |

**Not built in this spec:** edit description, delete anything, comments,
attach/list resources. (Filed as follow-ups.)

### Phase 2 — four orchestration skills

Live in **`.agents/skills/`** at the repo root (so they travel with the
checkout; none exists there today). Each is a `SKILL.md` (matching the
frontmatter structure of the existing `~/.agents/skills/goal/SKILL.md`) that
instructs the agent to shell out to `actionamp … --json` and reason over the
parsed output.

1. **`inbox-triage`** — pulls `inbox list`, proposes a destination per item
   (task-today / upcoming / someday / project / resource / archive) using the
   item text + parsed guesses + the user's current Today/goal context,
   presents the plan, applies via `inbox triage` on approval. **Works today.**
2. **`goal-breakdown`** — takes a goal name/id, proposes a structure of
   Projects + Tasks under it, applies via `goal show` → `project create` →
   `createTask`. **Works today** (the create ops exist).
3. **`today-balancer`** — reviews `today` against the **Today cap of 5**
   (`docs/WORKFLOW.md` §5 — F12; the cap is a feature, not a limit) and the
   focus rules (priority > size > oldest, per `getTopTask`), proposes
   promote/demote/snooze moves, applies via `task move` / `task snooze`.
   **Works today.**
4. **`task-research`** — takes a task/project, gathers web resources, drafts a
   refined description + resource list. **BLOCKED** on
   `cli-comments-resources.md`; **scaffolded only** in this spec, lights up
   when that follow-up lands.

## Done-conditions

- [ ] **PAT migration applied.** `wasp db migrate-dev --name add-api-keys`
      ran clean; `ApiKey` model exists in the generated Prisma client.
      Verified by reading the migration + `wasp compile` passing.
- [ ] **A PAT can be issued and revoked from the Settings UI.** Create
      returns the plaintext once; it is stored hashed (not plaintext) in the
      DB; revoke deletes it; list never exposes the hash.
- [ ] **PAT auth works end-to-end.** A request to `/api/cli/now` with a valid
      PAT returns the user's top task; a missing/revoked/wrong token returns
      401. `lastUsedAt` is stamped on use.
- [ ] **The op logic is shared, not duplicated.** Browser ops and `/api/cli`
      routes call the same pure functions factored out of `operations.ts`.
      Verified by reading the refactor.
- [ ] **`cli/` builds and tests pass.** `tsc` clean; `npm test` (vitest +
      msw) green; `actionamp --help` lists every command.
- [ ] **Auth + headline loop work against a running app.** `actionamp login`
      (token paste) → `actionamp whoami` returns the user → `actionamp now`
      returns the next task → `actionamp task done <id>` completes it (and it
      appears in `today --done`). Verified manually against `wasp start`.
- [ ] **Every command supports `--json`** with a documented, stable shape,
      asserted in tests. The shapes are listed in `cli/README.md`.
- [ ] **The three unblocked skills each complete one full cycle** against the
      running app via the CLI (inbox-triage triages one item; goal-breakdown
      creates a project+task under a goal; today-balancer proposes + applies a
      move).
- [ ] **`task-research` is scaffolded** (SKILL.md present) and clearly marked
      blocked on `cli-comments-resources.md`.
- [ ] **AGENTS.md + README.md updated** — `cli/` added to the implementation
      map and the repo-layout table.
- [ ] **Cold-context reviewer passes.**

## Non-goals

- **No Google OAuth login in the CLI.** Browser-redirect flow; not feasible
  headless. PAT only.
- **No missing write ops.** Edit description/priority/size, delete task/
  project/goal, comments, attach/list resources — all filed as follow-up
  specs (`cli-write-ops.md`, `cli-comments-resources.md`), not built here.
- **No full implementation of `task-research`.** Scaffolded only; it's blocked
  on a follow-up spec.
- **No npm/npx distribution.** Local `npm link` / `node` invocation is enough
  for now; publishing is a later decision.
- **No mobile/desktop wrapper.** This is a terminal tool.
- **No new focus-engine or ranking logic.** The CLI calls `getTopTask` as-is;
  it does not re-rank.

## Open questions

- **PAT scoping.** v1 tokens are full-scope (read + write everything the user
  can). A later `scopes` field (read-only, per-lens) is possible but not
  needed now. _Deferred._
- **Token lifetime.** v1 tokens do not expire. Revocation is the safety valve.
  If churn/abuse warrants, add an `expiresAt` later. _Deferred._
- **Option A vs B reality check.** If, during build, factoring pure functions
  out of every op proves more invasive than expected, revisit Option B
  (mint-a-session) as a fallback — but A is the default and the recommended
  path.

## Prototypes

_(none yet — a throwaway `cli/` worktree proving `actionamp now --json`
against a running `wasp start` is the cheapest validation that the transport
+ type-sourcing approach holds. Discard on lock.)_

<!-- ponytail: the PAT transport (Option A) reaches into how Wasp resolves a
     user from a request. If a Wasp upgrade changes the api-route context
     shape, re-check webapp/.wasp/out/server/bundle/server.js (the auth
     middleware reads `Authorization: Bearer` only — see the auth exploration
     notes). The pure-function refactor is the part most likely to touch a
     lot of files; keep it mechanical. -->
