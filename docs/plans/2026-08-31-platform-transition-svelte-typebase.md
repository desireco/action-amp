# ActionAmp Platform Transition Plan

> Proposed 2026-08-31 by Jake. Status: proposal under review — see
> [Review notes](#review-notes-zcode-2026-08-31) at the end of this document.

## Objective

Migrate ActionAmp from the current React/Wasp application to a simpler, more modular architecture while minimizing operational and data risk.

### Target architecture

```text
Svelte 5
   │
   │ typed API/RPC
   ▼
Typebase
   │
  Bun
   │
Railway
   │
   ▼
PostgreSQL
```

Initial database:

```text
Railway PostgreSQL
```

Final preferred database:

```text
Neon PostgreSQL
```

The database migration to Neon is deliberately postponed until after the application migration is stable.

---

## 1. Architectural principles

The migration must preserve clear boundaries between four independently replaceable layers:

```text
Frontend
Svelte
   │
   ▼
Application/API
Typebase
   │
   ▼
Runtime/Hosting
Bun + Railway
   │
   ▼
Data
PostgreSQL
```

Svelte must be treated as the current presentation implementation rather than as part of ActionAmp's core architecture.

The frontend should therefore communicate with the backend exclusively through the public Typebase API/client contract.

Do not allow frontend code to depend directly on:

* Drizzle database schema
* PostgreSQL implementation details
* Typebase internal modules
* backend service objects
* server environment variables
* database models

This preserves the option to replace Svelte later with Imba, Gleam/Lustre, or another frontend technology.

---

## 2. Migration strategy

Do not perform a big-bang rewrite.

The transition should happen incrementally while the existing Wasp application continues to operate.

The migration consists of six stages.

---

## Stage 1 — Adopt Typebase against the existing database

### Goal

Prove that Typebase can correctly represent the existing ActionAmp database without changing production data.

### Infrastructure

Keep:

```text
Railway
Railway PostgreSQL
existing production database
```

Add Typebase locally first.

### Tasks

1. Create a new Typebase backend project.

2. Configure Typebase using the existing Railway PostgreSQL `DATABASE_URL`.

3. Run Typebase database introspection / `db pull`.

4. Generate the Drizzle/Typebase representation of the existing schema.

5. Compare the generated schema against the current Prisma/Wasp schema.

6. Verify:

   * tables
   * primary keys
   * foreign keys
   * indexes
   * enums
   * defaults
   * nullable fields
   * timestamps
   * relations
   * unique constraints

7. Do not run automatic schema push against production during this stage.

### Acceptance criteria

The Typebase representation of the database matches the existing production schema.

No production schema changes occur.

Existing Wasp functionality continues normally.

---

## Stage 2 — Run Typebase/Bun alongside Wasp

### Goal

Validate Typebase and Bun in the existing Railway environment without replacing the current application.

### Railway topology

```text
Railway Project

├── actionamp-current
│     Wasp / Node
│
├── actionamp-api-next
│     Typebase / Bun
│
└── PostgreSQL
      existing Railway database
```

Both backends temporarily connect to the same PostgreSQL database.

### First vertical slice

Implement only the minimum ActionAmp workflow required to exercise the architecture.

Recommended first slice:

```text
Get current user
Get tasks
Create task
Complete task
```

Potential endpoints/actions:

```text
user.current

tasks.list
tasks.create
tasks.complete
```

### Validate

* Bun production runtime
* Typebase actions
* database queries
* database mutations
* transactions
* authentication
* error handling
* Typebase generated client
* TypeScript inference
* Railway logging
* production exception visibility
* environment variables
* deployment behavior

### Important rule

Do not migrate substantial business logic until this vertical slice works reliably in production.

### Acceptance criteria

The new backend can read and modify real ActionAmp data correctly.

Errors are visible and diagnosable through Railway.

The existing Wasp application remains operational.

---

## Stage 3 — Introduce Svelte 5

### Goal

Build the new ActionAmp frontend against the Typebase backend.

### Proposed frontend stack

```text
Svelte 5
SvelteKit
TypeScript
Tailwind CSS
Bits UI / shadcn-svelte where useful
TanStack Svelte Query where useful
```

Do not use SvelteKit as the primary business backend.

SvelteKit is responsible for:

* routing
* layouts
* frontend rendering
* bundling
* frontend navigation
* frontend environment
* static/marketing pages if desired

Typebase remains responsible for application data and business operations.

### First frontend vertical slice

Choose one highly representative ActionAmp workflow.

Preferred:

```text
Focus
```

or:

```text
Capture
```

The first implementation should include:

```text
load data
render data
mutate data
loading state
error state
keyboard interaction
route navigation
authentication
```

This provides a realistic comparison against React/Wasp.

### Frontend rule

The frontend may import:

```text
Typebase generated client
API request/response types
```

The frontend may not import:

```text
database schema
Drizzle tables
server implementations
backend services
```

### Acceptance criteria

The Svelte implementation is functionally equivalent to the corresponding React screen.

The code is materially simpler to understand and maintain.

The frontend/backend contract works without framework-specific coupling.

---

## Stage 4 — Incrementally replace Wasp

Once the vertical slice is stable, migrate ActionAmp feature by feature.

Suggested order:

```text
1. Authentication/session bootstrap

2. Capture

3. Focus

4. Inbox / triage

5. Tasks

6. Projects

7. Settings

8. Notifications

9. Billing/account

10. Remaining administrative functionality
```

For each feature:

```text
implement Typebase action/query

↓

implement Svelte UI

↓

test against existing database

↓

enable new implementation

↓

verify production behavior

↓

retire corresponding Wasp implementation
```

Do not rewrite unrelated functionality merely for architectural purity.

---

## 3. Business logic migration

Business logic should live behind Typebase actions rather than inside Svelte.

Example:

Bad:

```text
Svelte component
  decides task state
  updates several records
  calculates priority
```

Preferred:

```text
Svelte

client.tasks.complete(taskId)

        ↓

Typebase

completeTask()

        ↓

business/domain logic

        ↓

PostgreSQL
```

This ensures future frontends behave consistently.

---

## 4. Database migration policy

Typebase is currently young and its production migration story should not be treated as the authoritative source of database evolution.

During the transition:

```text
Typebase application layer

≠

automatic ownership of production schema changes
```

Database modifications should be explicit and reviewed.

Particular care is required for migrations involving:

* data backfills
* column type conversions
* removing columns
* adding non-null constraints
* changing relationships
* large table transformations
* production data rewriting

The PostgreSQL database should remain the durable core of the system regardless of application framework.

---

## Stage 5 — Retire Wasp

Only remove Wasp once the new stack handles all required production workflows.

Before removal validate:

* user login/logout
* sessions
* task lifecycle
* projects
* billing
* email
* scheduled operations
* webhooks
* analytics/events
* admin workflows
* error handling
* backups
* production monitoring

Then remove:

```text
React application
Wasp server
Wasp-generated API/client code
Prisma where no longer required
Node production runtime where no longer required
```

Final interim architecture:

```text
Svelte 5
   │
Typebase
   │
Bun
   │
Railway
   │
Railway PostgreSQL
```

---

## Stage 6 — Move PostgreSQL to Neon

This is intentionally a separate project.

Do not migrate the database while simultaneously replacing Wasp.

Once the new application stack has been stable in production:

```text
Railway PostgreSQL
        ↓
      Neon
```

### Migration goals

Preserve:

* schema
* data
* IDs
* relationships
* sequences
* indexes
* timestamps
* user data
* billing references

### Application change

Ideally the application-level change should mostly be:

```text
DATABASE_URL
```

plus any connection pooling configuration required by Neon.

### Final architecture

```text
                 ACTIONAMP

┌─────────────────────────────┐
│ Svelte 5                    │
│                             │
│ Presentation                │
│ Routing                     │
│ Client-side interaction     │
└──────────────┬──────────────┘
               │
          typed contract
               │
┌──────────────▼──────────────┐
│ Typebase                    │
│                             │
│ API actions                 │
│ authentication              │
│ business logic              │
│ validation                  │
└──────────────┬──────────────┘
               │
              Bun
               │
┌──────────────▼──────────────┐
│ Railway                     │
│                             │
│ Deployment                  │
│ runtime                     │
│ logs                        │
│ observability               │
└──────────────┬──────────────┘
               │
         DATABASE_URL
               │
┌──────────────▼──────────────┐
│ Neon PostgreSQL             │
│                             │
│ Durable system of record    │
└─────────────────────────────┘
```

---

## 5. Escape-hatch requirements

The architecture should explicitly preserve the ability to replace individual components.

### Frontend replacement

Allowed without backend rewrite:

```text
Svelte → Imba
Svelte → Vue
Svelte → Solid
Svelte → future JS framework
```

Gleam/Lustre remains possible but would require an explicit HTTP/JSON contract instead of relying primarily on shared TypeScript types.

### Typebase replacement

If Typebase proves too immature:

```text
Svelte
   ↓
Hono
   ↓
Bun
   ↓
Railway
   ↓
Postgres
```

or:

```text
Svelte
   ↓
Elysia
   ↓
Bun
```

The frontend API boundary should minimize the impact of this change.

### Hosting replacement

Railway can later be replaced independently:

```text
Bun
 ↓
Fly.io
```

or another container/runtime provider.

Neon remains unchanged.

---

## 6. Typebase risk controls

Typebase should currently be considered an application convenience layer rather than foundational infrastructure.

Known risks:

* young 0.1.x API
* small community
* maintainer concentration
* rapid release cadence
* immature production migration tooling
* limited public production history

Mitigation:

* PostgreSQL remains standard PostgreSQL.
* Drizzle remains standard Drizzle.
* Bun remains independent.
* Railway remains independent.
* frontend communicates through an explicit API boundary.
* Typebase generated server provides an escape path.
* avoid Typebase-specific assumptions inside domain logic where practical.

---

## 7. Repository structure

Recommended monorepo structure:

```text
actionamp/

apps/
  web/
    src/
      routes/
      lib/
      components/
      api/

  api/
    typebase/
      actions/
      db/
      auth/
      services/

packages/
  domain/
  shared/

infrastructure/
  railway/
  database/

docs/
  architecture/
  migration/
```

Do not force shared packages merely for code reuse.

Prefer clear boundaries over clever monorepo abstractions.

---

## 8. First Codex implementation task

The first implementation should NOT be:

> Rewrite ActionAmp in Svelte and Typebase.

It should be:

### ActionAmp Typebase Compatibility Spike

1. Add Typebase to a new isolated backend workspace.
2. Configure it against the existing Railway PostgreSQL database.
3. Pull/introspect the existing database schema.
4. Do not mutate the schema.
5. Document discrepancies between the generated schema and the existing Prisma/Wasp schema.
6. Implement read-only `tasks.list`.
7. Implement read-only `user.current` if authentication can be safely reproduced.
8. Generate a Bun server.
9. Run it locally.
10. Deploy it as a separate Railway service.
11. Verify Railway production logs and errors.
12. Do not route production traffic to it yet.
13. Produce a short compatibility report before proceeding.

### Success criteria

Proceed to the next stage only if:

```text
Database introspection is correct
Bun server runs correctly
Railway deployment works
Existing data reads correctly
No database mutation occurred
No existing Wasp functionality was affected
```

---

## 9. Decision checkpoint

After the compatibility spike, explicitly answer:

```text
Is Typebase pleasant to work with?

Does its generated code look understandable?

Does database introspection correctly represent ActionAmp?

Does Bun work cleanly on Railway?

Are production errors easy to diagnose?

Does the typed client improve frontend development?

Would replacing Typebase later be practical?
```

If the answers are predominantly yes:

```text
Proceed with Svelte + Typebase migration.
```

If Typebase itself is the weak point:

```text
Keep Svelte + Bun + Railway + PostgreSQL

Replace Typebase with Hono or Elysia.
```

This checkpoint prevents the Typebase experiment from becoming an architectural commitment before it earns one.

---

## Final transition sequence

```text
CURRENT

React
Wasp
Node
Railway
Railway PostgreSQL


        ↓ Stage 1–2


React/Wasp ─────┐
                ├── Railway PostgreSQL
Typebase/Bun ───┘


        ↓ Stage 3–4


React/Wasp
     +
Svelte/Typebase/Bun
     ↓
Railway PostgreSQL


        ↓ Stage 5


Svelte
Typebase
Bun
Railway
Railway PostgreSQL


        ↓ Stage 6


Svelte
Typebase
Bun
Railway
Neon PostgreSQL
```

The guiding principle is:

**Change the application first. Change the database infrastructure second. Never make both migrations one debugging problem.**

---

# Review notes (ZCode, 2026-08-31)

## Verdict

The strategy is sound: strangler-fig migration, a read-only spike before any
code, one vertical slice per layer, both backends on one database, an explicit
decision checkpoint before Typebase earns commitment, and the Neon move
decoupled from the application move. The guiding principle ("never make both
migrations one debugging problem") is correct and should be enforced literally.

The gaps are all codebase-specific — the plan reads as if written against a
generic Wasp app rather than against this repo. The items below should be
resolved before or during the stage they name.

## Typebase facts verified (2026-08-31)

* The framework is **typebase.io** (repo `github.com/typebase-io/monorepo`),
  built on **oRPC + Drizzle + better-auth**. (`typebase.dev` is an unrelated
  Japanese consulting firm — don't confuse the domains.)
* First-party deploy targets are **Vercel, Cloudflare Workers, Deno Deploy**
  (+ Neon). **Bun on Railway is not a documented path**; the escape is the
  CLI's "generate the code, deploy anywhere" output. Stage 2's Bun-on-Railway
  validation is therefore genuinely load-bearing, not a formality.
* Auth is **better-auth** with its own user/session table schema — it will not
  match Wasp's auth tables (see gap 1).
* Existing-database introspection is **not a Typebase feature**. Stage 1's
  "db pull" is plain `drizzle-kit` introspection — standard and low-risk, but
  it means Stage 1 proves Drizzle, and only Stage 2 proves Typebase.
* Very early: a single Show HN launch (118 points) with founder questions
  about migrations/existing DBs unanswered in-thread, and a marketing page
  with disclosed fake testimonials. §6's caution is justified; treat §9's
  checkpoint as mandatory, not optional.

## Gaps to resolve

1. **Auth/session bridge (critical, unspecified).** Wasp owns the auth
   surface: `User`, `Auth`, `AuthIdentity`, `Session`, `MagicLoginChallenge`,
   plus `ApiKey` for CLI PATs. The plan never says how the new stack
   authenticates during Stages 2–4. Recommendation: during dual-run the
   Typebase layer should **not** adopt better-auth's schema — it should
   validate the existing Wasp session cookie read-only against Wasp's
   `Session` table. Sharing that cookie requires both apps on the **same root
   domain** (subdomain vs path-proxy must be decided before Stage 3). Full
   auth cutover — including magic-login email flows and CLI PATs — is Stage 4
   item 1, and it is the hardest single item in the plan.
2. **Schema ownership during dual-run.** Wasp stays in active development
   during Stages 3–4, and features will need migrations. Prisma must remain
   the **only** schema authority until Stage 5: re-run `drizzle-kit pull`
   after every Prisma migration, and add a drift check so the introspected
   schema can't silently lag.
3. **Prisma client-side semantics are invisible to introspection.** Prisma's
   `uuid()`/`cuid()` defaults and `updatedAt` bookkeeping are enforced by the
   Prisma client, not by the database. `drizzle-kit pull` will show no DB
   default for those columns; writes from the new stack that omit them will
   fail or corrupt data silently. Replicate them in the Typebase/Drizzle
   layer. (Also note Prisma maps `DateTime` to `timestamp(3)`.)
4. **Port `operationsCore.ts` instead of rewriting domain logic.** The pure
   `webapp/src/*/operationsCore.ts` files already hold framework-free
   business logic shared by the Wasp ops and the `/api/cli/*` routes. Lifting
   them into `packages/domain` and wrapping them in Typebase actions de-risks
   §3 more than any other single move.
5. **The CLI surface is missing from Stage 4's order.** `cli/` and
   `admin-cli/` talk to `/api/cli/*` on the Wasp server, and the in-app admin
   dashboard lives in `webapp/src/admin/`. Those routes must be reimplemented
   (or preserved verbatim) before Stage 5 retires Wasp, or both CLIs break
   the day Wasp stops.
6. **Non-page surfaces.** Stripe webhooks (Wasp must remain the sole receiver
   until billing cutover — never dual-write billing), Web Push
   (`PushSubscription`), the PWA share-target endpoint, and the Playwright
   e2e suite (port it per feature slice, not all at the end).
7. **Stage 2 mutation safety.** Validate mutations against a local snapshot
   of production data first; on production, allowlist a single test account.
   No real user traffic routes to the new backend before Stage 3 dogfooding.
8. **Timing against GTM.** The September 2026 campaign
   (`docs/GTM-SEPTEMBER-2026.md`) is in flight. Stage 1 (read-only spike) is
   safe to run now; hold Stages 3–5 until the campaign settles. Every feature
   migrated ships twice during the window — keep the window short and freeze
   Wasp scope per feature during each cutover.
9. **Repo layout.** Create `apps/` alongside the existing `webapp/`,
   `cli/`, `admin-cli/`; don't move existing folders until Stage 5.

## Editorial fixes applied when storing

* "five stages" → six (the plan enumerates Stage 1–6).
* Non-stage sections renumbered 3–9 in document order; they previously
  collided with the "Stage 5"/"Stage 6" numbering.
* Section headings demoted one level (`##` under the `#` title, sub-heads
  `###`) so the document renders with a proper hierarchy. Body text and all
  diagrams are otherwise verbatim.
