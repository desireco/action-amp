#!/usr/bin/env bash
# Deploy ActionAmp.
# Currently: webapp only (Wasp -> Railway). Site + others added later.
# Usage: ./deploy.sh [extra wasp flags]
set -euo pipefail

# Repo root = this script's directory (works from any cwd).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "→ [webapp] npm run deploy $*"
cd "$ROOT/webapp"
npm run deploy -- "$@"
