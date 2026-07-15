# Dev worktrees — isolated, parallel Wasp instances

> Reference for `webapp/scripts/dev-worktree.sh`. Read this before spinning up
> a worktree for development or for distributing work across parallel agents.

## What it solves

Two `wasp start` instances can't run in the same checkout — they corrupt the
shared `.wasp/` output dir (hardcoded path, no env override; waspc
`Project/Common.hs`, GH #4438/#4471). The fix is a **git worktree** per
instance: each gets its own working dir, `.wasp/`, `node_modules/`, and — via
this script — its own **database** on the shared local Postgres and its own
**port pair**, so multiple dev servers run side by side with zero collisions.

One `<name>` drives everything:

| derived thing | value |
|---|---|
| worktree dir | `../action-amp-<name>` (sibling of the repo root) |
| branch | `dev/<name>` (based on local `main`) |
| database | `actionamp_<name>` (dashes → underscores; Postgres-safe) |
| server port | first free slot at/above 3500 |
| client port | server port + 1000 |

Main checkout (`:3001` server / `:4000` client / `actionamp_dev`) and the e2e
worktree (`:3101` / `:4100` / `actionamp_e2e`) are reserved and never reused.

## Commands

```bash
bash webapp/scripts/dev-worktree.sh <name>            # create (auto-picks ports)
bash webapp/scripts/dev-worktree.sh --remove <name>   # teardown: worktree + branch + db
bash webapp/scripts/dev-worktree.sh --list            # all worktrees + ports + state
bash webapp/scripts/dev-worktree.sh --help
```

Create takes ~2–3 min cold (`wasp install` + compile + migrate + SDK build).
Teardown is seconds. `--list` shows a `STATE` column: `run` if the worktree's
server port is currently bound (i.e. its `wasp start` is up), else `-`.

### From inside a worktree: teardown + sync

The companion scripts run **from inside a worktree** (no name needed — they
introspect the current tree) and work regardless of which creator made it:

```bash
bash webapp/scripts/worktree-teardown.sh          # remove the worktree you're in (dir + branch + DB), then it tells you how to cd back to main
bash webapp/scripts/worktree-teardown.sh --force  # no confirmation prompt
bash webapp/scripts/worktree-sync.sh              # fetch + fast-forward main + rebase this branch onto it (default)
bash webapp/scripts/worktree-sync.sh --push       # …then push the branch to origin
bash webapp/scripts/worktree-sync.sh --autostash  # …stash dirty changes around the rebase (e.g. churned lockfiles)
bash webapp/scripts/worktree-sync.sh --continue   # after you've resolved rebase conflicts
bash webapp/scripts/worktree-sync.sh --abort      # give up on the in-progress rebase
```

**Teardown** confirms first (shows branch/DB/dirty files), never drops
reserved DBs (`actionamp_dev`, `actionamp_e2e`), never deletes `main`/`master`.
A child process can't change your shell's cwd, so it prints the `cd` back to
main; to get the cd for free, `source` it instead of `bash`-ing it.

**Sync** rebases onto main by default (linear history). On conflict it **stops
and lets you resolve** — never auto-aborts, never force-resets. Resolve in your
editor, then `--continue` (or `git rebase --continue`), optionally `--push`.

## The contract the script enforces

- **Port assignment is dynamic, not a fixed pool.** It scans every existing
  worktree's `.env.server` `PORT=` and probes live-bound ports (`nc -z`), then
  walks up from 3500 until both server and client slots are free. No cap, and
  it won't collide with non-worktree services that happen to be bound.
- **The worktree's `.env.server` inherits the main checkout's secrets**
  (Stripe, SMTP, OAuth) verbatim — only `DATABASE_URL` and port vars are
  rewritten. A dev worktree is fully functional, not a stub.
- **Create never clobbers.** Re-running on an existing worktree prints its
  status + run command and exits. Uncommitted work is safe. (Contrast:
  `e2e-setup.sh` does `reset --hard` because e2e is throwaway.)
- **`--remove` drops all three artifacts** — worktree, branch, and database.
  Orphan DBs on the shared server are the easy-to-miss part; this handles it.

## Agent guidance — when and how to use this

**Use it when** you need to run a second `wasp start` alongside the main
checkout: parallel feature work, reproducing an issue in isolation, or
distributing independent tasks across multiple agent sessions. Each worktree
is a fully independent dev environment.

**Don't use it for** single-instance dev (just run `wasp start` in
`webapp/`), or for e2e (that has its own `e2e-setup.sh` with dummy secrets).

**The run command is the one create prints — copy it verbatim.** The
`VITE_PORT=` prefix is load-bearing: `vite.config.ts` reads it from
`process.env`, and Wasp only injects `.env.client` into `import.meta.env`, not
`process.env`. Omit it and the client silently falls back to 4000, colliding
with the main checkout.

```bash
cd ../action-amp-<name>/webapp && VITE_PORT=<client_port> wasp start
```

**Inspection uses the worktree's own client port**, not 4000. Browser-facing
routes (the UI, including `/login`) are served by the Vite client, so use the
**client** port — never the API/server port. The dev autologin route
(see `AGENTS.md` §"Agent browser access") works on any instance — just swap
the port:

```
http://localhost:<client_port>/login?devEmail=zeljko%40dakic.com
```

**Cleanup is part of the task.** When the work is done or the worktree is no
longer needed, run `--remove`. Do not leave orphan worktrees, branches, or
databases on the shared Postgres — they accumulate and the port/DB namespace
is finite. If you only need to stop the server, kill the `wasp start` process
(see caveat below); reserve `--remove` for tearing the worktree down for good.

**Distributing work across agents:** give each agent a distinct `<name>`
(usually the feature or branch slug) and have it create its own worktree. The
script's port auto-assignment means agents don't need to coordinate ports —
each just runs create and gets a free pair. `--list` is the shared view of
what's out there.

## Caveats

- **Process-tree kill.** `wasp start` spawns children (nodemon → node server,
  vite) that it can orphan on a plain Ctrl+C — they keep holding the ports.
  When stopping manually, verify the ports are actually freed
  (`bash webapp/scripts/dev-worktree.sh --list`, or `nc -z 127.0.0.1 <port>`),
  and kill strays by PID if needed. In an agent harness, stopping the
  background task usually takes the whole tree; confirm with `--list`.
- **Cold start is slow.** Budget ~2–3 min from create to a reachable server
  (npm install + Wasp compile + Prisma migrate + SDK build). This is Wasp's
  normal first-start cost, not the script.
- **`nc` optional but recommended.** Live-port probing needs `nc` (netcat,
  present on macOS by default). Without it, the script still keeps worktree
  ports unique via env-file scanning, but can't avoid a slot some unrelated
  service is bound to.
- **Worktrees are siblings of the repo root** (`../action-amp-<name>`), not
  inside it. They're gitignored from each other and from main.

## Config (override via env)

| var | default | purpose |
|---|---|---|
| `DEVWT_PG_USER` | `jake` | Postgres user (must have CREATE/DROP DATABASE) |
| `DEVWT_PG_HOST` | `localhost` | Postgres host |
| `DEVWT_PG_PORT` | `5432` | Postgres port |
| `DEVWT_PORT_BASE` | `3500` | server port range start; client = server + 1000 |
