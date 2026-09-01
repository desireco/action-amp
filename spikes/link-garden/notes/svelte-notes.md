# web-svelte — Svelte client notes (spike deliverable)

## The typed client against a separate deployment — headline answer: YES

- `createRouterClient<Router>` from `typebase-io/client`, with the `Router`
  type imported from the api's generated `_generated/server.ts`, works
  against a **separate** service with zero co-location assumptions:
  `url` = base origin (the link appends `/rpc/...` itself — note: passing
  `/rpc` doubles the prefix), custom `fetch` adds `credentials: "include"`.
- **svelte-check: 0 errors** — full input/output inference flows from the
  backend's zod schemas through the Router type into the components.
  `type Link = Awaited<ReturnType<typeof client.links.list>>[number]` gave
  the whole UI its data types for free. This is the single best DX feature
  Typebase delivered in the spike.

## CORS reality (the finding that reshaped the architecture)

The bundle's better-auth **404s CORS preflights** and **415s non-JSON
content types**, so direct cross-origin browser auth is dead at 0.1.15 —
even with correct `trustedOrigins` and `BETTER_AUTH_URL` set. The working
pattern (standard practice anyway): a **dev proxy** — vite forwards `/api`
and `/rpc` to `:8080`, everything is same-origin, cookies are first-party.
Also: oRPC's `/rpc` CORS plugin exists but wasn't enough for the
cookie-auth combo.

## Numbers

| Metric | Value |
|---|---|
| `src/routes/+page.svelte` | ~470 lines (markup + styles) |
| `src/lib/api.ts` | 47 lines (typed client + 3 auth fetches) |
| Bundle (vite build, adapter-static SPA) | **~148 kB JS across chunks** + tokens CSS |
| svelte-check | 0 errors, 4 minor warnings (unused refs) |
| Install | bun (npm crashed twice on this machine; bun: 2.9s) |

## Verified in a real browser (Playwright)

Sign-up → session → ⌘K capture (`https://typebase.io #infra #spike`) →
server-fetched title rendered, tag chips, `new 1` count, stats header →
`K` keep → `new 0 / kept 1`. Session survives reload. Theme toggle works.
Dark mode via `[data-theme]` from tokens.css.

## DX

Runes (`$state`/`$derived`/`$effect`) made the optimistic updates
straightforward; the map-replace state updates are more ceremony than
Imba's direct mutation but everything behaved exactly as documented. No
compiler fights beyond one unused-var warning. Honest preference: **the
boring choice won decisively** — every minute went into the app, not the
toolchain.
