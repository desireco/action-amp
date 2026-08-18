# Wasp Exit Assessment — Hono + Vite/React

> **Status: research only. No migration has been approved or started.**
>
> **Recommendation:** if ActionAmp leaves Wasp, retain React, PostgreSQL,
> Prisma, the existing CSS, and the TypeScript domain cores. Move to a Vite
> React frontend and a Hono API on Node. Do not combine that move with a switch
> to Solid, Svelte, or Phoenix.

## Why this was assessed

The present Wasp application has two costly development constraints:

1. Routine changes can wait on Wasp generation and full-stack recompilation.
2. Parallel worktrees contend with generated `.wasp/out` state and need
   framework-specific runner and port management.

The proposed shape would make the application an ordinary TypeScript system:

```text
apps/web              Vite + React + React Router + TanStack Query
apps/api              Hono + Prisma + explicit middleware
packages/domain       business rules and operation cores
packages/contracts    request/response schemas and shared types
cli / admin-cli       existing terminal clients, against stable HTTP contracts
```

Hono is deliberately a small HTTP framework: it supplies routing and middleware
but leaves authentication, database access, jobs, email, and deployment as
explicit choices. See the [Hono documentation](https://hono.dev/docs/).

## Current surface (inspected 2026-08-18)

`webapp/` is no longer a small Wasp starter:

| Surface | Current size |
|---|---:|
| TypeScript/TSX source | ~60k lines across 302 files |
| Page components | 37 |
| Wasp routes | 43 |
| Wasp queries / actions | 29 / 64 |
| HTTP API routes | 44 |
| Application models / enums | 26 / 14 |
| Database migration directories | 50 |
| Unit/component test files | 105 |
| Playwright suites | 13 |

Wasp currently owns the configuration and generated client/server contract in
[`webapp/main.wasp.ts`](../../webapp/main.wasp.ts). It also supplies operation
types and clients, auth/session plumbing, per-operation Prisma context, routing,
job execution, email configuration, build generation, and deployment wiring.

The significant integrations that must preserve behavior are:

- passwordless email login, email verification, dev autologin, session renewal,
  cookie mirroring, and onboarding;
- hashed personal-access tokens plus browser-assisted CLI login;
- Stripe checkout, portal, webhook verification, and entitlement enforcement;
- PWA share target, image attachment serving, and large capture payloads;
- web push and the minute-scheduled daily reminder;
- analytics, feedback, admin workflows, and the user/admin CLIs.

## Reuse versus rewrite

The app already has a useful migration seam:

```text
Wasp operation wrapper → operationsCore.ts → Prisma entities
CLI/PAT HTTP handler  ↗
```

There are 13 `operationsCore.ts` modules. The major cores are already shared by
browser operations and CLI handlers, especially capture and triage. They are the
starting point for `packages/domain`.

### Keep

- PostgreSQL data and the existing Prisma schema/migration history.
- React pages, components, styles, keyboard interactions, and Playwright
  coverage.
- Most domain rules, capture parsing, entitlement logic, ranking, and
  `operationsCore.ts` data behavior.
- The CLI and admin CLI command UX; update only their API client contract.
- Railway initially, if desired.

### Replace deliberately

- `main.wasp.ts` routes, queries, actions, and custom API declarations.
- Wasp-generated operation clients/types and `wasp/*` imports (87 source files
  import Wasp directly).
- `useAuth`, Wasp auth routes, session lifecycle, and Wasp-owned auth tables or
  their compatibility layer.
- Wasp entity-context injection with explicit Prisma/service context.
- Wasp's generated operation cache behavior with TanStack Query hooks and query
  keys (the current app has 56 `useQuery` call sites and ~163 explicit cache
  invalidations).
- PgBoss setup, email wiring, dev scripts, production build/deploy scripts, and
  Wasp-specific test helpers.

## Practical advantages for ActionAmp work

### Faster feedback

A React or CSS edit would use normal Vite HMR; it would not generate or compile
the server. A Hono route edit would restart only the API process. Schema changes
would be explicit Prisma work rather than a dependency of every application
compile.

Focused commands become credible boundaries:

```text
dev:web        Vite only
dev:api        Hono only
test:domain    pure rules only
test:api       HTTP/service tests only
test:web       React component tests only
test:e2e       browser verification against independently started services
```

### Easier worktrees and parallel work

Each worktree needs only explicit ports and its own database, for example:

```text
WEB_PORT=4101 API_PORT=3101 DATABASE_URL=... npm run dev
```

There is no generated `.wasp/out` tree shared with the source checkout and no
Wasp-specific generated-type bootstrap loop. UI-only work can run against a
shared API; API/domain work can be tested without starting the frontend. Schema
changes still require coordination, but normal UI and server work no longer
compete for the same framework declaration file.

### Visible system boundaries

The target has explicit route groups and middleware rather than framework
exceptions:

```text
/api/app/*       session-authenticated browser API
/api/cli/*       PAT-authenticated terminal API
/api/admin/*     admin authorization
/api/public/*    rate-limited public endpoints
/webhooks/*      raw-body signature verification
```

This fits ActionAmp's custom session-cookie handling, PWA share target,
attachments, Stripe webhook, and CLI much better than repeatedly working around
generated route composition.

### Independent deployments and rollback

The frontend can deploy as static assets independently of the API. A frontend
rollback would not restart billing, job, or webhook code; an API hotfix would
not rebuild React. This can remain on Railway initially, or later split static
assets to a CDN without changing the API.

### Stable client contracts

The browser, user CLI, and admin CLI can all use explicit versioned API
contracts. This reduces the chance that a frontend refactor silently changes
terminal behavior and gives future integrations a supported surface.

## Migration plan

Use a strangler migration, not a big-bang rewrite.

1. **Freeze the behavior contract (1–2 weeks).** Catalogue every Wasp
   operation/API route, auth requirement, request/response shape, cache effect,
   CLI dependency, and job. Add HTTP-level contract tests for critical flows.
2. **Extract neutral packages (2–3 weeks).** Move reusable cores, shared types,
   entitlement rules, and Prisma access behind explicit interfaces. Continue
   running Wasp wrappers during this work.
3. **Build the API foundation (1–2 weeks).** Add Hono, Prisma lifecycle,
   validation, error mapping, logging, CORS, rate limits, health checks, and
   production packaging.
4. **Replace auth intentionally (3–5 weeks).** Recreate passwordless login,
   cookie sessions, PATs, dev autologin, and admin guards. A one-time re-login
   for all users is materially safer than preserving Wasp/Lucia sessions.
5. **Migrate vertical slices (4–7 weeks).** Start with read-only app data and
   lists; then tasks/focus; projects/goals/resources; inbox/capture/triage;
   reviews/logbook/search; settings/billing/admin; then CLI routes.
6. **Move the web client (3–5 weeks).** Introduce typed API hooks, replace Wasp
   auth and operation imports, and preserve intentional TanStack Query keys and
   invalidation behavior.
7. **Cut over integrations and deploy (3–5 weeks).** Re-home reminders, email,
   Stripe, share target, attachment serving, tests, observability, deployment,
   rollback, and monitoring.

The key rule: migrate one owner at a time. The old and new implementations may
read the same database, but must not concurrently own the same write behavior.

## Estimate

For one experienced full-stack engineer, preserving production behavior:

| Target | Engineering estimate | Solo calendar estimate |
|---|---:|---:|
| Vite/React + Hono/Prisma | 16–24 engineer-weeks | 4–6 months |
| React + TanStack Start | 16–25 engineer-weeks | 4–6 months |
| Hono plus Solid or Svelte | 28–44 engineer-weeks | 7–11 months |
| Phoenix JSON API + React | 24–36 engineer-weeks | 6–9 months |
| Phoenix + LiveView rewrite | 36–52 engineer-weeks | 9–13 months |

Budget **20 engineer-weeks plus a four-week contingency** for the recommended
Hono path. The estimate assumes a feature freeze during the final cutover; it
does not include simultaneous major product development.

## Why keep React

The React switch is not a small mechanical conversion: 139 TSX files, roughly
28k TSX lines, 549 React-hook uses, React-oriented component dependencies, and
34 React component-test files would also change. CSS and product logic can
survive, but component/state behavior and test coverage need a broad rewrite.

Keep React during the infrastructure migration. A UI-framework move can be
evaluated later on its own merits.

## Why not Phoenix now

Phoenix is a sound long-term platform, especially if Elixir, high-concurrency
systems, real-time collaboration, or supervision-based jobs are strategic team
choices. But Phoenix is not a direct backend replacement here: TypeScript cores
and Prisma queries must be rewritten in Elixir/Ecto, and a LiveView approach
would also replace the keyboard-heavy React PWA.

Phoenix makes sense because the organisation wants Elixir, not merely because
Wasp has become restrictive.

## Decision

No migration is scheduled. If ActionAmp exits Wasp, the approved default for a
future implementation plan should be **Vite + React + Hono + Prisma**, preserving
the present database and domain logic wherever practical.
