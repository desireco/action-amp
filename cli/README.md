# actionamp — prototype CLI

> **Throwaway.** This is the validation slice `docs/specs/cli-package.md` §Prototype
> calls for: ~150 lines of pure Node, no deps, built to learn whether the transport
> and the loop feel right before committing to the typed/tested/`commander`-based
> package in real Phase 1. **Discard on lock** — the real `cli/` package replaces
> this file entirely.

## Prereqs

- Node 22+ (uses native `fetch` + `parseArgs`)
- The ActionAmp dev server running: `wasp start` from `webapp/` (API on :3001)

## Setup

```sh
# From the repo root. Node 23.6+ strips types by default; 22 needs the flag.
alias actionamp="node --experimental-strip-types $(pwd)/cli/actionamp.ts"

# Or just call it directly each time:
NODE='node --experimental-strip-types'
```

## The loop

1. **Issue a token** in the app: Settings → Access tokens → label `laptop` →
   Issue → copy the `aa_…` plaintext (shown once).

2. **Log in:**
   ```sh
   $ actionamp login
   Paste your token (from Settings → Access tokens): aa_…
   Signed in. API: http://localhost:3001
   ```
   `login` validates the token by hitting `/api/cli/now` — if the token is
   wrong or revoked, it refuses to save.

3. **See your top task:**
   ```sh
   $ actionamp now
   Ship the auth refactor · in ProjectX
   ```
   Empty pool → `Nothing on the table.` This is the same task `/app` shows.

4. **Capture a thought without breaking flow:**
   ```sh
   $ actionamp capture "fix the off-by-one in pagination #backend"
   Captured.
   ```
   NL parsing (dates, priorities, tags, projects) is identical to the web `⌘K`.

5. **Sign out:**
   ```sh
   $ actionamp logout
   Signed out.
   ```

## `--json` (for agents / scripting)

Every command emits JSON when asked. Useful for orchestration skills (Phase 2):

```sh
$ actionamp now --json
{"task":{"id":"…","description":"Ship the auth refactor","project":{"name":"ProjectX"},…}}

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

## Config

`~/.config/actionamp/config.json`:
```json
{ "token": "aa_…", "apiUrl": "http://localhost:3001" }
```

Override the API URL with `ACTIONAMP_API_URL=https://api.actionamp.com` (prod).

## What this prototype is for

The four steering questions (see `docs/specs/cli-package.md` §Prototype):
1. Does `now` pull you back into focus, or do you open the tab anyway?
2. Is one token per machine fine, or do you want per-context tokens?
3. Does `capture` from the terminal beat `⌘K` in the browser?
4. Does `--json` feel like a real constraint or an afterthought?

Answer those after a week of use → Phase 1's real scope.
