#!/usr/bin/env bash
# Warm check — v3 §6 switch step 4 (and ROLLBACK.md re-verification).
#
# Confirms a deployed ActionAmp stack is healthy BEFORE (or without) any
# traffic move: liveness + readiness, one authenticated read, one scratch
# write that cleans up after itself. Prints PASS/FAIL per line; exits 1 if
# anything failed.
#
# SAFE BY DEFAULT: the only write is one scratch inbox item created and then
# deleted (triage decision "delete") on the account whose cookie you supply.
# No flips, no deletes of real data, no config changes. It runs against
# whatever BASE_URL you point it at — pointing it at production is a
# deliberate act.
#
# Usage:
#   BASE_URL=https://api.example.com SESSION_COOKIE=<wasp_session value> \
#     scripts/switch/warm-check.sh
#
# Env:
#   BASE_URL        Target base URL. Default http://localhost:8080 (the local
#                   api dev server). Nothing touches production unless
#                   you set this explicitly.
#   SESSION_COOKIE  The authenticated cookie for the read + scratch write.
#                   Accepts the bare token or a full "wasp_session=<token>"
#                   string. Copy it from a logged-in browser (DevTools →
#                   Application → Cookies) — sessions survive the switch, so
#                   a cookie from the current stack works on both.
#   DEV_LOGIN_EMAIL If SESSION_COOKIE is unset, the script tries the dev-only
#                   autologin route (POST /api/dev/login?email=…). That route
#                   exists ONLY when the server runs with NODE_ENV=development
#                   (it 404s anywhere else), so this cannot mint sessions on
#                   a real deployment. Default: dev@local.test.
#
# Pure bash + curl. No jq, no bun, no other dependencies.

set -u -o pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
SESSION_COOKIE="${SESSION_COOKIE:-}"
DEV_LOGIN_EMAIL="${DEV_LOGIN_EMAIL:-dev@local.test}"
# Cookie-authed POSTs require a custom header (CSRF defense on /rpc).
CSRF_HEADER="x-requested-with: actionamp-switch-check"
HTTP_TIMEOUT=10

FAILED=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }
note() { printf 'note  %s\n' "$1"; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# fetch METHOD PATH [DATA] -> writes body to $tmpdir/body, echoes http code
fetch() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-s --max-time "$HTTP_TIMEOUT" -X "$method"
              -o "$tmpdir/body" -w '%{http_code}'
              -H "$CSRF_HEADER" -H 'content-type: application/json')
  if [ -n "$data" ]; then
    args+=(-d "$data")
  fi
  if [ -n "$SESSION_COOKIE" ]; then
    args+=(-H "cookie: $SESSION_COOKIE")
  fi
  curl "${args[@]}" "$BASE_URL$path"
}

# --- resolve the session cookie ----------------------------------------------

if [ -z "$SESSION_COOKIE" ]; then
  # Dev-only route: mints a real session cookie for the seed/dev user. 404s
  # on any non-development target, so this is a no-op against staging/prod.
  code="$(curl -s --max-time "$HTTP_TIMEOUT" -o "$tmpdir/devlogin" \
            -D "$tmpdir/devlogin-headers" \
            -w '%{http_code}' \
            -X POST "$BASE_URL/api/dev/login?email=$(printf %s "$DEV_LOGIN_EMAIL" | sed 's/@/%40/g')")"
  if [ "$code" = "200" ]; then
    token="$(sed -n 's/^[Ss]et-[Cc]ookie: wasp_session=\([^;]*\);.*/\1/p' \
                "$tmpdir/devlogin-headers" | head -1)"
    if [ -n "$token" ]; then
      SESSION_COOKIE="wasp_session=$token"
      note "minted a dev session via /api/dev/login for $DEV_LOGIN_EMAIL"
    fi
  fi
fi

if [ -n "$SESSION_COOKIE" ] && ! printf %s "$SESSION_COOKIE" | grep -q '='; then
  SESSION_COOKIE="wasp_session=$SESSION_COOKIE"
fi

echo "warm-check: $BASE_URL"
if [ -z "$SESSION_COOKIE" ]; then
  note "no SESSION_COOKIE — proceeding; the read/write checks will fail."
  note "get one from a logged-in browser (DevTools → Application → Cookies → wasp_session)."
fi
echo

# --- 1. liveness --------------------------------------------------------------

code="$(fetch GET /health)"
if [ "$code" = "200" ] && grep -q '"ok":true' "$tmpdir/body"; then
  pass "/health ok:true (liveness)"
else
  fail "/health — HTTP $code, expected 200 + {\"ok\":true}"
fi

# --- 2. readiness (db) --------------------------------------------------------

code="$(fetch GET /ready)"
if [ "$code" = "200" ] && grep -q '"db":"up"' "$tmpdir/body"; then
  pass "/ready db:up (database reachable)"
else
  fail "/ready — HTTP $code, expected 200 + {\"db\":\"up\"}"
fi

# --- 3. one authenticated read ------------------------------------------------

code="$(fetch POST /rpc/tasks/list)"
if [ "$code" = "200" ] && grep -q '^{"json":' "$tmpdir/body"; then
  pass "/rpc/tasks/list 200 (authenticated read; oRPC envelope)"
else
  fail "/rpc/tasks/list — HTTP $code, expected 200 + {\"json\":[…]} (check SESSION_COOKIE)"
fi

# --- 4. one scratch write + cleanup -------------------------------------------
# The scratch text is uniquely tagged so a human can spot it if cleanup ever
# fails. Side note: capture advances first-run onboarding for an account
# mid-onboarding (CAPTURE→TRIAGE) — use a settled account (admin/your own),
# which is what a switch-day warm check does anyway.

scratch_text="switch-warm-check $(date +%s)"

code="$(fetch POST /rpc/inbox/create "{\"json\":{\"text\":\"$scratch_text\"}}")"
if [ "$code" = "200" ] && grep -q '"id":"' "$tmpdir/body"; then
  pass "/rpc/inbox/create 200 (scratch write landed)"
  scratch_id="$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$tmpdir/body" | head -1)"
else
  fail "/rpc/inbox/create — HTTP $code, expected 200 + an id"
  scratch_id=""
fi

if [ -n "$scratch_id" ]; then
  code="$(fetch POST /rpc/inbox/triage "{\"json\":{\"inboxItemId\":\"$scratch_id\",\"decision\":\"delete\"}}")"
  if [ "$code" = "200" ] && grep -q '"kind":"delete"' "$tmpdir/body"; then
    pass "/rpc/inbox/triage delete (scratch write cleaned up)"
  else
    fail "/rpc/inbox/triage delete — HTTP $code; CLEAN UP MANUALLY: inbox item id $scratch_id (text: $scratch_text)"
  fi
fi

# --- summary -------------------------------------------------------------------

echo
if [ "$FAILED" = "0" ]; then
  echo "warm-check: ALL PASS against $BASE_URL"
  exit 0
else
  echo "warm-check: FAILURES above against $BASE_URL — do not proceed with the switch"
  exit 1
fi
