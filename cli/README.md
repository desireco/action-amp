# actionamp — prototype CLI

> **Throwaway.** This is the validation slice `docs/specs/cli-package.md` §Prototype
> calls for: pure Node, no deps, built to learn whether the transport and the
> loop feel right before committing to the typed/tested/`commander`-based
> package in real Phase 1. **Discard on lock** — the real `cli/` package replaces
> this file entirely.

## Prereqs

- Node 22+ (uses native `fetch`, `parseArgs`, `http`, `crypto`)
- The ActionAmp dev server running: `wasp start` from `webapp/` (web on :4000, API on :3001)
- `webapp/.env.client` with `REACT_APP_API_URL=http://localhost:3001` (without it, the `/cli/login` page can't reach the API cross-origin)

## The loop

1. **Log in** (the OAuth flow — no copy/paste of tokens):
   ```sh
   $ actionamp login --dev
   Opening browser to http://localhost:4000/cli/login?callback=…&state=…
   Waiting for authorization… (Ctrl+C to cancel)

     ← browser opens →
     ← if not logged in: redirects to /login, then back to /cli/login →
     ← "Authorize ActionAmp CLI?" page with a Confirm button →
     ← on click: mints a PAT via the mintCliToken action, redirects to callback →

   Signed in as zeljko@dakic.com.
   Token saved. Revoke it any time from Settings → Access tokens.
   ```
   `--dev` targets `localhost:3001` / `localhost:4000`. Default (no flag) is
   `api.actionamp.com` / `app.actionamp.com`.

2. **See your top task:**
   ```sh
   $ actionamp now
   Capture one real thing on your mind
   ```
   Empty pool → `Nothing on the table.` This is the same task `/app` shows.

3. **Capture a thought without breaking flow:**
   ```sh
   $ actionamp capture "fix the off-by-one in pagination #backend"
   Captured.
   ```

4. **Sign out:**
   ```sh
   $ actionamp logout
   Signed out.
   ```

## `--json` (for agents / scripting)

Every command emits JSON when asked. Useful for orchestration skills (Phase 2):

```sh
$ actionamp now --json
{"task":{"id":"…","description":"Capture one real thing on your mind","project":null,…}}

$ actionamp now --json   # nothing on the table
{"task":null,"reason":"no-candidates"}

$ actionamp capture "test" --json
{"ok":true,"id":"…","text":"test","createdAt":"…"}
```

Errors go to stderr as JSON too:

```sh
$ actionamp now --json    # not logged in
{"error":"Not logged in. Run: actionamp login"}
```

## How login works (under the hood)

The CLI is not a trusted token-issuer — only the authed browser can mint — so
the CLI asks the browser to do it, then receives the result via a localhost
callback (same pattern as `gh auth login`, `stripe login`, `vercel login`):

1. CLI spins up a one-shot `http.createServer` on a random high port.
2. CLI generates a `state` nonce (CSRF protection).
3. CLI opens the browser to `${webUrl}/cli/login?callback=http://localhost:<port>/callback&state=<state>`.
4. The `/cli/login` page (session-authed, explicit confirm) mints an `ApiKey`
   via the `mintCliToken` action, redirects the browser to the callback with
   `?token=…&state=<same state>`.
5. CLI receives the callback, validates `state` matches, stores the token in
   `~/.config/actionamp/config.json` (mode 0600), shuts down the server.

**Token storage** is unchanged from the PAT layer (Phase 0): SHA-256 hashed in
the `ApiKey` table, revocable from Settings → Access tokens. The OAuth flow is
purely a better delivery mechanism for that row.

## Config

`~/.config/actionamp/config.json`:
```json
{ "token": "aa_…", "apiUrl": "http://localhost:3001" }
```

Override origins with env vars:
- `ACTIONAMP_API_URL` — the API origin (default: prod `api.actionamp.com`, or `localhost:3001` with `--dev`)
- `ACTIONAMP_WEB_URL` — the web client origin where `/cli/login` lives (default: prod `app.actionamp.com`, or `localhost:4000` with `--dev`)

## What this prototype is for

The four steering questions (see `docs/specs/cli-package.md` §Prototype):
1. Does `now` pull you back into focus, or do you open the tab anyway?
2. Is one token per machine fine, or do you want per-context tokens?
3. Does `capture` from the terminal beat `⌘K` in the browser?
4. Does `--json` feel like a real constraint or an afterthought?

Answer those after a week of use → Phase 1's real scope.
