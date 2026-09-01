# DISPATCH — F2 snapshot + staging environment

**TARGET MODEL: Gemini (capable tier) — author**
Goal: F2 · Timebox: half a day · Repo: action-amp root
Precondition: F1 landed (root workspaces exist).
Spec source: goal set §Wave 0, F2. Project home: `docs/plans/PLATFORM-SWITCH.md`.

## Read first

1. `AGENTS.md` — §"Agent database access" (psql absolute path, local server,
   database names; the same server hosts unrelated projects' databases —
   leave those alone).
2. `docs/plans/dispatch/notes/F1-notes.md`.

## Scope — build exactly this, nothing more

Two scripts, self-documenting, under `scripts/db/`:

* **`snapshot.sh`** — `pg_dump` a source database to a timestamped file.
  Source comes from `PROD_DATABASE_URL` when set; **for testing, dump the
  local `actionamp_dev` database instead** (read-only — never write to
  `actionamp_dev`). No production credentials are needed for this goal.
* **`restore-staging.sh`** — drop + recreate a local **`actionamp_staging`**
  database and restore the dump into it. Idempotent: safe to re-run.
  `actionamp_staging` is this script's only permitted write target.

Both scripts: `set -euo pipefail`, header comment documenting usage and the
one-command round trip, and a final summary line (tables + row counts via
psql).

## Done when

* The round trip works locally: snapshot `actionamp_dev` → restore →
  `actionamp_staging` exists and row counts of a few core tables
  (`Task`, `InboxItem`, `User`) match the source. Paste that transcript
  into your notes.
* No other database was created, modified, or dropped (the transcript +
  `git diff` scope prove it).
* `docs/plans/dispatch/notes/F2-notes.md` records usage, the staging URL
  convention for later goals, and anything surprising.

## Constraints

* Only `scripts/db/`, `docs/plans/dispatch/notes/`, and (if genuinely
  needed) a root `.gitignore` entry for dump files. Nothing else.
* Commit prefix `platform(F2):`. Never touch `webapp/` or the spike dirs.
