# Wasp dev-server log analysis

Source: single `wasp start` session log, 5,813 lines.

## Headline numbers

| Metric | Count |
|---|---|
| nodemon **app crashes** | **8** |
| Wasp **compile failures** ("failed to compile") | **25** |
| Recompile **failures** | 16 |
| Recompile **successes** | 40 |
| Successful compiles | 40 of 56 attempts (71%) |
| nodemon restarts | 63 |
| npm installs | 65 |
| DB setups | 64 |
| Prisma schema-drift warnings | 23 |
| `npm warn "allow-scripts"` (env + user) | **389** (197 + 192) |
| HTTP requests served | 676 |
| HTTP 5xx responses | 12 |
| HTTP 4xx responses | 19 |

## What actually crashed (3 distinct root causes)

### 1. TypeScript type errors → compile failure → nodemon crash (dominant)

Eight crashes, all the same shape: save a file → Wasp recompiles → `tsc`
fails with code 2 → `bundle-and-start` aborts → nodemon parks. Recurring
offenders by file:

```
150 errors  src/tasks/TaskDetailPage.tsx       — Property 'id'/'isDone'/'length' on {}
126 errors  src/projects/ProjectDetailPage.tsx
 81 errors  src/goals/GoalDetailPage.tsx
 54 errors  src/admin/AdminPage.tsx
 39 errors  src/inbox/TriagePage.tsx
```

The `Property 'X' does not exist on type '{}'` pattern (66 / 60 / 51 hits)
is a Wasp operation-typing smell: query results fall back to `{}` because
the Wasp-generated SDK types aren't resolving. Usually means the operation's
`Payload`/return type isn't exported in a way Wasp's codegen can pick up, or
the query was declared but not yet recompiled into the SDK. The
`AdminStats` / `RecentFeedbackResult` errors (`Type X does not satisfy the
constraint 'Payload'` → `Index signature for type 'string' is missing`) are
the canonical trigger: Wasp requires operation payloads to have a string
index signature to be SuperJSON-serializable.

### 2. `wasp-bin: removeDirectoryRecursive: Directory not empty` + `EJSONPARSE` (build-cache corruption)

Around attempt 4–5, the `.wasp/out/` tree got into a bad state — Wasp tried
to clear its own output dir mid-write, left `package.json` as an empty
string, and `npm install` failed with `JSONParseError: Unexpected end of
JSON input while parsing empty string`. The `wasp-runner.sh` supervisor
cleaned the tree and retried; it self-healed by attempt 6. Known class of
Wasp issue when a recompile races with a file save.

### 3. Merge conflict markers left in test files

`goals/operations.test.ts` and `logbook/operations.test.ts` shipped
`<<<<<<<` markers (5 TS1185 errors). Trivial but blocked the bundle.

## HTTP-layer failures (all 12 of the 500s are one thing)

Every 500 is the same stack:

```
Error: Not authenticated.
  at getAppData (src/app/operations.ts:34:11)
  at ensureOnboarded (src/onboarding/operations.ts:93:11)
```

Not bugs — auth queries (`get-app-data`, `get-projects-for-resolver`,
`ensure-onboarded`) firing with no session, typically right after a nodemon
restart or on a stale browser tab whose session expired. Server correctly
rejects them; the 500 status is just Wasp surfacing the thrown
`HttpError(401)` as 500 in the dev logger. The 10× `GET /api/pat/list 401`
are the CLI token route doing the same correct rejection.

Only real 404s worth noting: `feedback/show?id=ZZZZ` and `id=CFVS-J9AQ`
returning 404 — prefix-match logic correctly rejecting non-matches. Working
as designed.

## Noise drowning the signal

The **389 `npm warn Unknown config "allow-scripts"`** lines are pure noise
from `.npmrc`. ~7% of the log volume. One-line fix.

## How to avoid most of this

### Stop the `tsc` crashes at the source — fix the Wasp payload typing once

The whole `Property 'X' does not exist on type '{}'` family traces to
operation return types Wasp can't serialize. Two concrete fixes:

1. Give every custom query/action payload an explicit string index signature
   so it satisfies Wasp's `Payload` (SuperJSON) constraint — the `AdminStats`
   and `RecentFeedbackResult` errors tell you exactly which types fail:

   ```ts
   export type AdminStats = {
     // ...
     [key: string]: unknown; // ← the missing index signature
   };
   ```

2. Verify with `wasp compile` (not `tsc`) before hitting save in a running
   `wasp start` — per `webapp/AGENTS.md`. The dev recompile loop is 8 crashes
   deep because errors only surface after nodemon already restarted.

### Run `wasp db migrate-dev` — 23 schema-drift warnings

The `Feedback.updatedAt` default and the `User` column removals (`createdAt`,
`lastActiveAt`) are unapplied. Each recompile re-prints the warning. One
migration clears it.

### Stop the `allow-scripts` noise

In `~/.npmrc` or the project `.npmrc`, replace `allow-scripts=...` with
`--allow-scripts` on the command, or drop it — deprecated. 389 lines gone.

### Don't leave `<<<<<<<` markers in committed files

A pre-commit hook catches this in 5 lines:

```sh
git diff --cached | grep -qE '^(<<<<<<<|=======|>>>>>>>)' && { echo "merge markers"; exit 1; }
```

### Guard the dev loop against the cache-corruption crash

`wasp-runner.sh` already cleans and retries on rc=1 — good. To prevent the
`EJSONPARSE` / `removeDirectoryRecursive` race in the first place, avoid
saving files while a recompile is mid-flight (the `🐝 Recompiling...` →
`✅ Recompilation succeeded` window). If it recurs, `rm -rf webapp/.wasp/out`
before `wasp start` is the reliable reset.

### The 500s need no code change

If the dev-log noise bugs you, the authed queries could catch the
missing-session case client-side (don't call `get-app-data` before
`/auth/me` resolves) — polish, not a bug.

## TL;DR

Crashes are **not** infrastructure — they're a tight feedback loop between
editor saves and Wasp's codegen, amplified by one missing SuperJSON index
signature on a handful of types. Fix the `Payload` typing on
`AdminStats` / `RecentFeedbackResult`, run the pending migration, silence
the `.npmrc` warning, and ~90% of the crash/warning volume disappears. The
12 HTTP 500s are correct auth rejections on stale sessions, not faults.
