#!/usr/bin/env bash
# Post-flip verification sweep — v3 §6 switch step 7, automated half.
#
# Runs the checks that can be automated against the LIVE domain after the
# switch, then prints the MANUAL steps that need a human (email arrival,
# browser surfaces, billing click-through, push opt-in). Exits 1 if any
# automated check fails; manual steps are printed regardless.
#
# SAFE BY DEFAULT: every request is a read or an auth-failure probe against
# BASE_URL. The one optional send — a magic-login email to TEST_EMAIL — is a
# normal user-facing flow and creates nothing but a challenge row that
# expires. No writes, no flips, no config changes.
#
# Usage:
#   BASE_URL=https://api.actionamp.com \
#   SESSION_COOKIE=<wasp_session value from a browser logged in BEFORE the flip> \
#   TEST_EMAIL=<a mailbox you can open> \
#     scripts/switch/verify-switch.sh
#
# Env:
#   BASE_URL        Target base URL. Default http://localhost:8080.
#   SESSION_COOKIE  Authenticated cookie (bare token or full
#                   "wasp_session=…" string). Without it the authenticated
#                   checks are skipped and reported as SKIP — on switch day
#                   this env should always be set.
#   TEST_EMAIL      If set, triggers a magic-login email send (code + link)
#                   so the manual check starts from a real, fresh challenge.
#                   Optional; skipped when unset.
#   MARKETING_ORIGIN  Origin header for the founding-100 CORS check.
#                   Default https://actionamp.com (the Astro site — the only
#                   origin in the allow-list).
#
# Pure bash + curl. No jq, no bun, no other dependencies.

set -u -o pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
SESSION_COOKIE="${SESSION_COOKIE:-}"
TEST_EMAIL="${TEST_EMAIL:-}"
MARKETING_ORIGIN="${MARKETING_ORIGIN:-https://actionamp.com}"
# Bogus PAT: must keep the aa_ prefix (that prefix routes it into the PAT
# namespace, where the patMiddleware-shaped rejection lives).
BOGUS_PAT="aa_switch_check_bogus_token_not_real"
CSRF_HEADER="x-requested-with: actionamp-switch-check"
HTTP_TIMEOUT=10

FAILED=0

pass()  { printf 'PASS  %s\n' "$1"; }
fail()  { printf 'FAIL  %s\n' "$1"; FAILED=1; }
skip()  { printf 'SKIP  %s\n' "$1"; }
manual(){ printf 'MANUAL  %s\n' "$1"; }
note()  { printf 'note  %s\n' "$1"; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Accept a bare session token or a full "wasp_session=<token>" string.
if [ -n "$SESSION_COOKIE" ] && ! printf %s "$SESSION_COOKIE" | grep -q '='; then
  SESSION_COOKIE="wasp_session=$SESSION_COOKIE"
fi

# fetch METHOD PATH [DATA] [EXTRA_CURL_ARGS...] — body → $tmpdir/body,
# response headers → $tmpdir/headers, echoes the http code.
fetch() {
  local method="$1" path="$2" data="${3:-}"
  local extra=()
  [ $# -gt 3 ] && extra=("${@:4}")
  local args=(-s --max-time "$HTTP_TIMEOUT" -X "$method"
              -o "$tmpdir/body" -D "$tmpdir/headers" -w '%{http_code}'
              -H "$CSRF_HEADER" -H 'content-type: application/json')
  [ -n "$data" ] && args+=(-d "$data")
  [ -n "$SESSION_COOKIE" ] && args+=(-H "cookie: $SESSION_COOKIE")
  # ${extra[@]+…} guards the empty-array expansion: bash < 4.4 (macOS) treats
  # "${empty[@]}" as an unbound variable under set -u.
  curl "${args[@]}" ${extra[@]+"${extra[@]}"} "$BASE_URL$path"
}

echo "verify-switch: $BASE_URL"
echo

# --- automated checks ----------------------------------------------------------

code="$(fetch GET /health)"
if [ "$code" = "200" ] && grep -q '"ok":true' "$tmpdir/body"; then
  pass "/health ok:true"
else
  fail "/health — HTTP $code"
fi

code="$(fetch GET /ready)"
if [ "$code" = "200" ] && grep -q '"db":"up"' "$tmpdir/body"; then
  pass "/ready db:up"
else
  fail "/ready — HTTP $code"
fi

# founding-100/status — the Astro marketing site's only DB coupling. The
# allow-list must answer EXACTLY the marketing origin; any other origin gets
# no CORS headers. Payload key order is part of parity.
code="$(fetch GET /founding-100/status '' -H "origin: $MARKETING_ORIGIN")"
# Strip CR portably (BSD sed has no \r) so the value compares clean on macOS.
acao="$(sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: *\(.*\)$/\1/p' \
          "$tmpdir/headers" | head -1 | tr -d '\r')"
if [ "$code" = "200" ] \
   && [ "$acao" = "$MARKETING_ORIGIN" ] \
   && grep -q '"cap"' "$tmpdir/body" \
   && grep -q '"reserved"' "$tmpdir/body" \
   && grep -q '"claimed"' "$tmpdir/body" \
   && grep -q '"remaining"' "$tmpdir/body" \
   && grep -q '"isFull"' "$tmpdir/body"; then
  pass "/founding-100/status (200, CORS for $MARKETING_ORIGIN, payload keys intact)"
else
  fail "/founding-100/status — HTTP $code, ACAO '${acao:-<none>}', body: $(head -c 120 "$tmpdir/body")"
fi

if [ -n "$SESSION_COOKIE" ]; then
  code="$(fetch GET /api/auth/me)"
  if [ "$code" = "200" ] && grep -q '"user":{"id"' "$tmpdir/body"; then
    pass "/api/auth/me (cookie session resolves to a user — pre-flip session survived)"
  else
    fail "/api/auth/me — HTTP $code, expected 200 + {\"user\":{\"id\"…}} (existing-session compatibility)"
  fi
else
  skip "/api/auth/me — no SESSION_COOKIE; set it to prove pre-flip sessions survive"
fi

if [ -n "$SESSION_COOKIE" ]; then
  code="$(fetch POST /rpc/tasks/list)"
  if [ "$code" = "200" ] && grep -q '^{"json":' "$tmpdir/body"; then
    pass "/rpc/tasks/list (authenticated read)"
  else
    fail "/rpc/tasks/list — HTTP $code, expected 200 + {\"json\":[…]}"
  fi
else
  skip "/rpc/tasks/list — no SESSION_COOKIE"
fi

# CLI 401 shape — the CLIs key off the exact patMiddleware bodies
# (cli/src/api.ts); the wrong body means every installed CLI shows raw errors.
code="$(curl -s --max-time "$HTTP_TIMEOUT" -o "$tmpdir/body" -w '%{http_code}' \
          -H "authorization: Bearer $BOGUS_PAT" "$BASE_URL/api/cli/whoami")"
if [ "$code" = "401" ] && grep -q '"error":"Invalid or revoked token."' "$tmpdir/body"; then
  pass "/api/cli/whoami bogus PAT → 401 {\"error\":\"Invalid or revoked token.\"} (CLI-keyed shape)"
else
  fail "/api/cli/whoami bogus PAT — HTTP $code, expected the exact 401 CLI shape"
fi

if [ -n "$TEST_EMAIL" ]; then
  # Plain REST route (not the oRPC mount): flat JSON body, no envelope.
  code="$(fetch POST /api/auth/request-magic-login "{\"email\":\"$TEST_EMAIL\"}" || true)"
  if [ "$code" = "200" ] && grep -q '"sent":true' "$tmpdir/body"; then
    pass "/api/auth/request-magic-login sent to $TEST_EMAIL (arrival is the manual step below)"
  else
    fail "/api/auth/request-magic-login — HTTP ${code:-<curl error>}, expected 200 + {\"sent\":true}"
  fi
else
  note "TEST_EMAIL unset — magic-login send skipped; the manual login check below starts from scratch"
fi

echo

# --- manual steps (a human must do these; printed always) -----------------------

echo "MANUAL STEPS — work through on the live domain (CHECKLIST.md step 7):"
manual "Passwordless login, CODE path: open the ${TEST_EMAIL:-test} mailbox (or your own), use the six-digit code from the magic-login email; it must log in and land on the app."
manual "Passwordless login, LINK path: the one-time sign-in link from the same email must log in too (send a fresh one if the code consumed the challenge)."
manual "NEW-user login: if you have a spare address, complete a first-ever login — 'login broken for a NEW user' is a rollback trigger (ROLLBACK.md)."
manual "EXISTING session: reload a browser tab that was open BEFORE the flip — still signed in, no re-login."
manual "Capture: press the capture shortcut, type a thought, enter; it lands in the inbox."
manual "Complete a task: run a focus session or complete from a list; the logbook reflects it."
manual "Lists: Today / Upcoming / Someday render and accept edits."
manual "CLI: run 'actionamp login' (browser OAuth round-trip), then one --json command ('actionamp now --json')."
manual "Billing: Settings → Billing opens the Stripe portal; close it; plan unchanged. Check a webhook event landed in the new stack's logs."
manual "Push opt-in: Settings → notifications; permission prompt fires and a subscription is created (send one test notification)."
manual "Share target (Android, if at hand): share a link into ActionAmp; it lands in the inbox."

echo
if [ "$FAILED" = "0" ]; then
  echo "verify-switch: automated checks PASS against $BASE_URL — now do the MANUAL steps above"
  exit 0
else
  echo "verify-switch: AUTOMATED FAILURES above — consult ROLLBACK.md triggers before continuing"
  exit 1
fi
