#!/usr/bin/env bash
# Start the ActionAmp app: API (:8080) first, then web (:5174) once the API
# is ready. Ctrl-C stops both.
#
#   npm run app        # or: bash scripts/dev.sh
#
# If an API is already listening on :8080 and answers /ready, it is reused
# as-is — not started, not killed. Ctrl-C then stops only the web.
#
# Env: the API reads api/.env (DATABASE_URL, test-mode Stripe keys, ...).
set -euo pipefail
cd "$(dirname "$0")/.."

API_URL="${API_URL:-http://localhost:8080}"
api_ready() { curl -sf "$API_URL/ready" >/dev/null 2>&1; }

API_EXTERNAL=0
API_PID=""
WEB_PID=""

cleanup() {
  if [[ "$API_EXTERNAL" == 1 && -n "$WEB_PID" ]]; then
    # We don't own the API — stop only the web (it runs in its own group).
    kill -- "-$WEB_PID" 2>/dev/null || kill "$WEB_PID" 2>/dev/null || true
  else
    # Kill the whole process group so the API dies with the web (Ctrl-C).
    kill 0 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if api_ready; then
  API_EXTERNAL=1
  echo "[dev] API already running at $API_URL and ready — reusing it."
else
  bun run --filter '@actionamp/api' dev &
  API_PID=$!

  # Hold the web until the API answers /ready — its proxy would otherwise
  # serve a cold data plane on first load.
  for _ in $(seq 1 120); do
    api_ready && break
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "[dev] the API exited during startup — see its output above." >&2
      exit 1
    fi
    sleep 0.5
  done

  if ! api_ready; then
    echo "[dev] warning: the API never reported ready after 60s — usually the" >&2
    echo "[dev] database behind DATABASE_URL (api/.env) is missing or down." >&2
    echo "[dev] starting the web anyway; its data calls will fail." >&2
  fi
fi

if [[ "$API_EXTERNAL" == 1 ]]; then
  # Own process group, so cleanup can stop the web without touching the API
  # it didn't start.
  setsid bun run --filter '@actionamp/web' dev &
  WEB_PID=$!
  wait "$WEB_PID"
else
  bun run --filter '@actionamp/web' dev
fi
