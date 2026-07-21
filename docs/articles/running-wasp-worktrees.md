# Running parallel `wasp start` instances with git worktrees

> How we got parallel dev environments working with Wasp at Built by Dakic —
> what the framework does great, where it pushed back, and the worktree
> tooling we wrote to make two `wasp start`s live side by side.

## Why we picked Wasp

I run **Built by Dakic**, a small studio. We'd been watching Wasp for a
while — it's an open-source full-stack framework for React + Node + Prisma,
roughly "Laravel for JS." Built by a small team out of Croatia, went
through Y Combinator's **Winter 2021** batch (after applying three times,
which is its own good story), and these days it's at 15,000+ GitHub stars
with a fresh $3.7M seed in early 2025.

What pulled us in was the pace of innovation coming off the project. The
thing that actually made us commit was the **TypeScript config** — Wasp's
config used to be its own custom DSL (originally written in Haskell, of all
things), and they replaced it with a typed TypeScript spec. That was a big
deal for us: proper editor support, types all the way through, no second
language to hold in your head. So when we started ActionAmp — a new focus
app — we decided to give Wasp a real go on it.

The pitch, in case you haven't used it: you declare the high-level stuff —
auth, CRUD, async jobs, websockets, email — in one config file, and Wasp
generates the wiring. You write your React components and server
operations; it handles the plumbing every full-stack app needs and nobody
enjoys wiring twice. The parts that landed well for us:

- **Auth, out of the box.** Email, OAuth, social — declared, not stitched
  together from five libraries.
- **Type-safe full-stack RPC.** Call a server operation from the client and
  get end-to-end types, no fetch + serialization ceremony.
- **Prisma-first.** The schema is the source of truth; migrations are a
  first-class command, not an afterthought.
- **One repo, one build.** Client and server share types and deploy as a
  unit — no monorepo tooling tax.

Plenty of pleasant moments, genuinely. We shipped faster than we would have
rolling our own stack.

But — and this is the rest of the article — one thing kept biting us:
**running more than one `wasp start` at a time.** Parallel work, bug repro
in isolation, an agent grinding on a feature while we kept coding on main.
All the stuff you take for granted when the dev server is just `node
server.js`. With Wasp it's a real puzzle, and it's a puzzle because of the
very thing that makes the framework productive: it owns the build.

## The problem

Wasp generates your app into a build directory — `.wasp/`. That path is
**hardcoded**. There's no env var to relocate it; the compiler writes to
`.wasp/` relative to the project root, full stop (see `waspc/Project/Common.hs`,
and the open issues #4438 / #4471 tracking the lack of an override).

This is fine for one developer running one `wasp start`. It stops being
fine the moment you want a second instance:

- **Reproducing a bug** in isolation while your main server is mid-feature.
- **Reviewing a PR** without tearing down your working tree.
- **Running an agent in parallel** while you keep coding — the use case that
  actually forced us to solve this properly.

Two `wasp start` processes pointed at the same checkout will both read and
write the same `.wasp/` directory. They corrupt each other's generated
output. Node servers cross-talk. Vite picks up the wrong config. It fails
in confusing, nondeterministic ways — not with a clean "port in use" error.

Git worktrees solve the directory problem: each worktree is an independent
working directory sharing one `.git`. But a worktree alone only gets you
halfway. To run a *functional* second Wasp instance you also need:

1. A **separate `.wasp/`** — the worktree gives you this for free.
2. A **separate database** — otherwise both instances hammer the same
   Postgres DB and you can't tell which row belongs to which session.
3. **Separate ports** — both client and server, and they can't collide with
   each other *or* with whatever else is running on your machine.
4. **Inherited secrets** — Stripe keys, SMTP creds, OAuth. A dev worktree
   that can't process a payment isn't a real dev environment.

The rest of this article is how we nailed down all four.

## The three things Wasp hardcodes

Before the solution, the traps — because the whole exercise is steering
around these:

### 1. `.wasp/` is fixed

Covered above. This is the root cause. Everything else is consequence.

### 2. Wasp only injects `.env.client` into `import.meta.env`

We wanted the Vite dev server in each worktree on its own port. Vite reads
its port from `vite.config.ts`, which runs in Node — so it reads
`process.env`, not `import.meta.env`. Wasp injects `.env.client` variables
into `import.meta.env` (the client bundle), but **not** into
`process.env` (the config file's runtime).

Our `vite.config.ts`:

```ts
export default defineConfig({
  plugins: [wasp()],
  server: {
    open: false,
    // Env-driven so the isolated e2e worktree can run on :4100 alongside dev
    // on :4000 without colliding. Dev leaves VITE_PORT unset → 4000.
    port: Number(process.env.VITE_PORT ?? 4000),
  },
});
```

So the run command for a worktree has to put `VITE_PORT` in the **shell
environment**, not in `.env.client`:

```bash
cd ../action-amp-<name>/webapp && VITE_PORT=<client_port> wasp start
```

That `VITE_PORT=` prefix is load-bearing. Omit it and the client silently
falls back to 4000, which collides with the main checkout. The failure
mode is "my worktree's browser tab shows the main app" — which looks like a
caching bug until you realize the port never actually changed.

### 3. The server port lives in `.env.server` as `PORT=`

Wasp's Node server reads `PORT` from `.env.server`. So a worktree needs its
own `.env.server` with a different `PORT`, plus matching
`WASP_SERVER_URL` / `WASP_WEB_CLIENT_URL` so the client and server agree on
where to find each other.

## The design: one name drives everything

The key ergonomic decision: **you give the script one `<name>`, and it
derives everything else.** No flag soup.

| derived thing | value |
|---|---|
| worktree dir | `../action-amp-<name>` (sibling of the repo root) |
| branch | `dev/<name>` (based on local `main`) |
| database | `actionamp_<name>` (dashes → underscores; Postgres-safe) |
| server port | first free slot at/above 3500 |
| client port | server port + 1000 |

One slug in, a fully isolated environment out. Worktrees live as siblings
of the repo root (not inside it), so they're gitignored from each other and
from main.

```bash
bash webapp/scripts/dev-worktree.sh <name>           # create
bash webapp/scripts/dev-worktree.sh --remove <name>  # teardown
bash webapp/scripts/dev-worktree.sh --list           # all worktrees + ports + state
```

## How each of the four needs gets met

### Separate database

Each worktree gets its own Postgres database on the **same** local server —
no second Postgres instance, no Docker, no extra config. The script creates
`actionamp_<name>` via `psql`, then writes a `DATABASE_URL` pointing at it.

The name→database mapping deserves a note. Postgres unquoted identifiers
allow `[a-z0-9_]` only — no dashes. So a worktree named `billing-ui` uses
the directory `action-amp-billing-ui` and branch `dev/billing-ui`, but the
database is `actionamp_billing_ui`. Dashes become underscores only in the
DB name. (This mirrors a convention we already had for e2e.)

The script then runs `wasp db migrate-dev` against the fresh DB, so the
schema is there waiting — no manual migration step.

### Separate ports (dynamic, not a fixed pool)

This is the part that went through the most iteration. Our first attempt —
`worktree.sh`, now superseded — used a **fixed default**: client 4200,
server 4201, overridable with `--port`. That works for one extra worktree.
It breaks the moment you spin up a second, because nobody remembers which
ports are taken.

The current approach is **dynamic assignment**:

1. Collect every port claimed by existing worktrees by reading each one's
   `.env.server` `PORT=`. (Ground truth from the files, not from a registry
   the script maintains.)
2. Reserve the main checkout (3001) and the e2e worktree (3101) explicitly.
3. Walk up from a base port (3500) until both the server slot *and* the
   client slot (server + 1000) are free.
4. For each candidate, probe with `nc -z` to avoid landing on a port some
   unrelated service is actually bound to.

No cap. No coordination between agents. Each worktree just runs `create`
and gets a free pair. The client port is always server + 1000, so
uniqueness of one implies the other.

The `--list` command reads every worktree's env files and shows a live
table — name, branch, database, server port, client port, and a `STATE`
column that's `run` if the server port is currently bound (i.e. its
`wasp start` is up):

```
NAME             BRANCH         DATABASE                 SERVER   CLIENT   STATE
billing-ui       dev/billing-ui actionamp_billing_ui    3500     4500     run
triage-redesign  dev/triage-redesign actionamp_triage_redesign 3501 4501 -
```

That `STATE` column is surprisingly useful — it answers "did my background
`wasp start` actually survive?" without remembering a port.

### Inherited secrets

A worktree that can't talk to Stripe or send mail is a toy. So the script
doesn't generate a stub `.env.server` — it **inherits the main checkout's
`.env.server` verbatim**, then overwrites only the four keys it manages:

```bash
{
  # everything from main's .env.server EXCEPT these keys:
  grep -vEv '^(DATABASE_URL|WASP_WEB_CLIENT_URL|WASP_SERVER_URL|PORT|VITE_PORT)=' "$MAIN_ENV"
  # …then the worktree's own values:
  echo "DATABASE_URL=postgresql://$PG_USER@$PG_HOST:$PG_PORT/$DB_NAME"
  echo "WASP_WEB_CLIENT_URL=http://localhost:$CLIENT_PORT"
  echo "WASP_SERVER_URL=http://localhost:$SERVER_PORT"
  echo "PORT=$SERVER_PORT"
} > "$WT_WEBAPP/.env.server"
```

Stripe keys, SMTP creds, OAuth secrets, `SKIP_EMAIL_VERIFICATION_IN_DEV` —
all carried over. The worktree behaves like the main app, just on a
different port and DB. This was a deliberate choice: we wanted worktrees to
be fully functional dev environments, not partially-clobbered stubs.

## Create never clobbers

A subtle but important property: re-running `create` on an existing
worktree **doesn't destroy it**. It detects the existing directory, prints
its status + run command, and exits. Uncommitted work is safe.

This is the opposite of what our e2e setup does — `e2e-setup.sh` runs
`reset --hard` because e2e is throwaway and you want a clean slate every
time. Dev worktrees are the opposite: you might have days of uncommitted
work in one, and a careless re-run must not blow it away.

## From inside a worktree: teardown + sync

The first version of the tooling only had create/remove, both run **from
main**. In practice you're usually standing *inside* the worktree when you
want to tear it down or pull in the latest main. So we added two companion
scripts that introspect the current tree — no name needed:

```bash
bash webapp/scripts/worktree-teardown.sh          # remove the worktree you're in
bash webapp/scripts/worktree-sync.sh              # rebase this branch onto latest main
```

### Teardown

Detects the worktree you're standing in, shows what it'll remove (dir +
branch + dedicated DB), asks for confirmation, then tears it all down. Two
safety rails worth calling out:

- **Never drops reserved databases.** `actionamp_dev` (the main checkout's
  shared dev DB) and `actionamp_e2e` are on a permanent no-touch list. A
  typo'd name can't take them out.
- **Never deletes `main`/`master`.** Even if you somehow stood in a
  worktree on a main branch.

One honest limitation: a child process can't change its parent shell's
`cwd`, so after removing the worktree the script *prints* the `cd` back to
main. If you want the cd for free, `source` it instead of `bash`-ing it —
the sourced path changes the caller's directory on success.

### Sync

Rebases the current branch onto the latest `main`. The interesting part is
**how it updates main without checking it out** — checking out `main` in a
worktree would fight the worktree's branch, and git refuses it anyway. The
trick is `git update-ref`:

```bash
# fast-forward local main to origin/main, without checking it out
git update-ref refs/heads/main "$MAIN_REMOTE"
```

`update-ref` only moves the branch pointer forward (it guards with
`merge-base --is-ancestor` first), so it can't accidentally rewind or
diverge. Then the rebase layers your work on top.

The conflict policy is deliberately conservative: **stop and let you
resolve**. On conflict the script prints next-step hints and exits non-zero.
It never auto-aborts, never force-resets. You fix the conflicts in your
editor, then `--continue` (or plain `git rebase --continue`). A `--push`
flag pushes the rebased branch; `--autostash` stashes dirty changes (e.g.
lockfiles churned by a fresh `npm install`) around the rebase.

## The Wasp-specific gotchas, condensed

If you're adapting this to your own Wasp project, these are the things
that'll bite you:

1. **Two `wasp start`s in one dir corrupt `.wasp/`.** Use a worktree.
   There's no env override for the output dir (yet — track #4438/#4471).
2. **`VITE_PORT` must be in the shell env, not `.env.client`.** Wasp
   injects `.env.client` into `import.meta.env`, not `process.env`. Vite's
   config reads `process.env`. The `VITE_PORT=` prefix on the run command
   is not decorative.
3. **Browser routes are served by the client port, not the server port.**
   `/login` and the rest of the UI come from Vite on the *client* port
   (server + 1000). Pointing your browser at the server port gets you the
   API, not the app.
4. **`wasp start` orphans its children on plain Ctrl+C.** Nodemon → node
   server, and Vite, can survive and keep holding the ports. Verify with
   `--list` (the `STATE` column) after stopping, and kill strays by PID.
5. **Cold start is slow — budget 2–3 minutes.** `npm install` + Wasp
   compile + Prisma migrate + SDK build. This is Wasp's normal first-start
   cost, not the worktree script.

## What we'd do differently

The tooling is working well, but a few rough edges remain:

- **The `VITE_PORT` shell-env requirement is a footgun.** The "right" fix
  is for Wasp to inject `.env.client` into `process.env` during Vite config
  evaluation (or expose a dedicated escape hatch). Until then, the run
  command has to carry the prefix, and forgetting it fails silently.
- **Orphan databases are easy to accumulate.** If you `git worktree remove`
  by hand instead of via the script, the dedicated DB stays on the Postgres
  server forever. The `--remove` path handles this, but nothing stops a
  manual cleanup from skipping it. A periodic `--list`-style "DB audit"
  (DBs without a matching worktree) would catch the orphans.
- **`nc` (netcat) is optional but recommended.** Without it, the script
  still keeps worktree ports unique via env-file scanning, but it can't see
  ports claimed by unrelated services. macOS ships `nc` by default, so this
  rarely bites — but it's a silent degradation, not a loud one.

## The takeaway

Git worktrees are a standard tool, but running a **second full-stack Wasp
dev instance** is not the standard worktree workflow. The Wasp-specific
friction — the hardcoded `.wasp/`, the `.env.client` vs `process.env`
split, the `PORT=`/`WASP_*_URL` coupling — means "just use a worktree"
isn't enough on its own. You need a script that treats the worktree as a
full environment: directory *and* database *and* ports *and* secrets.

The payoff is real. On ActionAmp we routinely have the main checkout,
an e2e worktree, and one or two feature worktrees running side by side —
each a fully functional dev environment, zero coordination needed. Spin
one up, do the work, tear it down. The isolation makes parallel work
trivial, which makes the whole team (humans and agents) faster.

The scripts live in `webapp/scripts/` (`dev-worktree.sh`,
`worktree-teardown.sh`, `worktree-sync.sh`), and the full reference is in
[`docs/DEV-WORKTREES.md`](../DEV-WORKTREES.md). They're ActionAmp-specific
in their conventions (the `action-amp-` prefix, the reserved DBs, the port
range) but the pattern — derive everything from one name, inherit secrets,
assign ports dynamically, clean up all three artifacts — generalizes to any
Wasp project.
