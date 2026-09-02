#!/usr/bin/env bash
# Rollback helper — ROLLBACK.md, executed step by step. SKELETON BY DESIGN.
#
# The rollback itself is dashboard work (Railway domain reassignment, Stripe
# webhook URL edit). Those steps are IRREVERSIBLE-ish and credential-gated,
# so this script does NOT and MUST NOT perform them. It does the verifiable
# parts around the human steps:
#
#   1. checks the old Wasp service is still warm (it must be — I1: webapp/
#      untouched, stopped-but-startable),
#   2. prints the exact manual flip-back steps with the env-filled URLs,
#   3. AFTER you have flipped (re-run the script), verifies the rolled-back
#      stack answers like Wasp should.
#
# SAFE BY DEFAULT: every request is a read. Nothing here flips, deletes,
# or writes anything.
#
# Usage:
#   scripts/switch/rollback.sh              # pre-flip: warm-check Wasp + print steps
#   scripts/switch/rollback.sh --post-flip  # post-flip: verify the rolled-back stack
#
# Env:
#   WASP_WARM_URL       The old Wasp service's DIRECT Railway URL (the
#                       *.up.railway.app address) — after the flip the public
#                       domains point at the new stack, so the public hosts no
#                       longer prove Wasp is warm. Find it: Railway dashboard
#                       → the Wasp service → Networking. Falls back to
#                       ROLLBACK_BASE_URL when unset.
#   ROLLBACK_BASE_URL   Where the public API host will live after the flip
#                       (default https://api.actionamp.com). Used by
#                       --post-flip to verify the flipped-back domain.
#   NEW_STACK_API_URL   The new stack's direct URL, printed in the steps so
#                       the incident note records what stays deployed-but-dark.
#   STRIPE_WEBHOOK_OLD  The Wasp webhook URL to restore (recorded in the
#                       incident note before the switch changed it).
#   STRIPE_WEBHOOK_NEW  The new-stack webhook URL being reverted.
#
# Pure bash + curl. No jq, no bun, no other dependencies.

set -u -o pipefail

WASP_WARM_URL="${WASP_WARM_URL:-}"
ROLLBACK_BASE_URL="${ROLLBACK_BASE_URL:-https://api.actionamp.com}"
NEW_STACK_API_URL="${NEW_STACK_API_URL:-<fill NEW_STACK_API_URL>}"
STRIPE_WEBHOOK_OLD="${STRIPE_WEBHOOK_OLD:-<fill STRIPE_WEBHOOK_OLD>}"
STRIPE_WEBHOOK_NEW="${STRIPE_WEBHOOK_NEW:-<fill STRIPE_WEBHOOK_NEW>}"
HTTP_TIMEOUT=10

POST_FLIP=0
[ "${1:-}" = "--post-flip" ] && POST_FLIP=1

FAILED=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }
note() { printf 'note  %s\n' "$1"; }
step() { printf '\n== %s ==\n' "$1"; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "rollback helper — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
[ "$POST_FLIP" = "0" ] && echo "mode: PRE-FLIP (checks + printed steps)" \
                      || echo "mode: POST-FLIP (verify the rolled-back stack)"

# --- step 1: is the old Wasp service still warm? -------------------------------
# /founding-100/status is public on BOTH stacks, so it proves "serving" but
# not "which stack" — run it against the DIRECT Wasp URL, not the public one.

if [ -z "$WASP_WARM_URL" ]; then
  WASP_WARM_URL="$ROLLBACK_BASE_URL"
  note "WASP_WARM_URL unset — checking the public host instead; set the direct"
  note "Railway URL of the Wasp service to truly prove Wasp (not the new stack) answers"
fi

step "1. Old Wasp service warm check ($WASP_WARM_URL)"

code="$(curl -s --max-time "$HTTP_TIMEOUT" -o "$tmpdir/body" -w '%{http_code}' \
          "$WASP_WARM_URL/founding-100/status")"
if [ "$code" = "200" ] && grep -q '"cap"' "$tmpdir/body"; then
  pass "GET /founding-100/status → 200 with payload (service is serving)"
else
  fail "GET /founding-100/status — HTTP $code. Wasp is NOT answering: wake it (Railway → deploy/restart) BEFORE flipping anything"
fi

code="$(curl -s --max-time "$HTTP_TIMEOUT" -o "$tmpdir/body" -w '%{http_code}' \
          "$WASP_WARM_URL/api/cli/whoami")"
if [ "$code" = "401" ]; then
  pass "GET /api/cli/whoami (no auth) → 401 (the API surface is up, gate behaves)"
else
  note "GET /api/cli/whoami — HTTP $code (expected 401; investigate if the flip proceeds)"
fi

if [ "$POST_FLIP" = "0" ]; then

  # --- steps 2–4: the human steps, printed not executed ------------------------

  step "2–4. MANUAL flip-back (do these in the dashboards — this script cannot)"
  cat <<STEPS

  a. Note the time first (write-conflict window — ROLLBACK.md):
         date -u

  b. Railway → project {{RAILWAY_PROJECT}} → service networking:
         app.actionamp.com  → move back to the WASP service
         api.actionamp.com  → move back to the WASP service
     (fill {{RAILWAY_PROJECT}} and the service name from the Railway
      dashboard; do NOT delete the new-stack deployment — it stays for
      diagnosis: $NEW_STACK_API_URL)

  c. Stripe → Developers → Webhooks → the ActionAmp endpoint:
         URL: $STRIPE_WEBHOOK_NEW
         → restore to: $STRIPE_WEBHOOK_OLD

  d. Wait ~1 minute for Railway domain propagation, then RE-RUN:
         scripts/switch/rollback.sh --post-flip

STEPS

  step "5. After the flip, verify the ROLLBACK.md triggers are clear"
  cat <<VERIFY

  - fresh passwordless login completes (code + link)
  - one write works: capture an item, complete a task
  - billing: the portal opens; plan reads correctly; webhook events land

  Then resume the 48h watch — on Wasp now. If data DAMAGE (not just
  breakage) is suspected: the backup restore is DESTRUCTIVE and Jake's
  call alone (ROLLBACK.md §switch window). Nothing in this script set
  restores anything.

VERIFY

else

  # --- post-flip: verify the rolled-back stack ---------------------------------
  # After the flip, the public API host IS Wasp again. The checks are
  # Wasp-appropriate: public status + the auth-failure shapes, which are
  # byte-identical across both stacks (parity was the bar).

  step "5. Rolled-back stack verification ($ROLLBACK_BASE_URL)"

  code="$(curl -s --max-time "$HTTP_TIMEOUT" -o "$tmpdir/body" -w '%{http_code}' \
            "$ROLLBACK_BASE_URL/founding-100/status")"
  if [ "$code" = "200" ] && grep -q '"cap"' "$tmpdir/body"; then
    pass "public /founding-100/status → 200 (domain is being served again)"
  else
    fail "public /founding-100/status — HTTP $code (domain flip not propagated yet? wait a minute and re-run)"
  fi

  code="$(curl -s --max-time "$HTTP_TIMEOUT" -o "$tmpdir/body" -w '%{http_code}' \
            -H 'authorization: Bearer aa_rollback_check_bogus' \
            "$ROLLBACK_BASE_URL/api/cli/whoami")"
  if [ "$code" = "401" ] && grep -q '"error":"Invalid or revoked token."' "$tmpdir/body"; then
    pass "bogus PAT → 401 CLI shape (API gate behaving on the rolled-back host)"
  else
    fail "bogus PAT probe — HTTP $code, expected the 401 CLI shape"
  fi

  echo
  cat <<REMAINING
  note: the remaining post-rollback checks are human ones (login, one write,
  billing — printed in step 5 above and in ROLLBACK.md). Do them in a browser.
REMAINING

fi

echo
if [ "$FAILED" = "0" ]; then
  echo "rollback helper: checks PASS — continue with the printed steps"
  exit 0
else
  echo "rollback helper: CHECK FAILURES above — fix before/after flipping per the notes"
  exit 1
fi
