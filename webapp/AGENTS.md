# Wasp Knowledge

> Always-on Wasp reference for this project. The `.pi/skills/wasp*` skills have
> the deeper detail (dev-server, feature setup, deployment, troubleshooting
> table) — load them for those tasks. This file is for conventions you must
> follow on every edit.

This project uses **Wasp** — a batteries-included full-stack framework
(React + Node.js + Prisma). The Wasp app lives in `webapp/` (marked by
`webapp/.wasproot`).

## Skills (Pi)

- **`wasp`** (`/skill:wasp`) — core conventions, config-format detection, troubleshooting, common-mistake fixes. Load for any Wasp work.
- **`wasp-add-feature`** (`/skill:wasp-add-feature`) — add auth / email / database / styling.
- **`wasp-deploy`** (`/skill:wasp-deploy`) — deploy to Fly.io / Railway + pre-deploy checks.

## Documentation protocol

Wasp's API changes between versions. **Ground your knowledge against the docs
matching the project's version before any non-trivial Wasp work:**

1. Run `wasp version` (in `webapp/`) to get the installed CLI version.
2. Fetch the versioned docs map from `https://wasp.sh/llms-<VERSION>.txt`
   (root index: `https://wasp.sh/llms.txt`).
3. The map lists raw-markdown GitHub URLs for every section. **Fetch those
   `raw.githubusercontent.com` URLs directly** — don't scrape `wasp.sh/docs/...`
   HTML (JS-rendered, no clean content).
4. If anything in this file or in the skills conflicts with the fetched docs,
   **trust the docs** and tell the user the local notes may be stale.

## Config file format

How a Wasp app is configured depends on the version. **Detect before reading
docs or editing:**

- `main.wasp` → **Wasp DSL** (`< 0.24`), custom language (`app Name { ... }`). Legacy docs.
- `main.wasp.ts` → TypeScript, one of two flavors (the filename can't tell them apart — check the import):
  - **TS Config** (`< 0.24`): imports `wasp-config`, `new App(...)` + method calls. Legacy docs.
  - **Wasp Spec** (`>= 0.24`): imports `@wasp.sh/spec`, single `app({ ..., spec: [...] })` call. **← This repo.** General docs.

**This repo:** `webapp/main.wasp.ts` uses **Wasp Spec** on Wasp `^0.24.0`.

## Project structure

```
webapp/
├── .wasp/                 # Wasp output (auto-generated, do not edit)
├── public/                # Static assets
├── src/                   # Feature code: server operations.ts + client pages/components
├── main.wasp.ts           # Wasp config: routes, pages, auth, operations, jobs, etc.
└── schema.prisma          # Database schema (Prisma)
```

Organize code **vertically, per feature** (not per type):

```
src/tasks/{tasks.wasp.ts, TasksPage.tsx, operations.ts, TaskList.tsx}
```

Per-feature `*.wasp.ts` config files are a Wasp Spec feature (0.24+).

## Wasp TypeScript Spec (`main.wasp.ts`)

- Contains the Wasp version and the app specification.
- When it references your own app code, import from `src/` with
  `with { type: "ref" }`:
  - ✅ `import { getTasks } from "./src/tasks/operations" with { type: "ref" };`
  - ✅ `import { app, page, route } from "@wasp.sh/spec";`
- `route(name, ...)` and `crud(name, ...)` take an explicit name.
- Other constructors take no name argument; the declaration's name is the
  imported identifier. e.g. `job(sendReminder, { ... })` declares a job named
  `sendReminder`.
- `@wasp.sh/spec` is generated locally by Wasp (in `.wasp/spec/`) — **don't
  install it from npm.**

## Imports (in `src/` TypeScript files)

- ✅ `import type { User } from 'wasp/entities'`
- ✅ `import type { GetTasks } from 'wasp/server/operations'`
- ✅ `import { getTasks, createTask, useQuery } from 'wasp/client/operations'`
- ✅ `import { SubscriptionStatus } from '@prisma/client'` (Prisma enums)
- ✅ Local code: relative paths `import { X } from './X'`

## Operations

- ⚠️ Call actions directly with `async/await`. **Do NOT** use Wasp's `useAction`
  hook unless you specifically need optimistic updates.

## Database schema & migrations

- Changes to `schema.prisma` are **not** applied until you run a migration.
  Always use the `--name` flag:
  ```bash
  wasp db migrate-dev --name <descriptive-name>
  ```
- **Track pending migrations:** if Wasp runs as a background task, the user may
  miss the warning. Continue coding freely, but inform the user of pending
  migrations before they test/view the app, and offer to run them.
- Dev uses **SQLite** (zero-config). Production requires **PostgreSQL** — switch
  before the first prod build (the `wasp-deploy` skill's pre-deploy check flags
  this).

## Customization

**Do NOT** configure Vite, Express, React Query, Prisma client, etc. the "usual"
way. Wasp has its own mechanisms. Check the Project Setup & Customization docs
before adding custom config.

## Advanced features (built-in)

Custom HTTP API endpoints · background/cron jobs · type-safe links · websockets ·
middleware · email sending. See the Advanced Features docs.

## Verification

- Run `wasp compile` (in `webapp/`) to check if the app is valid.
- **Do not** run `tsc` directly for validation — Wasp generates types during compile.
- For local browser QA of authenticated pages, use the dev autologin URL:
  `http://localhost:4000/login?devEmail=zeljko%40dakic.com`. Swap the
  `devEmail` value to inspect as any local email identity. This is implemented
  by `src/auth/devAutologin.ts`, is registered as an unauthenticated Wasp action,
  and is server-guarded to `NODE_ENV === "development"`.

## Common mistakes (quick fixes)

| Symptom                                           | Fix                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `context.entities.X undefined`                    | Add the entity to `entities: [...]` in the config declaration                                              |
| Schema changes not applying                       | `wasp db migrate-dev --name <descriptive-name>`                                                            |
| Can't login after email signup (`Dummy` provider) | Check server logs for the verification link, or set `SKIP_EMAIL_VERIFICATION_IN_DEV=true` in `.env.server` |
| Wasp not recognizing changes                      | **WAIT PATIENTLY** — it recompiles. Re-run `wasp start` if needed.                                         |
| Persistent weirdness after restart                | `wasp clean && wasp start`                                                                                 |

Load the `wasp` skill for the full troubleshooting/dev workflow.
