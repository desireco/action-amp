#!/usr/bin/env bash
# worktree-teardown.sh — remove a dev worktree from inside it.
#
# Counterpart to dev-worktree.sh / worktree.sh. Detects the worktree you're
# standing in, shows what it'll remove (dir + branch + dedicated DB), asks for
# confirmation, then tears it all down and tells you how to get back to main.
#
# It's worktree-agnostic: it introspects the current tree rather than
# re-deriving from a name, so it works for worktrees made by either creator
# script. It mirrors dev-worktree.sh's `--remove` path (worktree + branch +
# dedicated DB) and reuses the same reserved-DB guard.
#
# Usage:
#   bash webapp/scripts/worktree-teardown.sh           # remove the worktree you're in
#   bash webapp/scripts/worktree-teardown.sh <name>    # explicit (from anywhere)
#   bash webapp/scripts/worktree-teardown.sh --force   # no confirmation prompt
#   bash webapp/scripts/worktree-teardown.sh --help
#
# Reserved DBs (never dropped): actionamp_dev, actionamp_e2e.
# Reserved branches (never deleted): main, master.
#
# Note on "return to main": a child process can't change its parent shell's
# cwd, so this script prints the cd command rather than cd-ing for you. To get
# the cd for free, `source` it instead of `bash`-ing it — the sourced path
# changes the caller's cwd on success.
#
# Config (override via env, same as dev-worktree.sh):
#   DEVWT_PG_USER    (default: jake)
#   DEVWT_PG_HOST    (default: localhost)
#   DEVWT_PG_PORT    (default: 5432)
set -euo pipefail

# ── helpers ────────────────────────────────────────────────────────────────
die() { echo "ERROR: $*" >&2; exit 1; }

# Locate psql — Homebrew keg-only postgresql@18 etc. aren't on PATH by default.
# (Copied from dev-worktree.sh so this script is standalone.)
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

# Reserved — these are never dropped (shared dev DB + e2e DB) and never deleted
# as branches (the mainline). Mirrors dev-worktree.sh's guard set.
RESERVED_DB="actionamp_dev actionamp_e2e"
RESERVED_BRANCH="main master"

is_reserved() { local needle="$1"; local item; for item in $2; do [ "$item" = "$needle" ] && return 0; done; return 1; }

# ── args ───────────────────────────────────────────────────────────────────
FORCE=0
NAME_ARG=""
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    --help|-h)
      sed -n '2,/^set -euo pipefail$/p' "$0" | sed -e 's/^# //' -e 's/^#//'
      exit 0
      ;;
    -*) die "unknown flag: $arg (try --help)" ;;
    *) [ -z "$NAME_ARG" ] || die "unexpected second argument: $arg"; NAME_ARG="$arg" ;;
  esac
done

PG_USER="${DEVWT_PG_USER:-jake}"
PG_HOST="${DEVWT_PG_HOST:-localhost}"
PG_PORT="${DEVWT_PG_PORT:-5432}"

# ── resolve: where are we? ─────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || die "not inside a git repo"
GIT_DIR="$(git rev-parse --git-dir)"
COMMON_DIR="$(git rev-parse --git-common-dir)"
# Absolute path to the shared .git (main checkout's .git), resolving relatives.
COMMON_DIR_ABS="$(cd "$REPO_ROOT" && cd "$COMMON_DIR" && pwd)"
MAIN_ROOT="$(cd "$COMMON_DIR_ABS/.." && pwd)"

# Inside a worktree, --git-dir is ".git/worktrees/<name>" (absolute or relative
# to the worktree root). In the main checkout it's just ".git".
IN_WORKTREE=0
if [[ "$GIT_DIR" == *".git/worktrees/"* ]]; then
  IN_WORKTREE=1
elif [[ "$GIT_DIR" == ".git" || "$(basename "$GIT_DIR")" == ".git" ]]; then
  # In the main checkout — only proceed if an explicit name was given.
  if [ -z "$NAME_ARG" ]; then
    echo "You're in the main checkout ($(basename "$MAIN_ROOT")). Nothing to tear down here."
    echo "To remove a worktree by name: bash $0 <name>"
    echo ""
    echo "Known worktrees:"
    git worktree list
    exit 0
  fi
else
  die "can't tell if this is a worktree (git-dir was '$GIT_DIR'); pass <name> explicitly"
fi

# ── resolve the worktree's dir + display name ──────────────────────────────
# Use --show-toplevel as the authoritative dir (no AWK guesswork). The display
# name is the dir's basename with the repo's "action-amp-" prefix stripped —
# that's the convention both creator scripts use (../action-amp-<name>). An
# explicit <name> arg overrides this (lets you remove another worktree).
if [ "$IN_WORKTREE" = "1" ] && [ -z "$NAME_ARG" ]; then
  WT_DIR="$REPO_ROOT"
else
  # Explicit name → resolve to its dir via `git worktree list`.
  WT_DIR="$(git worktree list --porcelain \
    | awk -v name="$NAME_ARG" '
        /^worktree /{dir=$2; n=split(dir, p, "/"); wtname=p[n]}
        /^$/{if (wtname==name || wtname==("action-amp-" name)) print dir; wtname=""}
        END{if (wtname==name || wtname==("action-amp-" name)) print dir}
      ' | head -n1)"
  [ -n "$WT_DIR" ] || die "no worktree named '$NAME_ARG' is registered. Known:
$(git worktree list)"
fi

WT_BASENAME="$(basename "$WT_DIR")"
WT_NAME="${WT_BASENAME#action-amp-}"   # strip repo prefix → the slug
[ "$WT_BASENAME" = "$WT_NAME" ] && echo "  (note: '$WT_BASENAME' has no action-amp- prefix — proceeding)" >&2 || true
[ -d "$WT_DIR" ] || die "worktree dir $WT_DIR is missing on disk (run 'git worktree prune' in main)."

# The branch checked out in that worktree, if any (may be detached).
BRANCH="$(git -C "$WT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
DETACHED=0
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then
  BRANCH=""
  DETACHED=1
fi

# ── derive the DB name (mirrors dev-worktree.sh's convention) ──────────────
# dev/<name> → strip "dev/" → dashes → underscores → actionamp_<name>.
# Only a heuristic: if the worktree's webapp/.env.server has a DATABASE_URL,
# trust that over the name convention (it's ground truth).
DB_NAME=""
ENV_SERVER="$WT_DIR/webapp/.env.server"
if [ -f "$ENV_SERVER" ]; then
  DB_NAME="$(grep -E '^DATABASE_URL=' "$ENV_SERVER" 2>/dev/null | tail -n1 \
    | sed -E 's#^DATABASE_URL=.*://##; s#^[^@]*@##; s#^[^/]*/##; s#\?.*$##' || true)"
fi
if [ -z "$DB_NAME" ]; then
  base="$WT_NAME"
  base="${base#dev/}"
  DB_NAME="actionamp_$(printf '%s' "$base" | tr '-' '_')"
fi

# ── safety: never delete mainline branches ─────────────────────────────────
if [ -n "$BRANCH" ] && is_reserved "$BRANCH" "$RESERVED_BRANCH"; then
  die "refusing to delete branch '$BRANCH' (reserved mainline). The worktree dir + DB can still go if you remove the branch guard manually."
fi
if is_reserved "$DB_NAME" "$RESERVED_DB"; then
  echo "NOTE: DB '$DB_NAME' is reserved (shared) — will NOT be dropped." >&2
  DB_NAME=""   # clear so the teardown loop skips it
fi

# ── pre-flight summary ─────────────────────────────────────────────────────
echo "About to tear down worktree '$WT_NAME':"
echo "  dir:      $WT_DIR"
if [ "$DETACHED" = "1" ]; then
  echo "  branch:   (detached HEAD — no branch to delete)"
elif [ -n "$BRANCH" ]; then
  echo "  branch:   $BRANCH"
else
  echo "  branch:   (none)"
fi
[ -z "$DB_NAME" ] || echo "  database: $DB_NAME"

# Dirty-tree warning (only meaningful for the worktree we're standing in).
if [ "$WT_DIR" = "$REPO_ROOT" ]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo ""
    echo "  ⚠ uncommitted changes in this worktree — they will be LOST:"
    git status --short | sed 's/^/    /'
  fi
fi

echo ""
if [ "$FORCE" = "1" ]; then
  echo "(--force: skipping confirmation)"
else
  printf "Proceed? [y/N] "
  read -r ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "aborted."; exit 1 ;;
  esac
fi

# ── teardown (run from MAIN_ROOT — git worktree remove refuses from inside) ─
cd "$MAIN_ROOT"

echo "→ removing worktree…"
if ! git worktree remove --force "$WT_DIR" 2>/dev/null; then
  # Already gone or locked — force-clean the registration.
  rm -rf "$WT_DIR" 2>/dev/null || true
fi
git worktree prune

if [ -n "$BRANCH" ] && git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git branch -D "$BRANCH" && echo "→ deleted branch $BRANCH"
fi

if [ -n "$DB_NAME" ]; then
  PSQL="$(find_psql)"
  ADMIN_URL="postgresql://$PG_USER@$PG_HOST:$PG_PORT/postgres"
  if [ -n "$PSQL" ] && \
     "$PSQL" "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
    "$PSQL" "$ADMIN_URL" -c "DROP DATABASE $DB_NAME" && echo "→ dropped database $DB_NAME"
  else
    echo "→ database $DB_NAME already gone (or psql unreachable) — skipped"
  fi
fi

# ── done ───────────────────────────────────────────────────────────────────
echo ""
echo "✓ removed '$WT_NAME'."

if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" = "$0" ] && [ "${ZSH_NAME:-}" = "" ]; then
  # Executed (bash <script>), not sourced — can't cd the parent shell.
  echo ""
  echo "Return to main:"
  echo "  cd $MAIN_ROOT"
else
  # Sourced — we can cd the caller's shell. (On zsh, $0 isn't reliable for this
  # test; fall through to the hint, which is always safe.)
  if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "$0" ]; then
    cd "$MAIN_ROOT" 2>/dev/null || true
    echo "  (cwd → $MAIN_ROOT)"
  else
    echo ""
    echo "Return to main:"
    echo "  cd $MAIN_ROOT"
  fi
fi
