#!/usr/bin/env bash
# Deploy ActionAmp — RETIRED 2026-09-06: the Wasp webapp was switched off
# (domains moved to the new stack; old Railway services deleted). Kept for
# archaeology; the live deploy is the root Dockerfile -> Railway service
# action-amp-next.
# Usage: ./deploy.sh [extra wasp flags]
set -euo pipefail

# Repo root = this script's directory (works from any cwd).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ [old-webapp] npm run deploy $*  (retired — see header)"
cd "$ROOT/old-webapp"
npm run deploy -- "$@"
