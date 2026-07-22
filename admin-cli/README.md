# actionamp-admin — admin terminal client

> The admin half of ActionAmp's terminal surface. Restricted to admin accounts:
> triages in-app feedback and (later) other admin ops. Separate codebase +
> separate token store from the user CLI (`cli/`); the two can coexist on one
> machine.

This CLI exists so admins can read + triage user feedback from the terminal
without an in-app admin view. Users still submit feedback exactly as before
(loudspeaker → modal); nothing about the submit flow changed.

## Install (local dev)

```sh
cd admin-cli && npm install
```

Run via `tsx` (no build step) or build to `dist/`:

```sh
npx tsx src/index.ts --help          # dev
npm run build && ./dist/index.js     # built
```

## Commands

| Command | What it does |
|---|---|
| `login [--dev]` | OAuth browser login — **rejects non-admin accounts** |
| `whoami` | Show the logged-in admin account |
| `feedback list [--status <s>] [--limit <n>]` | List feedback, newest first |
| `feedback show <id>` | Show one feedback row in full |
| `feedback status <id> <status>` | Set triage state (`OPEN\|IN_PROGRESS\|RESOLVED\|CLOSED`) |
| `logout` | Clear the saved admin token |

Every command supports `--json` for scripting / agent orchestration.

## `--json` output shapes

```
whoami           → { user: { id, email, fullName, plan, isAdmin } }
feedback list    → { feedback: [ { id, status, message, userEmail, ... } ] }
feedback show    → { feedback: { id, status, message, ... } }
feedback status  → { feedback: { id, status, ... } }
```

Errors (in `--json` mode): `{ error: "<message>" }` to stdout, exit code 1.

## How login works (and the admin gate)

Same OAuth browser flow as the user CLI (`gh auth login` pattern), with one
difference — the admin gate runs at the end:

1. CLI spins up a one-shot HTTP server on a random port.
2. CLI opens the browser to `/cli/login?callback=…&state=<nonce>`.
3. The page (session-authed, explicit confirm) mints an `ApiKey` via the
   `mintCliToken` action, redirects to the callback.
4. CLI validates the `state` nonce, then calls `/api/cli/whoami` to read
   `isAdmin`. **If the account is not an admin, the token is discarded** —
   nothing is written to config, and login fails with a clear message.
5. Only admin tokens are stored.

The stored config is **separate** from the user CLI's
(`~/.config/actionamp-admin/`, not `~/.config/actionamp/`), so an admin + a
user session can coexist, and revoking one never affects the other.

`--dev` targets `localhost:3001` (API) + `localhost:4000` (web). Default is
`api.actionamp.com` + `app.actionamp.com`. The server choice is remembered at
login time — subsequent commands don't need `--dev`.

## Config

`~/.config/actionamp-admin/config.json`:
```json
{ "token": "aa_…", "apiUrl": "http://localhost:3001" }
```

Override origins with env vars: `ACTIONAMP_API_URL`, `ACTIONAMP_WEB_URL`.

## Architecture

Mirrors the user CLI's four-layer split, fully duplicated (no shared code):

- **CLI package** (`admin-cli/`): standalone, ESM, TypeScript 5.7, `commander`
  + `chalk`. No dependency on the webapp's build — talks to the API via HTTP.
- **Backend routes** (`webapp/src/auth/patRoutes.ts`): the three
  `/api/cli/feedback/*` routes, behind `patRouteMiddleware` (Bearer PAT auth)
  and an admin gate (`req.patUser.isAdmin`, 403 otherwise).
- **Pure core** (`webapp/src/feedback/operationsCore.ts`): the shared logic
  between the in-app submit action and the feedback routes.
- **OAuth page** (`webapp/src/auth/CliLoginPage.tsx`): the browser half of
  `login` — same page the user CLI uses.

## Tests

```sh
cd admin-cli && npm test     # unit tests (mocks request, no real HTTP)
cd webapp && npx vitest run src/feedback   # feedback core + op tests
```
