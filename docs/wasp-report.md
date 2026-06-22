# Wasp Skills — Review & Improvement Report

> Built from the experience of implementing the full ActionAmp app (7 phases,
> 30+ operations, 10 Prisma models, auth, billing, dark mode, NL parsing) using
> the three project-scoped Wasp skills, cross-referenced against the official
> `wasp.sh/llms-0.24.txt` docs.
>
> **TL;DR:** the skills are a solid foundation but have real gaps that cost us
> hours during this build. The biggest wins: document Wasp's automatic cache
> invalidation (we wrote ~30 redundant `invalidateQueries` calls), the
> non-interactive migration workflow (the documented command fails in agent
> contexts), the generated-type bootstrap loop, and first-class seeding.

---

## 0. The three skills at a glance

| Skill | Purpose | Lines | Quality |
|---|---|---|---|
| **`wasp`** | Core expertise: config format, imports, operations, migrations, common mistakes | ~190 (SKILL.md + dev-server.md + expert-advice.md) | Good bones, several factual gaps |
| **`wasp-add-feature`** | Walk-throughs for auth/email/db/styling/branding | ~50 (references 5 sub-guides not in the repo) | Thin index; sub-guides not vendored |
| **`wasp-deploy`** | Deploy to Fly.io / Railway, pre-deploy validation | ~50 | Reasonable, project-coupled |

All three assume the **Wasp Spec** (`main.wasp.ts` + `@wasp.sh/spec`) format, which matches our project. Good.

---

## 1. Findings that apply across all three skills

### 1.1 ❌ Critical: the skills never mention Wasp's automatic cache invalidation

This is the single biggest gap and it cost us the most code.

**The official docs say** (actions.md → "Cache Invalidation"):

> Wasp invalidates a Query's cache whenever an Action that uses the same Entity
> is executed. … In practice, this means that Wasp keeps the Queries "fresh"
> without requiring you to think about cache invalidation.

**What we did wrong because the skill was silent:** every mutation in the app manually calls `queryClient.invalidateQueries({ queryKey: [...] })` for 4–5 queries each. Example from `InboxTriagePage.tsx`:

```ts
await triageInboxItem({...});
queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
queryClient.invalidateQueries({ queryKey: ["getTasks"] });
queryClient.invalidateQueries({ queryKey: ["getProjects"] });
queryClient.invalidateQueries({ queryKey: ["getAppData"] });
```

This is duplicated across `WhatNowPage`, `TodayPage`, `SomedayPage`, `UpcomingPage`, `GoalsPage`, `ProjectsPage`. **Most of it is redundant** — Wasp already invalidates any query sharing an entity with the action.

**Suggested fix for the `wasp` skill — add a section:**

> ### Cache invalidation (read this before writing any)
>
> Wasp **auto-invalidates** query caches based on shared entities. If an Action
> uses `entities: ["Task"]` and a Query also uses `Task`, the Query refetches
> automatically after the Action runs. **Do not add manual `invalidateQueries`
> calls for entity-overlapping queries.**
>
> You only need manual invalidation when:
> - A Query computes across entities and Wasp can't infer the dependency
>   (e.g. `getAppData` counts across `Lens`/`InboxItem`/`Task`/`Project`/`Goal`
>   — declare all of them in the Query's `entities:` to get auto-invalidation).
> - You want **optimistic** updates (use the `useAction` hook's optimistic config).
>
> When you DO need manual control, import the client directly:
> ```ts
> import { useQueryClient } from "@tanstack/react-query";  // NOT wasp/client/operations
> ```

### 1.2 ❌ Critical: `wasp db migrate-dev` fails in non-interactive (agent) shells

The skill's migration guidance is a single line:

> ```bash
> wasp db migrate-dev --name <descriptive-name>
> ```

**What actually happens when an agent runs this:** Prisma detects the non-interactive environment and aborts:

```
Error: Prisma Migrate has detected that the environment is non-interactive,
which is not supported.
```

This happens because `migrate dev` wants to prompt about data loss (e.g. adding a unique constraint). There is **no `--yes` flag**. We burned ~30 minutes discovering this and building a workaround.

**The workaround we landed on (should be in the skill):**

```bash
# 1. Regenerate the Wasp output so db/schema.prisma matches your source edit
wasp build

# 2. Generate the migration SQL non-interactively (no prompts)
cd .wasp/out/db
npx prisma migrate diff \
  --from-migrations migrations \
  --to-schema-datamodel schema.prisma \
  --shadow-database-url "$DATABASE_URL" \
  --script \
  > migrations/<timestamp>_<name>/migration.sql

# 3. Apply non-interactively (reset to clear + apply all migrations)
npx prisma migrate reset --force --schema schema.prisma
# or, if the DB is already empty of tracking:
npx prisma migrate deploy --schema schema.prisma

# 4. Copy the new migration back to the source tree
cp -r .wasp/out/db/migrations/<timestamp>_<name> ../../migrations/
```

**Suggested fix:** add a "Migrations in non-interactive environments" subsection to the `wasp` skill, right after the migration line.

### 1.3 ❌ The generated-type bootstrap loop is undocumented

When you write a new operation, you reference a generated type (`GetTasks`, `CreateInboxItem`, `TriageInboxItem`) that **doesn't exist yet**. The type only appears after you:

1. Declare the operation in `main.wasp.ts` (`query(getTasks, { entities: [...], auth: true })`)
2. Run `wasp build` (or `wasp compile`)

Until then, the operation file shows `Cannot find name 'GetTasks'` errors. We hit this on every single one of our ~15 operations.

**Suggested fix — add to the `wasp` skill's Operations section:**

> ### Adding a new operation (the type-bootstrap loop)
>
> Generated types (`GetTasks`, `CreateTask`, …) live in `wasp/server/operations`
> but only **after** you declare the operation in `main.wasp.ts` AND rebuild.
> Expect this sequence every time:
>
> 1. Write the operation in `src/X/operations.ts`, importing its type from
>    `wasp/server/operations` — **expect "no exported member" errors here**.
> 2. Declare it in `main.wasp.ts` with `query(name, { entities, auth })`.
> 3. Run `wasp build` (or `wasp compile`) — Wasp generates the type.
> 4. The errors vanish. The `satisfies GetFoo<Args, Output>` annotation now type-checks.
>
> Don't try to "fix" step 1's errors before step 3 — they're expected.

### 1.4 ⚠️ The `useAction` guidance is too absolute

The skill says:

> ⚠️ Call actions directly with `async/await`. **Do NOT** use Wasp's `useAction`
> hook unless you specifically need optimistic updates.

**What the docs actually say:** `useAction` is the *only* native way to get optimistic updates and is a legitimate choice. We followed the skill's "call directly" advice and it worked fine — but the absolute "DO NOT" undersells a documented feature. The guidance should be softer and point to the optimistic-update use case explicitly.

We also hit a related bug: our first attempt was `useAction(ensureOnboarded)()` which errored (`Expected 1 arguments, but got 0`). The skill doesn't show the hook's call signature anywhere.

### 1.5 ⚠️ Client/import path split for `useQueryClient`

We assumed all React Query hooks come from `wasp/client/operations`. They don't:

```ts
import { useQuery } from "wasp/client/operations";          // ✅ Wasp re-exports
import { useQueryClient } from "@tanstack/react-query";     // ✅ direct from TanStack
```

`useQueryClient` is **not** re-exported by Wasp. This is a real stumbling block — the `wasp/client/operations` module looks like the obvious source for all query hooks.

**Suggested fix — add an import cheat-sheet:**

> | Hook | Import from |
> |---|---|
> | `useQuery` | `wasp/client/operations` |
> | Operations (`getTasks`, `createTask`, …) | `wasp/client/operations` |
> | `useQueryClient` (manual invalidation) | `@tanstack/react-query` |
> | `useAction` (optimistic updates) | `wasp/client/operations` |

### 1.6 ⚠️ Port assumption is wrong for this project

The `dev-server.md` says:

> Frontend → `localhost:3000`, backend → `localhost:3001`.

But our app's frontend runs on **`localhost:4000`** (set in `vite.config.ts`, declared via `WASP_WEB_CLIENT_URL=http://localhost:4000` in `.env.server`). Hardcoding 3000 made the validation step mislead us.

**Suggested fix:** the skill should read `WASP_WEB_CLIENT_URL` from `.env.server` (or the vite config) instead of assuming 3000. Falls back to 3000 if unset.

### 1.7 ⚠️ SQLite-default assumption is wrong for this project

The skill repeatedly says "Dev DB is SQLite (zero-config)". Our project is **PostgreSQL from day one** (Homebrew Postgres 18, `postgresql://jake@localhost:5432/actionamp_dev`). The SQLite framing led to confusing migration guidance and the `wasp start db` (Docker) suggestion that didn't apply.

**Suggested fix:** detect the provider from `schema.prisma`'s `datasource` block at skill-load time. Branch the DB guidance on what's actually configured rather than asserting SQLite.

---

## 2. `wasp` skill — specific improvements

### 2.1 Add a "Seeding" section (first-class feature we reinvented)

We built `ensureOnboarded` — an idempotent action that runs on app load to create default Work/Me lenses. It works, but Wasp has a **first-class seeding mechanism** we didn't know about:

```ts
// main.wasp.ts
export default app({
  // ...
  db: {
    seeds: [devSeed, prodSeed],
  },
});

// Run with: wasp db seed <name>
```

Seed functions get a `prisma` argument directly and can import server-side actions. This is the idiomatic way to seed default data per environment.

**Suggested addition to the skill:**

> ### Seeding the database
>
> For per-user defaults that must exist before first interaction (e.g. default
> "Work" / "Me" lenses, onboarding state), you have two options:
>
> 1. **`db.seeds` (first-class)** — declare seed functions in `main.wasp.ts` under
>    `db.seeds`, run with `wasp db seed <name>`. Best for one-time environment
>    setup (dev fixtures, prod reference data).
> 2. **Idempotent onboarding action** — an action called from the app shell on
>    load (`if (user) ensureOnboarded()`). Best for per-user defaults that must
>    exist for every user, including future signups.
>
> ActionAmp uses #2 for lenses because seeds run once per DB, not per user.

### 2.2 Add a "Testing authenticated operations" section

This was a genuine blocker. To run our end-to-end test we needed an authenticated user. Wasp's auth form can't be driven reliably by automated typing (React-controlled inputs reject synthetic events), so we had to **seed a verified user directly in the DB** using Wasp's internal password hasher:

```ts
import { hashPassword } from "@wasp.sh/lib-auth/node";
// then create User + Auth + AuthIdentity records with isEmailVerified: true
```

The `project/testing.md` doc covers Vitest for components but says nothing about authenticating in integration tests or seeding verified users.

**Suggested addition:**

> ### Creating a test user for E2E / integration tests
>
> Wasp's auth form is hard to drive via browser automation (React-controlled
> inputs). To seed a verified user directly:
>
> ```ts
> import { hashPassword } from "@wasp.sh/lib-auth/node";
> import { PrismaClient } from "@prisma/client";
> const p = new PrismaClient();
> const user = await p.user.create({ data: { firstName: "Test", lastName: "User" } });
> const auth = await p.auth.create({ data: { userId: user.id } });
> await p.authIdentity.create({
>   data: {
>     providerName: "email",
>     providerUserId: "test@example.com",
>     providerData: JSON.stringify({
>       hashedPassword: await hashPassword("TestPass123!"),
>       isEmailVerified: true,
>     }),
>     authId: auth.id,
>   },
> });
> ```
>
> Required Auth/AuthIdentity schema (auto-generated, in `.wasp/out/db/schema.prisma`):
> `Auth { userId, identities[] }`, `AuthIdentity { providerName, providerUserId, providerData, authId }`.

### 2.3 Tighten the Wasp Spec config examples

The current "Imports" section is good but could show a complete minimal `main.wasp.ts` for the Spec format, since that's what this project uses. Add:

```ts
import { app, page, route, query, action, api } from "@wasp.sh/spec";
import { App } from "./src/App" with { type: "ref" };
import { TasksPage } from "./src/tasks/TasksPage" with { type: "ref" };
import { getTasks, createTask } from "./src/tasks/operations" with { type: "ref" };

export default app({
  name: "MyApp",
  title: "MyApp",
  wasp: { version: "^0.24.0" },
  head: ["<link rel='icon' href='/favicon.ico' />"],
  auth: { userEntity: "User", methods: {...}, onAuthSucceededRedirectTo: "/" },
  client: { rootComponent: App },
  spec: [
    route("TasksRoute", "/tasks", page(TasksPage)),
    query(getTasks, { entities: ["Task"], auth: true }),
    action(createTask, { entities: ["Task"], auth: true }),
  ],
});
```

This is the shape we use and it took experimentation to get right.

### 2.4 Common-mistakes table additions

Add these rows based on what we actually hit:

| Symptom | Fix |
|---|---|
| `Prisma Migrate … non-interactive environment` | Agent shells can't run `migrate dev`. Use the diff + reset + deploy workaround in §1.2. |
| `Cannot find name 'GetTasks'` in a new operations file | Type doesn't exist until you declare it in `main.wasp.ts` and run `wasp build`. See §1.3. |
| `useAction(fn)()` → "Expected 1 arguments" | The hook takes options; or just call the operation directly: `await fn(args)`. |
| `useQueryClient` not exported from `wasp/client/operations` | Import it from `@tanstack/react-query` directly. |
| Mutations don't refresh the UI | First check: did you list every overlapping entity in the Query's `entities:`? Wasp auto-invalidates by entity. |
| `wasp start` shows "Can not connect to database" after a reset | The reset dropped the DB; give Postgres a moment, or rerun. |

---

## 3. `wasp-add-feature` skill — specific improvements

### 3.1 The sub-guides aren't vendored

The skill references `app-branding.md`, `authentication.md`, `email-provider.md`, `database.md`, `styling.md` — **none of which exist** in `.pi/skills/wasp-add-feature/`. The skill is a thin index pointing at files that aren't there. The agent has to fall back to the docs-fetching protocol every time.

**Suggested fix:** either vendor the 5 sub-guides (curated for Wasp Spec 0.24), or make the skill explicitly say "fetch the raw-markdown guide from the docs map" with the exact URL pattern. Right now it implies local files exist.

### 3.2 Add a "what this project already has" preflight

The skill lists all features generically. But this project **already has** email auth, SMTP email, PostgreSQL, custom branding, and a full design system (no Tailwind). Running the skill blindly would suggest adding things that exist.

**Suggested fix:** add a step 0:

> Before suggesting features, read `main.wasp.ts`'s `auth`, `emailSender`, and
> `client` blocks + check `schema.prisma`'s datasource. Filter the feature
> list to what's actually missing. For ActionAmp: email auth ✅, SMTP ✅,
> Postgres ✅, branding ✅ — so the relevant adds are social auth providers,
> jobs, websockets, etc.

### 3.3 Tailwind guidance would conflict with our design system

The skill offers "Styling (Tailwind CSS, ShadCN UI)". ActionAmp uses a **hand-rolled CSS design system** (tokens.css + BEM-style components, no Tailwind). If a user invoked the styling feature unaware, the skill would push Tailwind setup that conflicts with the existing system.

**Suggested fix:** note in the styling guide that adding Tailwind to a project with an existing CSS architecture requires a migration plan, and link to the design-system README.

---

## 4. `wasp-deploy` skill — specific improvements

### 4.1 Accurate and project-coupled — mostly good

This skill references `docs/deployment-research.md` (which exists and is thorough) and correctly identifies Fly.io and Railway as first-class targets. The "don't rerun launch" warning is valuable.

### 4.2 Add the `wasp build` pre-flight explicitly

The skill says "run pre-deployment validation" but doesn't list the single most valuable check we used repeatedly: `wasp build` catches type errors and config issues in ~30s without deploying. Make it step 0.

### 4.3 Mention the production-Stripe / env-var split

ActionAmp has a real production config split (`.env.server.production` with live Stripe keys, restricted `rk_` keys). The deploy skill's env-var guidance is generic. Add a note about keeping test vs. production secrets separate and using restricted keys.

---

## 5. Cross-cutting: what the skills get right

To be fair, several things worked well and shouldn't change:

- ✅ **Config-format detection** (DSL vs TS Config vs Wasp Spec) — accurate and saved us from reading legacy docs.
- ✅ **Docs-fetching protocol** (`wasp.sh/llms-<VERSION>.txt` → raw markdown URLs) — works flawlessly; the docs map for 0.24 is comprehensive.
- ✅ **Vertical per-feature layout** (`src/tasks/`, `src/inbox/`, `src/projects/`) — we followed this and it scaled well to 10 feature folders.
- ✅ **`with { type: "ref" }` import attribute** — documented correctly.
- ✅ **`context.entities.X` tenancy pattern** — every query/action scoped by `userId`, exactly as the skill implies.
- ✅ **`wasp clean && wasp start`** as the nuclear option — rescued us twice.
- ✅ **Deploy-skill's Fly vs Railway comparison** — matched our `deployment-research.md`.

---

## 6. Prioritized action list

Ordered by impact × effort. The top 3 would have saved us hours on this build alone.

| # | Change | Skill | Impact | Effort |
|---|---|---|---|---|
| 1 | Document automatic cache invalidation; warn against redundant `invalidateQueries` | `wasp` | 🔴 High (we wrote ~30 redundant calls) | Low |
| 2 | Add the non-interactive migration workaround (`migrate diff` + `reset --force`) | `wasp` | 🔴 High (30-min blocker) | Low |
| 3 | Document the generated-type bootstrap loop (declare → build → type resolves) | `wasp` | 🔴 High (hit on every operation) | Low |
| 4 | Add testing/seeding section (create verified user via `hashPassword`) | `wasp` | 🟡 Medium (E2E blocker) | Medium |
| 5 | Add the import cheat-sheet (`useQueryClient` from TanStack, not Wasp) | `wasp` | 🟡 Medium | Trivial |
| 6 | Detect DB provider + client port from the project instead of assuming SQLite/3000 | `wasp` | 🟡 Medium | Low |
| 7 | Add a `db.seeds` section (first-class seeding vs idempotent onboarding action) | `wasp` | 🟢 Low (we worked around it) | Low |
| 8 | Soften the `useAction` "DO NOT" to "call directly unless you need optimistic updates" | `wasp` | 🟢 Low | Trivial |
| 9 | Vendor or correctly reference the 5 `wasp-add-feature` sub-guides | `wasp-add-feature` | 🟡 Medium | Medium |
| 10 | Add a "what this project already has" preflight to `wasp-add-feature` | `wasp-add-feature` | 🟢 Low | Low |
| 11 | Make `wasp-deploy` step 0 = `wasp build` | `wasp-deploy` | 🟢 Low | Trivial |
| 12 | Expand the common-mistakes table with the 6 new rows in §2.4 | `wasp` | 🟡 Medium | Low |

---

## 7. One concrete rewrite: the Operations section

Here's what the `wasp` skill's Operations section should become (replacing the current 4-line stub):

````md
## Operations (queries & actions)

### Adding a new operation (the type-bootstrap loop)

Generated types (`GetTasks`, `CreateTask`, …) only exist AFTER you declare the
operation in `main.wasp.ts` and run `wasp build`. Expect this sequence:

1. Write the op in `src/X/operations.ts` with `satisfies GetFoo<Args, Out>`
   (you'll see "no exported member" errors — they're expected).
2. Declare it in `main.wasp.ts`: `query(getFoo, { entities: ["Foo"], auth: true })`.
3. Run `wasp build`. The type generates; errors vanish.

### Calling operations from the client

```ts
import { useQuery, getTasks, createTask } from "wasp/client/operations";

// Query
const { data, isLoading } = useQuery(getTasks, { lensId }, { enabled: !!lens });

// Action — call directly with async/await (the default)
await createTask({ description: "..." });

// Optimistic updates — use the useAction hook instead
import { useAction } from "wasp/client/operations";
const createTaskFn = useAction(createTask, { optimisticUpdates: [...] });
```

### Cache invalidation (don't write it yourself)

Wasp **auto-invalidates** query caches by shared entity. If an action and a
query both declare `entities: ["Task"]`, the query refetches after the action.
**Do not add `invalidateQueries` calls for entity-overlapping queries.**

Manual invalidation is only needed when:
- A query spans entities Wasp can't infer — declare ALL of them in `entities:`.
- You want optimistic updates (use `useAction`'s config).

When you do need manual control:
```ts
import { useQueryClient } from "@tanstack/react-query";  // NOT wasp/client/operations
const qc = useQueryClient();
qc.invalidateQueries({ queryKey: ["getTasks"] });
```
````

---

## 8. Conclusion

The skills were clearly written by someone who knows Wasp, and they correctly
steered the project-level decisions (Spec format, vertical layout, docs
protocol). Where they fell down was the **operational details an agent hits
when actually building**: migrations in non-interactive shells, the type
generation chicken-and-egg, which import path each hook lives at, and — most
expensively — the existence of automatic cache invalidation.

Closing the top 3 gaps (cache invalidation, non-interactive migrations, type
bootstrap) would have saved roughly 90 minutes on this build and produced
noticeably cleaner code (no redundant invalidation boilerplate). The remaining
items are quality-of-life improvements that compound over time.

The good news: every gap is a small, additive doc change. No structural rework
of the skills is needed — just more of the hard-won operational detail that
only surfaces from doing a real build.
