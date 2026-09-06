#!/usr/bin/env bash
#
# worktree.sh — create a parallel dev worktree off any branch.
#
# Each worktree gets its own .wasp/ (so wasp start doesn't fight the main
# checkout) and its own client/server ports (so it runs side-by-side with
# dev and other worktrees). The database is SHARED (actionamp_dev) — no
# separate DB setup, no migration needed beyond what dev already has.
#
# Usage:
#   bash scripts/worktree.sh <branch-name> [--port <client-port>]
#
# Examples:
#   bash scripts/worktree.sh feature/billing-ui
#   bash scripts/worktree.sh experiments/new-triage --port 4200
#
# The worktree is created at ../action-amp-<branch-name>/ (sibling of the
# main checkout). Env files (.env.server, .env.client) are copied from the
# main checkout and port-rewritten to the worktree's client/server ports.
#
# After creation:
#   cd ../action-amp-<branch-name>/webapp && wasp start
#
# Ports:
#   --port sets the CLIENT port (default 4200). Server = client + 1.
#   So --port 4200 → client :4200, server :4201.
#
# To remove a worktree when done:
#   git worktree remove ../action-amp-<branch-name>
#   git branch -d <branch-name>   # if you created a new branch
#
set -euo pipefail

# ── Args ────────────────────────────────────────────────────────────────
BRANCH=""
CLIENT_PORT=4200

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      CLIENT_PORT="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      if [[ -z "$BRANCH" ]]; then
        BRANCH="$1"
      else
        echo "ERROR: unexpected argument '$1'" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$BRANCH" ]]; then
  echo "Usage: bash scripts/worktree.sh <branch-name> [--port <client-port>]" >&2
  echo "  e.g. bash scripts/worktree.sh feature/billing-ui --port 4200" >&2
  exit 1
fi

SERVER_PORT=$((CLIENT_PORT + 1))

# ── Resolve paths ──────────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel)"
# Sanitize branch name for directory: feature/billing-ui → feature-billing-ui
BRANCH_SLUG="${BRANCH//\//-}"
WORKTREE_DIR="$REPO_ROOT/../action-amp-$BRANCH_SLUG"
MAIN_WEBAPP="$REPO_ROOT/webapp"

# ── Validate ───────────────────────────────────────────────────────────
if [[ ! -f "$MAIN_WEBAPP/.env.server" ]]; then
  echo "ERROR: $MAIN_WEBAPP/.env.server not found." >&2
  echo "       This script copies it from the main checkout. Create it first." >&2
  exit 1
fi

# Check the main checkout's .env.server for the DATABASE_URL — we'll reuse
# the same DB (shared data, no separate DB needed for feature dev).
DB_URL="$(grep '^DATABASE_URL=' "$MAIN_WEBAPP/.env.server" | head -1 | cut -d= -f2-)"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: DATABASE_URL not found in $MAIN_WEBAPP/.env.server" >&2
  exit 1
fi

echo "┌─ Worktree setup ─────────────────────────────────────────────────┐"
echo "│ Branch:       $BRANCH"
echo "│ Directory:    $WORKTREE_DIR"
echo "│ Client port:  :$CLIENT_PORT"
echo "│ Server port:  :$SERVER_PORT"
echo "│ Database:     (shared) actionamp_dev"
echo "└──────────────────────────────────────────────────────────────────┘"
echo ""

# ── 1. Create worktree ─────────────────────────────────────────────────
if [[ -d "$WORKTREE_DIR" ]]; then
  echo "→ Directory exists, re-syncing to $BRANCH..."
  git -C "$WORKTREE_DIR" fetch origin 2>/dev/null || true
  git -C "$WORKTREE_DIR" checkout "$BRANCH" 2>/dev/null || \
    git -C "$WORKTREE_DIR" reset --hard "$BRANCH"
else
  echo "→ Creating worktree at $WORKTREE_DIR..."
  # If the branch doesn't exist locally, create it off the current HEAD.
  if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "  (branch '$BRANCH' doesn't exist — creating off current HEAD)"
    git worktree add -b "$BRANCH" "$WORKTREE_DIR"
  else
    git worktree add "$WORKTREE_DIR" "$BRANCH"
  fi
fi

WT_WEBAPP="$WORKTREE_DIR/webapp"

# ── 2. Copy + port-rewrite env files ───────────────────────────────────
echo "→ Writing .env.server (ports → :$CLIENT_PORT/:$SERVER_PORT)..."
# Copy the main checkout's .env.server, rewriting the port-bearing vars.
# Everything else (DB, SMTP, Stripe, etc.) is reused as-is — same DB, same
# secrets, just different client/server URLs so the worktree doesn't clash.
sed \
  -e "s|^WASP_WEB_CLIENT_URL=.*|WASP_WEB_CLIENT_URL=http://localhost:$CLIENT_PORT|" \
  -e "s|^WASP_SERVER_URL=.*|WASP_SERVER_URL=http://localhost:$SERVER_PORT|" \
  -e "s|^PORT=.*|PORT=$SERVER_PORT|" \
  "$MAIN_WEBAPP/.env.server" > "$WT_WEBAPP/.env.server"

# Append PORT + WASP_SERVER_URL if the main checkout didn't have them (it
# normally omits them — dev uses Wasp's defaults 3001). Without PORT, the
# server ignores the worktree's intended port and falls back to 3001, which
# collides with the main checkout's server.
grep -qE "^PORT=" "$WT_WEBAPP/.env.server" || \
  echo -e "\n# Worktree server port (avoids :3001 clash with main checkout)\nPORT=$SERVER_PORT" \
  >> "$WT_WEBAPP/.env.server"
grep -qE "^WASP_SERVER_URL=" "$WT_WEBAPP/.env.server" || \
  echo "WASP_SERVER_URL=http://localhost:$SERVER_PORT" \
  >> "$WT_WEBAPP/.env.server"

# .env.client — point the client at the worktree's server.
if [[ -f "$MAIN_WEBAPP/.env.client" ]]; then
  sed \
    -e "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=http://localhost:$SERVER_PORT|" \
    "$MAIN_WEBAPP/.env.client" > "$WT_WEBAPP/.env.client"
else
  echo "REACT_APP_API_URL=http://localhost:$SERVER_PORT" > "$WT_WEBAPP/.env.client"
fi

# ── 3. Install deps (worktree has its own node_modules) ────────────────
echo "→ Installing deps (this takes a few minutes on first run)..."
cd "$WT_WEBAPP"
wasp install

# ── 4. Migrate (no-op if actionamp_dev is already current) ─────────────
echo "→ Syncing DB schema (shared actionamp_dev — usually a no-op)..."
wasp db migrate-dev --name auto 2>/dev/null || \
  echo "  (skipped — DB already in sync or migration not needed)"

# ── Done ───────────────────────────────────────────────────────────────
echo ""
echo "✓ Worktree ready: $WORKTREE_DIR"
echo ""
echo "  Start the server:"
echo "    cd $WT_WEBAPP && VITE_PORT=$CLIENT_PORT wasp start"
echo ""
echo "  Client:  http://localhost:$CLIENT_PORT"
echo "  Server:  http://localhost:$SERVER_PORT"
echo ""
echo "  Remove when done:"
echo "    git worktree remove $WORKTREE_DIR"
