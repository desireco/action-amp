#!/usr/bin/env bash
# Spin up an isolated dev worktree for ActionAmp: git worktree + dedicated
# branch + its own database on the shared local Postgres + port-shifted env
# files. One name drives everything, so a worktree's `wasp start` runs
# side-by-side with the main checkout's — no .wasp/ or port collisions, same
# PG server, different database.
#
# Why a worktree (not a second `wasp start` in the same dir): two instances in
# one directory corrupt .wasp/ (hardcoded path, no env override — waspc
# Project/Common.hs; GH #4438/#4471). A worktree gets its own .wasp/,
# node_modules, and — via this script — its own DB + ports.
#
# Usage:
#   bash webapp/scripts/dev-worktree.sh <name>           # create
#   bash webapp/scripts/dev-worktree.sh --remove <name>  # teardown
#   bash webapp/scripts/dev-worktree.sh --list           # show all + ports/state
#   bash webapp/scripts/dev-worktree.sh --help
#
# <name> is sanitized to a slug and derives:
#   worktree dir   ../action-amp-<name>      (sibling of the repo root)
#   branch         dev/<name>                (based on local main)
#   database       actionamp_<name>          (same PG server as actionamp_dev)
#   server port    3500+                     (first free slot; main is 3001)
#   client port    4500+                     (server port + 1000; main is 4000)
#
# The worktree's .env.server inherits secrets (Stripe/SMTP/OAuth) from the main
# checkout's .env.server verbatim — only DATABASE_URL + port vars are rewritten
# — so a dev worktree is fully functional, not a stub.
#
# Config (override via env if your setup differs):
#   DEVWT_PG_USER    (default: jake)
#   DEVWT_PG_HOST    (default: localhost)
#   DEVWT_PG_PORT    (default: 5432)
#   DEVWT_PORT_BASE  (default: 3500 — server port range start; client = +1000)
set -euo pipefail

# ── helpers ────────────────────────────────────────────────────────────────
die() { echo "ERROR: $*" >&2; exit 1; }

# lowercase → [a-z0-9-] only → collapse/trim dashes.
sanitize() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9]/-/g' -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//'
}

# Locate psql — Homebrew keg-only postgresql@18 etc. aren't on PATH by default.
find_psql() {
  local psql; psql="$(command -v psql 2>/dev/null || true)"
  if [ -z "$psql" ]; then
    for cand in \
      /opt/homebrew/opt/postgresql@18/bin/psql \
      /opt/homebrew/opt/postgresql@17/bin/psql \
      /opt/homebrew/opt/postgresql@16/bin/psql \
      /opt/homebrew/opt/libpq/bin/psql \
      /usr/local/opt/postgresql/bin/psql \
      /Applications/Postgres.app/Contents/Versions/latest/bin/psql; do
      if [ -x "$cand" ]; then psql="$cand"; break; fi
    done
  fi
  printf '%s' "$psql"
}

# Is something currently listening on this TCP port? (nc if available; if nc
# is missing we fall back to "free" — port-claim tracking still keeps worktrees
# unique, we just can't avoid unrelated services that happen to be bound.)
port_listening() {
  command -v nc >/dev/null 2>&1 || return 1
  nc -z -w 1 127.0.0.1 "$1" >/dev/null 2>&1
}

# Print one row per worktree: name, branch, database, server/client ports,
# and whether its server port is currently bound (≈ "running"). Reads each
# worktree's own .env.server/.env.client so the table reflects ground truth,
# not just what this script last wrote. Non-dev worktrees (main, e2e) with no
# recognizable PORT= are skipped — this lists dev worktrees only.
list_worktrees() {
  printf '%-16s %-14s %-24s %-8s %-8s %-6s\n' \
    "NAME" "BRANCH" "DATABASE" "SERVER" "CLIENT" "STATE"
  git worktree list --porcelain | awk '/^worktree /{print $2}' \
    | while read -r wt; do
      local envs="$wt/webapp/.env.server"
      local envc="$wt/webapp/.env.client"
      [ -f "$envs" ] || continue
      local name sp cp state
      name="$(basename "$wt")"
      case "$name" in
        action-amp|action-amp-e2e) continue ;;  # main checkout + e2e — not dev
      esac
      name="${name#action-amp-}"
      sp="$(grep -E '^PORT=' "$envs" 2>/dev/null | tail -n1 | cut -d= -f2 || true)"
      [ -n "$sp" ] || continue                 # not a dev-worktree env
      cp="$(grep -E '^VITE_PORT=' "$envc" 2>/dev/null | tail -n1 | cut -d= -f2 || true)"
      cp="${cp:-$((sp + 1000))}"                # fallback to the convention
      if port_listening "$sp"; then state="run"; else state="-"; fi
      printf '%-16s %-14s %-24s %-8s %-8s %-6s\n' \
        "$name" "dev/$name" "actionamp_$(printf '%s' "$name" | tr '-' '_')" \
        "$sp" "$cp" "$state"
    done
}

# ── args + config ──────────────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || die "not inside a git repo"
MAIN_ENV="$REPO_ROOT/webapp/.env.server"
[ -f "$MAIN_ENV" ] \
  || die "main .env.server not found at $MAIN_ENV (copy from another checkout first)"

PG_USER="${DEVWT_PG_USER:-jake}"
PG_HOST="${DEVWT_PG_HOST:-localhost}"
PG_PORT="${DEVWT_PG_PORT:-5432}"
PORT_BASE="${DEVWT_PORT_BASE:-3500}"

MODE="create"
case "${1:-}" in
  --list|-l) list_worktrees; exit 0 ;;
  --remove|-r) MODE="remove"; shift ;;
  --help|-h)
    sed -n '2,/^set -euo pipefail$/p' "$0" | sed -e 's/^# //' -e 's/^#//'
    exit 0
    ;;
  "") die "usage: $0 <name>   |   $0 --remove <name>   |   $0 --list" ;;
esac

NAME_RAW="${1:-}"
[ -n "$NAME_RAW" ] || die "name required"
NAME="$(sanitize "$NAME_RAW")"
[ -n "$NAME" ] \
  || die "name is empty after sanitizing (was: '$NAME_RAW'); use letters/digits/dashes"
case "$NAME" in
  dev|main|master|e2e|prod|actionamp) die "name '$NAME' is reserved; pick something else" ;;
esac

# Postgres unquoted identifiers allow [a-z0-9_] only — no dashes — so the DB
# name uses underscores while the dir/branch keep dashes. Mirrors the existing
# e2e convention (dir action-amp-e2e, branch e2e, DB actionamp_e2e).
NAME_DB="$(printf '%s' "$NAME" | tr '-' '_')"
WORKTREE_DIR="$REPO_ROOT/../action-amp-$NAME"
BRANCH="dev/$NAME"
DB_NAME="actionamp_$NAME_DB"
WT_WEBAPP="$WORKTREE_DIR/webapp"

# ── teardown ───────────────────────────────────────────────────────────────
if [ "$MODE" = "remove" ]; then
  echo "Removing worktree '$NAME'…"
  if [ -d "$WORKTREE_DIR" ]; then
    git worktree remove "$WORKTREE_DIR" --force \
      || die "git worktree remove failed (cd into it? close editors/wasp start there)"
  else
    echo "  worktree dir not present — skipping"
  fi
  git worktree prune
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git branch -D "$BRANCH" || true
    echo "  deleted branch $BRANCH"
  fi
  PSQL="$(find_psql)"
  ADMIN_URL="postgresql://$PG_USER@$PG_HOST:$PG_PORT/postgres"
  if [ -n "$PSQL" ] && \
     "$PSQL" "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
    "$PSQL" "$ADMIN_URL" -c "DROP DATABASE $DB_NAME"
    echo "  dropped database $DB_NAME"
  else
    echo "  database $DB_NAME already gone (or psql unreachable)"
  fi
  echo "✓ removed '$NAME'."
  exit 0
fi

# ── create: don't clobber an existing worktree (it may have uncommitted work) ─
if [ -d "$WORKTREE_DIR" ]; then
  SERVER_PORT=""; CLIENT_PORT=""
  if [ -f "$WT_WEBAPP/.env.server" ]; then
    SERVER_PORT="$(grep -E '^PORT=' "$WT_WEBAPP/.env.server" | tail -n1 | cut -d= -f2 || true)"
  fi
  if [ -f "$WT_WEBAPP/.env.client" ]; then
    CLIENT_PORT="$(grep -E '^VITE_PORT=' "$WT_WEBAPP/.env.client" | tail -n1 | cut -d= -f2 || true)"
  fi
  echo "Worktree '$NAME' already exists at $WORKTREE_DIR (not clobbering)."
  echo "  branch:   $BRANCH"
  echo "  database: $DB_NAME"
  [ -n "$SERVER_PORT" ] && echo "  server:   http://localhost:$SERVER_PORT"
  if [ -n "$CLIENT_PORT" ]; then
    echo ""
    echo "Run it:"
    echo "  cd $WT_WEBAPP && VITE_PORT=$CLIENT_PORT wasp start"
  fi
  exit 0
fi

command -v wasp >/dev/null 2>&1 || die "wasp CLI not found on PATH (install from wasp.sh)"
PSQL="$(find_psql)"
[ -n "$PSQL" ] || die "psql not found (install postgresql client tools or set \$PSQL)"
echo "Using psql: $PSQL"

ADMIN_URL="postgresql://$PG_USER@$PG_HOST:$PG_PORT/postgres"
"$PSQL" "$ADMIN_URL" -tAc 'SELECT 1' >/dev/null \
  || die "can't reach Postgres at $ADMIN_URL (is it running?)"

# ── pick ports: avoid what other worktrees claim + what's currently bound ──
# Server ports claimed by existing worktrees come from their .env.server PORT.
# Main checkout (3001) and the e2e worktree (3101) are reserved too. New
# worktrees start at PORT_BASE (3500) — disjoint from main/e2e — and the client
# port is always server + 1000, so uniqueness of one implies the other.
claimed="$({
  echo 3001
  echo 3101
  git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r wt; do
    [ -f "$wt/webapp/.env.server" ] \
      && grep -E '^PORT=' "$wt/webapp/.env.server" 2>/dev/null | cut -d= -f2 || true
  done
} | grep -E '^[0-9]+$' | sort -un)"

N=0
while :; do
  SP=$((PORT_BASE + N))
  CP=$((SP + 1000))
  if printf '%s\n' "$claimed" | grep -qxF "$SP"; then N=$((N + 1)); continue; fi
  if port_listening "$SP" || port_listening "$CP"; then N=$((N + 1)); continue; fi
  break
done
SERVER_PORT=$SP
CLIENT_PORT=$CP
echo "Ports → server=$SERVER_PORT client=$CLIENT_PORT"

# ── 1. worktree + branch (based on local main; -B creates/resets dev/<name>) ─
git worktree add -B "$BRANCH" "$WORKTREE_DIR" main
echo "Created worktree at $WORKTREE_DIR (branch: $BRANCH, based on main)"

# ── 2. database on the shared PG server ────────────────────────────────────
if "$PSQL" "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  echo "Database $DB_NAME already exists — reusing"
else
  "$PSQL" "$ADMIN_URL" -c "CREATE DATABASE $DB_NAME"
  echo "Created database $DB_NAME"
fi

# ── 3. .env.server — inherit main's secrets, override DB + port vars ───────
# Drop the keys this script manages, keep everything else (Stripe, SMTP, OAuth,
# SKIP_EMAIL_VERIFICATION_IN_DEV, …) so the worktree behaves like the main app.
{
  echo "# Dev worktree env — auto-generated by scripts/dev-worktree.sh."
  echo "# Inherits secrets from the main checkout; only DATABASE_URL + ports differ."
  grep -vEv '^(DATABASE_URL|WASP_WEB_CLIENT_URL|WASP_SERVER_URL|PORT|VITE_PORT)=' "$MAIN_ENV" || true
  echo "DATABASE_URL=postgresql://$PG_USER@$PG_HOST:$PG_PORT/$DB_NAME"
  echo "WASP_WEB_CLIENT_URL=http://localhost:$CLIENT_PORT"
  echo "WASP_SERVER_URL=http://localhost:$SERVER_PORT"
  echo "PORT=$SERVER_PORT"
} > "$WT_WEBAPP/.env.server"
echo "Wrote $WT_WEBAPP/.env.server"

# ── 4. .env.client — point the client at the worktree's server ─────────────
cat > "$WT_WEBAPP/.env.client" <<EOF
# Dev worktree env — auto-generated.
REACT_APP_API_URL=http://localhost:$SERVER_PORT
VITE_PORT=$CLIENT_PORT
EOF
echo "Wrote $WT_WEBAPP/.env.client"

# ── 5. deps + migrate (wasp db migrate-dev needs node_modules first) ───────
cd "$WT_WEBAPP"
echo "Installing deps…"
wasp install
echo "Compiling + migrating $DB_NAME..."
wasp db migrate-dev --name auto

# ── done ───────────────────────────────────────────────────────────────────
echo ""
echo "✓ Worktree '$NAME' ready."
echo "  dir:      $WT_WEBAPP"
echo "  branch:   $BRANCH"
echo "  database: $DB_NAME"
echo "  server:   http://localhost:$SERVER_PORT"
echo "  client:   http://localhost:$CLIENT_PORT"
echo ""
echo "Run it (VITE_PORT must be in the shell env — vite.config.ts reads it; "
echo "Wasp only injects .env.client into import.meta.env, not process.env):"
echo "  cd $WT_WEBAPP && VITE_PORT=$CLIENT_PORT wasp start"
echo ""
echo "Tear it down later:"
echo "  bash $REPO_ROOT/webapp/scripts/dev-worktree.sh --remove $NAME"
