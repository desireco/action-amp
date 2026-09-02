#!/usr/bin/env bash
# Start the ActionAmp app: API (:8080) first, then web (:5174) once the API
# is ready. Ctrl-C stops both.
#
#   npm run app        # or: bash scripts/dev.sh
#
# Env: the API reads api/.env (DATABASE_URL, test-mode Stripe keys, ...).
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() {
  # Kill the whole process group so the API dies with the web (Ctrl-C).
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

bun run --filter '@actionamp/api' dev &
API_PID=$!

# Hold the web until the API answers /ready — its proxy would otherwise
# serve a cold data plane on first load.
for _ in $(seq 1 120); do
  curl -sf http://localhost:8080/ready >/dev/null 2>&1 && break
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "[dev] the API exited during startup — see its output above." >&2
    exit 1
  fi
  sleep 0.5
done

bun run --filter '@actionamp/web' dev
