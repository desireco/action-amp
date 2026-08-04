# actionamp — terminal client

> One task, the next one that matters — from the terminal. The CLI mirrors the
> web app's decision loop (now → done → next) and gives agents a `--json`
> machine interface.

## Pro access

The CLI and personal API tokens are included with Pro and Founding membership.
Free accounts cannot authorize the CLI or use existing CLI tokens. Upgrade in
ActionAmp under **Settings → Billing**, then run `actionamp login` again.

## Install (local dev)

```sh
cd cli && npm install
```

Run via `tsx` (no build step) or build to `dist/`:

```sh
npx tsx src/index.ts --help          # dev
npm run build && ./dist/index.js     # built
```

## Commands

| Command | What it does |
|---|---|
| `login [--dev]` | OAuth browser login (default: prod; `--dev` → localhost) |
| `now` | Print your top task (same one `/app` shows) |
| `capture "<text>"` | Quick-capture to inbox (NL parsing: `#project @date !priority`) |
| `today [--done]` | Today's committed tasks (`--done` → completed today) |
| `task show <id>` | Show a single task |
| `task start <id>` | Start a task (sets it as focused) |
| `task pause <id>` | Pause the focused task |
| `task done <id> [--outcome <text>]` | Mark a task done |
| `task snooze <id> [--preset <p>]` | Snooze (presets: `1h\|3h\|tomorrow\|weekend\|someday`) |
| `task move <id> --to <list>` | Move (today, upcoming, someday) |
| `inbox list` | Show unprocessed inbox items |
| `inbox triage <id> --decision <d>` | Triage an inbox item |
| `lens list` | List your lenses (active one marked) |
| `lens show <id\|name>` | Show a single lens (by id or name) |
| `lens switch <id\|name>` | Set the active lens — `now` / `project list` / `goal list` / `logbook` / `inbox triage` then scope to it without `--lens-id` |
| `lens current` | Show the active lens |
| `project list --lens-id <id>` | List projects in a lens, with saved resources |
| `project show <id>` | Show a project and its resources |
| `project create <name> --lens-id <id>` | Create a project |
| `project add-task <desc> --lens-id <id>` | Add a task to a project/lens |
| `resource list --project <id>` | List a project's links and notes |
| `resource add <title> --project <id> [--url <url>] [--notes <text>]` | Add project reference material |
| `resource update <id> [--title <text>] [--url <url>] [--notes <text>]` | Change a resource (`""` clears URL/notes) |
| `resource delete <id>` | Remove project reference material |
| `goal list --lens-id <id>` | List goals in a lens |
| `goal show <id>` | Show a goal |
| `goal create <name> --lens-id <id>` | Create a goal |
| `logbook [--lens-id <id>]` | Completed tasks, finished projects/goals, archived |
| `whoami` | Show the logged-in account |
| `logout` | Clear the saved token |

Every command supports `--json` for scripting / agent orchestration.

`capture` also accepts shared-content fields: `--title`, `--content`,
`--source-url`, and `--file <image>`. One JPEG, PNG, GIF, WebP, HEIC, or HEIF
image up to 5 MB may be attached. Project resources remain links + notes; they
do not upload files.

## `--json` output shapes

```
now          → { task: {...} | null, reason?: "no-lens" | "no-candidates" }
capture      → { ok: true, id, text, createdAt }
today        → { tasks: [...] }
task done    → { id, isDone, completedAt, ... }
task snooze  → { id, status, dueDate }
inbox list   → { items: [...] }
lens list    → { lenses: [{ id, name, kind, color, purpose, counts }] }
lens show    → { lens: {...} | null }
lens switch  → { ok: true, id, name }
lens current → { lens: {...} | null }
project list → { projects: [...] }
logbook      → { tasks: [...], projects: [...], goals: [...], archived: [...] }
whoami       → { user: { id, email, fullName, plan } }
```

Errors (in `--json` mode): `{ error: "<message>" }` to stdout, exit code 1.

## Active lens

`lens switch <id|name>` stores the active lens in config
(`~/.config/actionamp/config.json`). Subsequent lens-scoped commands — `now`,
`project list/create/add-task`, `goal list/create`, `logbook`, `inbox triage`
— use it automatically when no `--lens-id` flag is passed. An explicit
`--lens-id` always overrides. There is no server-side active lens; each CLI
install tracks its own (mirrors the web app's `localStorage["aa-lens-id"]`).
`today` stays global by design (the cross-lens view). `lens current` shows
what's active; `lens list` marks it with `← active`.

## How login works

The CLI is not a trusted token-issuer — only the authed browser can mint — so
the CLI asks the browser to do it, then receives the result via a localhost
callback (same pattern as `gh auth login`):

1. CLI spins up a one-shot HTTP server on a random port.
2. CLI opens the browser to `/cli/login?callback=…&state=<nonce>`.
3. The page (session-authed, explicit confirm) mints an `ApiKey` via the
   `mintCliToken` action, redirects to the callback.
4. CLI validates the `state` nonce, stores the token in
   `~/.config/actionamp/config.json`.

`--dev` targets `localhost:3001` (API) + `localhost:4000` (web). Default is
`api.actionamp.com` + `app.actionamp.com`. The server choice is remembered at
login time — `now`/`capture`/etc. don't need `--dev`.

## Config

`~/.config/actionamp/config.json`:
```json
{ "token": "aa_…", "apiUrl": "http://localhost:3001" }
```

Override origins with env vars: `ACTIONAMP_API_URL`, `ACTIONAMP_WEB_URL`.

## Architecture

- **CLI package** (`cli/`): standalone, ESM, TypeScript 5.7, `commander` +
  `chalk`. No dependency on the webapp's build — talks to the API via HTTP.
- **Backend routes** (`webapp/src/auth/patRoutes.ts`): `/api/cli/*` routes,
  each behind `patRouteMiddleware` (Bearer PAT auth). Delegate to pure cores.
- **Pure cores** (`webapp/src/*/operationsCore.ts`): the shared logic between
  the Wasp operations (browser) and the CLI routes. No duplicated logic.
- **OAuth page** (`webapp/src/auth/CliLoginPage.tsx`): the browser half of
  `login` — explicit consent, mints via the `mintCliToken` action.

## Tests

```sh
cd cli && npm test          # 55 unit tests (mocks request, no real HTTP)
cd webapp && npm test       # backend tests (op cores + route handlers)
```
