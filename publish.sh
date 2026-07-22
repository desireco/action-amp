#!/usr/bin/env bash
#
# publish.sh — publish ActionAmp surfaces.
#
# Usage:
#   ./publish.sh              # default: site only (the safe, frequent one)
#   ./publish.sh site         # the marketing site (Astro → Cloudflare Pages)
#   ./publish.sh app          # the webapp (Wasp → Railway)
#   ./publish.sh cli          # the CLI (tsc build to dist/)
#   ./publish.sh site app cli # all three, in order
#   ./publish.sh all          # same as above
#
# Each target is independent. The script runs from the repo root.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Color helpers (calm, no exclamation marks per the tone guide)
gray() { printf '\033[0;90m%s\033[0m\n' "$1"; }
green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }

publish_site() {
  gray "→ Publishing site (Astro → Cloudflare Pages)..."
  cd site
  npm run deploy
  cd "$SCRIPT_DIR"
  green "✓ Site deployed to actionamp.com"
}

publish_app() {
  gray "→ Publishing app (Wasp → Railway)..."
  cd webapp
  npm run deploy
  cd "$SCRIPT_DIR"
  green "✓ App deployed to api.actionamp.com"
}

publish_cli() {
  gray "→ Building CLI (tsc → dist/)..."
  cd cli
  npm run build
  chmod +x dist/index.js
  cd "$SCRIPT_DIR"
  green "✓ CLI built to cli/dist/index.js"
}

# ─── arg parsing ────────────────────────────────────────────────────────────

TARGETS=()
for arg in "$@"; do
  case "$arg" in
    site|app|cli) TARGETS+=("$arg") ;;
    all) TARGETS=(site app cli) ;;
    -h|--help)
      sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) red "Unknown target: $arg"; echo "Valid: site, app, cli, all" >&2; exit 1 ;;
  esac
done

# Default: site only
if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=(site)
fi

gray "Publishing: ${TARGETS[*]}"

for target in "${TARGETS[@]}"; do
  case "$target" in
    site) publish_site ;;
    app)  publish_app ;;
    cli)  publish_cli ;;
  esac
done

green "Done."
