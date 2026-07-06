# Wasp Research — Can we build the ActionAmp API with wasp.sh?

> Verdict: **Yes. Proceed.** Wasp is a strong fit. The "API" is Operations
> (RPC + full-stack types) by default, with escape hatches to raw HTTP when needed.
> Sources: wasp.sh docs (v0.24), pulled `2026-06-15`. (The raw doc copies that
> lived at `docs/wasp-ref/` were removed 2026-07-05 — the project's `wasp` skill
> and `webapp/AGENTS.md`'s documentation protocol are the live grounding source.)

## 1. What Wasp is
- **Spec-driven full-stack framework.** You write a `main.wasp.ts` spec (new TS-based format, replaces the old `.wasp` DSL) + `schema.prisma` + your TS in `src/`. A **compiler** reads the spec and generates client + server + glue code.
- **Stack under the hood:** React (Vite) on the client, Node.js/Express on the server, **Prisma** for the DB.
- Built-in batteries: auth (UI + flows), email, async jobs, websockets, cron, env vars, deployment targets. You get them by declaring them in the spec.

## 2. What "the API" means in Wasp (the core question)
There are **three** ways to expose server-side logic, in order of how much Wasp does for you:

### a) Operations = the default, primary API
- **Queries** (read) and **Actions** (write). Plain Node functions you declare in the spec.
- Wasp generates the HTTP route, the client function, and **full-stack types** — call an Action from React like a normal async fn, types flow end-to-end.
- Built on **React Query**: caching, and **automatic cache invalidation** keyed on which Entities an Action/Query touches (an Action touching `Task` invalidates any Query also touching `Task`). No manual cache plumbing.
- This is how ~95% of ActionAmp's API should look: capture an item, complete an item, fetch "what next", etc.

```ts
// main.wasp.ts
import { action, app, query } from "@wasp.sh/spec"
import { captureItem, getNext } from "./src/items/operations" with { type: "ref" }
export default app({
  spec: [
    action(captureItem, { entities: ["Item"] }),
    query(getNext, { entities: ["Item"] }),
  ],
})

// src/items/operations.ts
import { type CaptureItem, type GetNext } from "wasp/server/operations"
export const captureItem: CaptureItem<{ title: string }> = async (args, context) => {
  return context.entities.Item.create({ data: { title: args.title, userId: context.user.id } })
}
```

```tsx
// client
import { useQuery, getNext } from "wasp/client/operations"
const { data } = useQuery(getNext)
```

### b) Custom HTTP API endpoints (`api` spec) — the escape hatch
- Tie a Node fn (Express `req, res, context`) to a specific **METHOD + path**, e.g. `api("POST", "/webhooks/stripe", handler)`.
- No client helpers, but you get `wasp/client/api` (a `ky` instance pre-wired with base URL + auth). Must handle CORS yourself (via `apiNamespace` middleware).
- **Use cases for ActionAmp:** webhooks, external integrations, and **streaming responses** (e.g. an AI "suggest what to do next" stream) — the docs explicitly show an OpenAI streaming example.

### c) Direct Prisma client (`wasp/server`)
- `import { prisma } from "wasp/server"` for anything Wasp's abstractions don't cover. Server-only.

## 3. Data model
- Prisma `schema.prisma`. A `model User {}` is a Wasp **Entity**; import its type via `wasp/entities`.
- **DB:** SQLite is the dev default (zero config) → switch to **PostgreSQL** for prod (`wasp db migrate-dev` creates migrations; commit `migrations/`). `wasp start db` spins a Postgres dev DB via Docker.
- Seed functions via `db.seeds`.

## 4. Auth
- Declared in the spec (`auth.methods`, `auth.userEntity`, `auth.onAuthFailedRedirectTo`). Auth UI components included. Covers username/password, email, social OAuth.

## 5. Requirements & setup
- **Node >= 24.14.1 required.** ⚠️ Current on this machine is **24.1.0** — must upgrade (mise is installed; upgrade node).
- Install CLI: `npm i -g @wasp.sh/wasp-cli@latest`
- Create: `wasp new actionamp` (prompts for template)
- Run: `wasp db migrate-dev` then `wasp start` (frontend :3000, backend :3001)
- **Starter templates:** `basic` (common examples), `minimal` (one page, from scratch), `saas` (OpenSaaS: auth + Stripe + OpenAI + Tailwind + cron).

## 6. Agent support (useful for me)
- Official **Wasp agent skills plugin**: `npx skills add wasp-lang/wasp-agent-plugins` then `/wasp-plugin-init` injects idiomatic-Wasp knowledge into the agent's memory. Recommended before we start writing Wasp code.

## 7. Fit assessment for ActionAmp
| Need | Wasp support | Notes |
|---|---|---|
| Capture items (CRUD) | ✅ Operations + Prisma | Trivial |
| User-owned data / auth | ✅ Built-in auth | `authRequired` per route |
| "What next" logic | ✅ Queries / Actions | Pure server fn, can rank/filter |
| Multi-device sync (later) | ✅ Websockets built-in | |
| Reminders / daily reset (later) | ✅ Jobs + cron | |
| AI suggestions (later) | ✅ Streaming `api` | OpenAI example in docs |
| Deploy | ✅ Deploy targets | |

## 8. Trade-offs / risks to acknowledge
- **Opinionated & coupled:** the API is RPC-over-HTTP via Operations, not REST. It's tightly bound to the generated client. If we later need a *pure* REST API for a 3rd-party / mobile, we'd use the `api` escape hatch or call operations server-side. Not a blocker for an internal-ish app, worth knowing.
- **Lock-in to the compiler:** generated code; harder to eject than a plain Express app. Wasp is OSS and actively maintained.
- **TS spec (`main.wasp.ts`) is recent (0.24).** Stable but newer than the old DSL — minor bleeding-edge risk.
- **Node version must move to 24.14.1+.**

## 9. Recommended next steps
1. Upgrade Node to >=24.14.1 via mise (blocker for the CLI).
2. `npm i -g @wasp.sh/wasp-cli@latest`
3. Install the Wasp agent skills plugin (`npx skills add wasp-lang/wasp-agent-plugins`, init it) so the agent codes Wasp idiomatically.
4. Scaffold: `wasp new actionamp -t basic` (or `minimal` if we want zero example noise). Decide auth method.
5. Define the `Item` entity + first Operations (`captureItem`, `getNext`) to validate the loop end-to-end.
6. Then iterate on the real product question: **what is the "what next" algorithm?**

## 10. Open decisions (need your call)
- **Template:** `basic` / `minimal` / `saas`? (I lean `basic`.)
- **Auth:** username+password / email / social?
- **Node upgrade:** OK to bump via mise now?
