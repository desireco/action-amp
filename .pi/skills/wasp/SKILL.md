---
name: wasp
description: Wasp full-stack framework (React + Node + Prisma) expertise for this project. Use when doing ANY Wasp work — editing main.wasp.ts or schema.prisma, writing queries/actions/operations, debugging Wasp compile errors, fetching versioned Wasp docs, starting the dev server, or answering how-to questions about Wasp. Provides idiomatic conventions, the docs-fetching protocol, config-format detection (DSL vs TS Config vs Wasp Spec), and common-mistake fixes.
---

# Wasp Framework Expertise

This project uses **Wasp** — a batteries-included full-stack framework for web apps built with React, Node.js, and Prisma. This skill makes the agent work with Wasp idiomatically instead of guessing.

This repo's Wasp app lives in `webapp/` (look for `webapp/.wasproot`). Detected config format: **Wasp Spec** (`main.wasp.ts` importing `@wasp.sh/spec`, Wasp `^0.24.0`). Always confirm by reading `webapp/main.wasp.ts` before editing.

## Skill Index

| Need | Where |
|---|---|
| Core conventions, imports, troubleshooting | This file (below) |
| Start the dev environment with full debugging | [dev-server.md](./dev-server.md) |
| Get advice on app improvements | [expert-advice.md](./expert-advice.md) |
| Add auth / email / database / styling features | Run the `wasp-add-feature` skill (`/skill:wasp-add-feature`) |
| Deploy to Railway / Fly.io / other | Run the `wasp-deploy` skill (`/skill:wasp-deploy`) |

---

## ⚠️ Documentation Protocol (follow before any non-trivial Wasp work)

Wasp's API moves between versions. **Always ground your knowledge against the docs matching the project's Wasp version before writing or modifying Wasp code:**

1. Run `wasp version` (in `webapp/`) to get the installed CLI version.
2. Fetch the versioned docs map from `https://wasp.sh/llms-<VERSION>.txt` (e.g. `https://wasp.sh/llms-0.24.txt`). The root index is `https://wasp.sh/llms.txt`.
3. The docs map lists raw-markdown GitHub URLs for every section. **Fetch those `raw.githubusercontent.com` URLs directly** — do NOT scrape `wasp.sh/docs/...` HTML pages (they're JS-rendered and won't give clean content).
4. Trust the fetched docs over your own memory, and over anything stale in this file or in `AGENTS.md`. If they conflict, tell the user the local notes may be stale.

---

## Config File Format (detect before reading docs or editing)

How you configure a Wasp app depends on the version. **Detect the format first:**

- **`main.wasp`** → **Wasp DSL** (Wasp `< 0.24`): custom config language (`app Name { ... }`). Docs live under the **legacy** guides.
- **`main.wasp.ts`** → TypeScript, one of two flavors (the filename alone can't disambiguate — check the import):
  - **TS Config** (Wasp `< 0.24`): imports `wasp-config`, uses `new App(...)` + method calls like `app.page(...)`. Legacy docs.
  - **Wasp Spec** (Wasp `>= 0.24`): imports `@wasp.sh/spec`, uses a single `app({ ..., spec: [...] })` call. **This repo's format.** Docs under the **Wasp Spec** general docs.

`@wasp.sh/spec` is generated locally by Wasp (in `.wasp/spec/`) — do **not** install it from npm.

---

## Database Schema & Migrations

Changes to `schema.prisma` are **not** applied until you run a migration. Always use the `--name` flag:

```bash
wasp db migrate-dev --name <descriptive-name>
```

**Track pending migrations:** the dev server warns about these, but the user may miss it if Wasp runs as a background task. Continue coding freely, but **inform the user of pending migrations before they test/view the app**, and offer to run them.

**This repo's DB provider:** `postgresql` (see `schema.prisma`'s `datasource` block; dev DB = Homebrew Postgres on `localhost:5432`). Don't assume SQLite.

### Migrations in non-interactive (agent) shells

`wasp db migrate-dev` runs Prisma's `migrate dev`, which **aborts in non-interactive environments** (no TTY) whenever it would normally prompt — e.g. adding a unique constraint that may cause data loss. There is no `--yes` flag. When hitting:

```
Error: Prisma Migrate has detected that the environment is non-interactive, which is not supported.
```

fall back to running Prisma directly against Wasp's generated schema (from `webapp/`):

```bash
# 1. Regenerate Wasp output so .wasp/out/db/schema.prisma reflects your edit
wasp build

# 2. Materialize the new migration SQL into a migration directory
cd .wasp/out/db
TS=$(date +%Y%m%d%H%M%S)
mkdir -p migrations/${TS}_<descriptive-name>
npx prisma migrate diff \
  --from-migrations migrations \
  --to-schema-datamodel schema.prisma \
  --shadow-database-url "$DATABASE_URL" \
  --script > migrations/${TS}_<descriptive-name>/migration.sql

# 3. Apply all migrations non-interactively (no prompts)
npx prisma migrate deploy --schema schema.prisma
```

`migrate deploy` never prompts, so it is safe in agent shells. Use `npx prisma migrate reset --force --schema schema.prisma` instead of step 3 only when you intentionally want to drop data and replay every migration from scratch (e.g. irreversible drift). Then copy the newly generated `migrations/${TS}_<descriptive-name>/` directory from `.wasp/out/db/migrations/` back into `webapp/migrations/` so it's committed to version control. Prefer `wasp db migrate-dev` interactively whenever a TTY is available.

### Seeding the database

Wasp ships a first-class seeding mechanism for initial data (dev fixtures, prod reference data). Declare seed functions under `db.seeds` and run them with the CLI:

```ts
// main.wasp.ts
import { app } from "@wasp.sh/spec";
import devSeed from "./src/dbSeeds" with { type: "ref" };

export default app({
  // ...
  db: { seeds: [devSeed] },
});
```

```ts
// src/dbSeeds.ts
import type { PrismaClient } from "@prisma/client";
export default async function devSeed(prisma: PrismaClient) {
  await prisma.task.create({ data: { description: "Learn Wasp", isDone: false } });
}
```

```bash
wasp db seed           # runs the first seed
wasp db seed devSeed   # runs a specific seed by name
```

Seeds run once per database. For **per-user** defaults that must exist for every user (including future signups), use an idempotent action invoked from the app shell on load instead — this repo uses `ensureOnboarded` for default Work/Me lenses precisely because seeds are per-DB, not per-user.

---

## Project Structure

```
webapp/
├── .wasp/                    # Wasp output (auto-generated, do not edit)
├── public/                   # Static assets
├── src/                      # Feature code: server operations.ts + client pages/components
├── main.wasp.ts              # Wasp config: routes, pages, auth, operations, jobs, etc.
└── schema.prisma             # Database schema (Prisma)
```

### Recommended Code Organization

Unless the user specifies otherwise, use a **vertical, per-feature** layout (not per-type):

```
src/
├── tasks/
│   ├── tasks.wasp.ts      # Wasp Spec only (0.24+): per-feature config split
│   ├── TasksPage.tsx      # Page component
│   ├── TaskList.tsx       # Component
│   └── operations.ts      # Queries & actions
├── auth/
│   ├── auth.wasp.ts       # Wasp Spec only (0.24+)
│   ├── LoginPage.tsx
│   └── google.ts
```

Splitting config across per-feature `*.wasp.ts` files is a **Wasp Spec** feature (0.24+). With the DSL or TS Config, all config lives in the single `main.wasp` / `main.wasp.ts`.

---

## Wasp Conventions

### Imports

**In TypeScript `src/` files** (same across all Wasp versions):

- ✅ `import type { User } from 'wasp/entities'`
- ✅ `import type { GetTasks } from 'wasp/server/operations'`
- ✅ `import { getTasks, createTask, useQuery } from 'wasp/client/operations'`
- ✅ `import { SubscriptionStatus } from '@prisma/client'` (for Prisma enums)
- ✅ Local code: relative paths `import { X } from './X'`

**In the config file** (`main.wasp.ts`, **Wasp Spec**, this repo):

- ✅ `import { app, page, route } from "@wasp.sh/spec";`
- ✅ `import App from "./src/App" with { type: "ref" };`
- ✅ `import { getTasks } from "./src/tasks/operations" with { type: "ref" };`

(For the DSL or TS Config formats, see the legacy docs — import syntax differs.)

### Operations

Wasp operations are Queries (read) and Actions (write), declared in `main.wasp.ts` and implemented in `src/`. They are full-stack type-safe.

#### Adding a new operation (the type-bootstrap loop)

Generated operation types (`GetTasks`, `CreateTask`, …) live in `wasp/server/operations` but **only exist after you declare the operation in the config AND rebuild**. Expect this every time:

1. Write the op in `src/X/operations.ts` with `satisfies GetFoo<Args, Out>` (or `const getFoo: GetFoo<…> = …`) — **you will see "no exported member" / `Cannot find name 'GetFoo'` errors here. This is expected, not a bug.**
2. Declare it in `main.wasp.ts`: `query(getFoo, { entities: ["Foo"], auth: true })` or `action(createFoo, { entities: ["Foo"], auth: true })`.
3. Run `wasp build` (or `wasp compile`). Wasp generates the type.
4. The errors vanish.

Don't try to "fix" step 1's errors before step 3 — they can't be resolved until the type is generated.

#### Calling operations from the client

```ts
import { useQuery, getTasks, createTask } from "wasp/client/operations";

// Query
const { data, isLoading } = useQuery(getTasks, { lensId }, { enabled: !!lensId });

// Action — call directly with async/await (the default)
await createTask({ description: "..." });
```

⚠️ Call actions directly with `async/await` by default. Use Wasp's `useAction` hook only when you need **optimistic updates** — it is the only native manual cache-invalidation mechanism Wasp exposes (see below).

#### Cache invalidation (don't write it yourself)

Wasp **auto-invalidates** Query caches by shared Entity. If an Action and a Query both declare `entities: ["Task"]`, the Query refetches automatically after the Action runs. Per the docs: _"Wasp invalidates a Query's cache whenever an Action that uses the same Entity is executed… Wasp keeps the Queries 'fresh' without requiring you to think about cache invalidation."_

**Do not add manual `invalidateQueries` calls for queries that share an entity with the action.** This repo historically has ~30 redundant `invalidateQueries` calls from before this was known — don't add more; prune them when you touch a file.

Manual cache control is only needed when:
- A Query spans entities whose dependency Wasp can't infer — declare **all** of them in the Query's `entities:` array so auto-invalidation covers it (e.g. `getAppData` crosses Lens/InboxItem/Task/Project/Goal → list them all).
- You want **optimistic** updates (use the `useAction` hook's `optimisticUpdates` config).
- You need something beyond entity-based invalidation — fall back to React Query directly.

When you do need manual control, import the client from React Query, **not** from Wasp (Wasp does not re-export it):

```ts
import { useQueryClient } from "@tanstack/react-query"; // ✅ NOT wasp/client/operations
const qc = useQueryClient();
qc.invalidateQueries({ queryKey: ["getTasks"] });
```

#### Client import cheat-sheet

| Import | From |
| --- | --- |
| `useQuery`, `useAction`, operation functions (`getTasks`, `createTask`, ...) | `wasp/client/operations` |
| `useQueryClient` (manual cache control) | `@tanstack/react-query` |
| Server operation types (`GetTasks`, `CreateTask`) | `wasp/server/operations` (type-only) |
| Entity types (`Task`, `User`) | `wasp/entities` (type-only) |
| `hashPassword` / `verifyPassword` (e.g. seeding a verified user for tests) | `wasp/auth/password` |

#### Creating a verified user for E2E / integration tests

Wasp's auth form uses React-controlled inputs that reject synthetic events, so browser automation often cannot drive signup. For tests that need a real authenticated user, seed one directly with Wasp's own password hasher:

```ts
import { hashPassword } from "wasp/auth/password";

// Create a User + Auth + AuthIdentity (schema is generated in .wasp/out/db/schema.prisma)
const user = await prisma.user.create({ data: { /* ... */ } });
const auth = await prisma.auth.create({ data: { userId: user.id } });
await prisma.authIdentity.create({
  data: {
    providerName: "email",
    providerUserId: "test@example.com",
    providerData: JSON.stringify({
      hashedPassword: await hashPassword("TestPass123!"),
      isEmailVerified: true,
    }),
    authId: auth.id,
  },
});
```

For pure client unit tests, prefer `mockServer` / `mockQuery` from `wasp/client/test` instead — see the Testing section of the Wasp docs.

### Customization

**Do NOT** configure Vite, Express, React Query, Prisma client, etc. the "usual" way. Wasp has its own mechanisms for customizing all of these. See the **Project Setup & Customization** docs section before adding custom config.

### Advanced Features (built-in)

Wasp provides: custom HTTP API endpoints, background/cron jobs, type-safe links, websockets, middleware, and email sending. See the **Advanced Features** docs section.

---

## Verification & Commands

- **Validate the app:** `wasp compile` (in `webapp/`). **Do not** run `tsc` directly for validation — Wasp generates types during compile.
- **Start dev:** see [dev-server.md](./dev-server.md).
- **Clean weird state:** `wasp clean && wasp start` (nuclear option for persistent strangeness).

---

## Common Mistakes (quick fixes)

| Symptom | Fix |
|---|---|
| `context.entities.X undefined` | Add the entity to `entities: [...]` in the Wasp config declaration |
| Schema changes not applying | Run `wasp db migrate-dev --name <descriptive-name>` |
| Can't login after email signup (`Dummy` email provider) | Check server logs for the verification link, or set `SKIP_EMAIL_VERIFICATION_IN_DEV=true` in `.env.server` |
| Types stale / IDE errors after changes | Restart the TS server (`Cmd+Shift+P` → restart) |
| Wasp not recognizing changes | **WAIT PATIENTLY** — Wasp recompiles. Re-run `wasp start` if needed. |
| Persistent weirdness after waiting + restarting | `wasp clean && wasp start` |
| `Cannot find name 'GetTasks'` (or any `GetX`/`CreateX`) in a new operations file | The generated type doesn't exist until you declare the op in `main.wasp.ts` **and** run `wasp build`. See [Operations](#adding-a-new-operation-the-type-bootstrap-loop). |
| `Prisma Migrate … non-interactive environment` | `migrate dev` aborts in agent/background shells. Materialize the migration with `prisma migrate diff`, then apply with `prisma migrate deploy` (see [Migrations in non-interactive shells](#migrations-in-non-interactive-agent-shells)). |
| `useQueryClient` is not exported from `wasp/client/operations` | Import it from `@tanstack/react-query` directly. |
| Mutations don't refresh the UI | First check that every overlapping Entity is in the Query's `entities:` — Wasp auto-invalidates by Entity. Only add manual `invalidateQueries` for cross-entity/optimistic cases. |

---

## Debugging

If you don't have full debugging visibility (server logs + browser console), follow [dev-server.md](./dev-server.md) to set it up. If the user refuses, ask them to share the output of `wasp start` and the browser console logs.

---

## Credits

Adapted from the official [wasp-lang/wasp-agent-plugins](https://github.com/wasp-lang/wasp-agent-plugins) (upstreaming in-flight: [PR #26](https://github.com/wasp-lang/wasp-agent-plugins/pull/26)) Claude Code plugin into Pi skill format, with operational additions from the ActionAmp build. Original is MIT-licensed.
