#!/usr/bin/env bash
# Keep `wasp start` alive across crashes, with proper cleanup of the children
# it orphans (nodemon → node server, vite) between attempts. A bare
# `while true; do wasp start; done` loop is a footgun: on exit wasp's children
# keep holding ports 3001 (server) + 4000 (client), so the next start fails to
# bind → tight crash loop. This wrapper kills the whole process tree, frees the
# ports, backs off if crashes repeat, then restarts.
#
# Reuses wasp-safe.sh (npm-config isolator that sidesteps the allow-scripts
# rejection some npm versions hit when Wasp invokes npm in its generated
# project). Don't bypass it.
#
# Why not nodemon/watchexec/entr: those react to *file change*, which fights
# wasp's own HMR watcher. This is *crash* restart — different trigger. Why not
# pm2/overmind: adds Node deps / tmux + Procfile for what bash does fine.
#
# Usage:
#   bash webapp/scripts/wasp-runner.sh                # supervise wasp start
#   bash webapp/scripts/wasp-runner.sh --clean        # wasp clean before first start
#   bash webapp/scripts/wasp-runner.sh -- <wasp args> # pass extra args to `wasp start`
#   WASP_RUNNER_PORTS=3500:4500 bash webapp/scripts/wasp-runner.sh  # worktree ports
#
# Run from webapp/ (or anywhere — it cd's to its own webapp/). Ctrl+C exits
# cleanly with full tree kill; a crash restarts after backoff. Logs go to
# $WEBAPP/.wasp/wasp-runner.log (timestamped) in addition to the terminal.
#
# Config (override via env):
#   WASP_RUNNER_PORTS       default: 3001:4000   server:client ports to free between runs
#   WASP_RUNNER_BACKOFF     default: 3           initial backoff seconds after a crash
#   WASP_RUNNER_BACKOFF_MAX default: 30          backoff cap (grows on repeated crashes)
#   WASP_RUNNER_LOG         default: <webapp>/.wasp/wasp-runner.log
set -euo pipefail

# ── helpers ────────────────────────────────────────────────────────────────
die() { echo "ERROR: $*" >&2; exit 1; }

# Resolve webapp/ from this script's location (webapp/scripts/ → ../).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$WEBAPP/.wasproot" ] || [ -f "$WEBAPP/main.wasp.ts" ] \
  || die "$WEBAPP doesn't look like the webapp/ (no .wasproot or main.wasp.ts)"
cd "$WEBAPP"

SAFE="$SCRIPT_DIR/wasp-safe.sh"
[ -x "$SAFE" ] || die "wasp-safe.sh not found / not executable at $SAFE"

PORTS="${WASP_RUNNER_PORTS:-3001:4000}"
BACKOFF="${WASP_RUNNER_BACKOFF:-3}"
BACKOFF_MAX="${WASP_RUNNER_BACKOFF_MAX:-30}"
mkdir -p "$WEBAPP/.wasp"
LOG="${WASP_RUNNER_LOG:-$WEBAPP/.wasp/wasp-runner.log}"

# ── arg parsing ────────────────────────────────────────────────────────────
DO_CLEAN=0
WASP_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --clean) DO_CLEAN=1; shift ;;
    --) shift; while [ $# -gt 0 ]; do WASP_ARGS+=("$1"); shift; done ;;
    -h|--help)
      sed -n '2,/^set -euo pipefail$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "unknown arg: $1 (use -- to pass args through to wasp start)" ;;
  esac
done

# ── process-tree kill ──────────────────────────────────────────────────────
# Kill the whole wasp-start tree: wasp parent(s) + the children they orphan
# (nodemon → node server, vite, `bundle/server.js`). Empirically the orphans
# do NOT contain "wasp" in their cmdline and get reparented to PID 1, so a
# name match on `wasp start` alone misses them. The reliable signal is the
# port: anything LISTENing on 3001/4000 *is* the wasp tree, whatever its name.
#
# Order matters:
#   1. Kill the wasp parent first (SIGTERM) so it stops spawning new children.
#   2. Kill whatever holds the ports — repeatedly, because nodemon's whole
#      job is to respawn node on exit, so a single kill just triggers a
#      restart. We keep re-killing the new listener until the port stays free
#      (nodemon gives up after a few rapid crash-restarts, or was already
#      gone because we killed its parent in step 1).
#   3. Sweep stragglers by name (vite, nodemon, bundle/server.js) for anything
#      not bound to our ports but still alive.
kill_tree() {
  local pids
  # 1. Wasp parent(s) — match the whole cmdline so start vs start-db differ.
  pids="$(pgrep -f 'wasp start' 2>/dev/null || true)"
  [ -n "$pids" ] && kill -KILL $pids 2>/dev/null || true

  # 2. Port holders, with respawn-tolerant retry.
  free_ports --force --quiet 2>/dev/null || true

  # 3. Named stragglers (orphaned children that aren't port listeners).
  # Match distinctive substrings — argv can have flags (e.g.
  # `node --enable-source-maps -r dotenv/config bundle/server.js`), so don't
  # anchor to `node ` at the start.
  local patterns=(
    '\.wasp/out/server/node_modules/.bin/nodemon'
    'npm exec vite'
    '\.wasp/out/server/bundle/server\.js'
    'vite/bin/vite\.js'
  )
  for pat in "${patterns[@]}"; do
    pids="$(pgrep -f "$pat" 2>/dev/null || true)"
    [ -n "$pids" ] && kill -KILL $pids 2>/dev/null || true
  done

  # 4. Final port check — if anything came back, force once more.
  free_ports --force --quiet 2>/dev/null || true
}

# Free the configured ports. Returns 0 only if both are free on return.
# --force: kill whatever holds them, retrying because nodemon respawns node
#          on exit (a single kill just bounces the listener). Keeps killing
#          the new holder until the port stays free or the retry budget runs
#          out — at which point kill_tree's named-straggler sweep takes over.
# --quiet: suppress the "still bound" diagnostic on the non-force path.
free_ports() {
  local force=0 quiet=0
  while [ $# -gt 0 ]; do
    case "$1" in --force) force=1 ;; --quiet) quiet=1 ;; esac
    shift
  done
  local server_port client_port
  server_port="${PORTS%%:*}"
  client_port="${PORTS##*:}"
  local p
  for p in "$server_port" "$client_port"; do
    pids="$(lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null || true)"
    [ -z "$pids" ] && continue
    if [ "$force" -eq 1 ]; then
      # Try up to 8 rounds: kill the current holder, brief grace, recheck.
      # Multiple rounds because nodemon restarts node on death.
      local round=0
      while [ "$round" -lt 8 ]; do
        pids="$(lsof -ti tcp:"$p" -sTCP:LISTEN 2>/dev/null || true)"
        [ -z "$pids" ] && break
        kill -KILL $pids 2>/dev/null || true
        sleep 0.4
        round=$((round + 1))
      done
    else
      [ "$quiet" -eq 1 ] && return 1
      echo "port $p still bound (pids: $(echo $pids | tr '\n' ' '))" >&2
      return 1
    fi
  done
}

# ── logging ────────────────────────────────────────────────────────────────
ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG" >&2; }

# ── cleanup on exit ────────────────────────────────────────────────────────
# on_signal: sets EXITING=1 and kills the wasp tree. The supervise loop polls
# EXITING every second (see below), notices, and breaks cleanly. We do NOT
# call `exit` from the signal trap: doing so can race with the loop's wait/
# reap. Letting the loop unwind normally keeps the flow legible and guarantees
# the bg job is reaped (no zombie).
#
# on_exit: last-resort sweep for any exit path (normal end, `die`, unexpected
# error under `set -e`). Belt-and-suspenders so we never leak ports/children.
EXITING=0
on_signal() {
  EXITING=1
  log "signal received — stopping (killing wasp tree)"
  kill_tree
}
on_exit() {
  kill_tree 2>/dev/null || true
  free_ports --force --quiet 2>/dev/null || true
}
trap on_signal INT TERM
trap on_exit EXIT

# ── preflight ──────────────────────────────────────────────────────────────
command -v lsof >/dev/null || die "lsof required (macOS has it by default)"
if free_ports --quiet; then
  log "preflight: ports $PORTS free"
else
  log "preflight: ports $PORTS busy — freeing"
  free_ports --force || die "could not free ports $PORTS; another wasp start? see bash webapp/scripts/dev-worktree.sh --list"
fi

if [ "$DO_CLEAN" -eq 1 ]; then
  log "wasp clean (--clean)"
  "$SAFE" clean
fi

# ── supervise loop ─────────────────────────────────────────────────────────
log "supervising wasp start (args: ${WASP_ARGS[*]:-none}) — Ctrl+C to stop, crash → restart"
log "log file: $LOG"
attempt=0
current_backoff="$BACKOFF"
while [ "$EXITING" -eq 0 ]; do
  attempt=$((attempt + 1))
  log "=== attempt $attempt: starting wasp ==="
  start_ts=$(date +%s)

  # Run wasp in the BACKGROUND and poll for its exit (not `wait`, which in
  # a non-interactive script is not reliably interrupted by SIGINT — the
  # trap would never fire while blocked in `wait`). Polling in 1s ticks means
  # the trap fires during `sleep`, sets EXITING, and we notice within ~1s,
  # then actively kill the wasp tree and break.
  #
  # Output streams through a `tee` process substitution so it lands in both
  # the terminal and $LOG. `$!` is wasp-safe's PID (the backgrounded command).
  # Wasp-safe execs wasp, which spawns nodemon → node server + vite —
  # kill_tree handles the whole tree by port + name (see above).
  WASP_PID=""
  rc=0
  "$SAFE" start ${WASP_ARGS[@]+"${WASP_ARGS[@]}"} > >(tee -a "$LOG") 2>&1 &
  WASP_PID=$!

  # Poll until wasp exits or the user signals stop. `kill -0` is the liveness
  # check (doesn't send a signal). 1s ticks keep the trap responsive.
  while kill -0 "$WASP_PID" 2>/dev/null; do
    if [ "$EXITING" -eq 1 ]; then
      # Trap fired — kill the tree; the outer loop's EXITING check breaks.
      kill_tree
      # Wait briefly for the bg job to actually exit so we don't orphan it.
      for _ in 1 2 3 4 5; do kill -0 "$WASP_PID" 2>/dev/null || break; sleep 0.3; done
      break
    fi
    sleep 1
  done
  # Reap the bg job's exit status (no-op if already gone, avoids a zombie).
  wait "$WASP_PID" 2>/dev/null || rc=$?
  end_ts=$(date +%s)
  dur=$((end_ts - start_ts))

  # Stop condition: trap fired (EXITING=1). Don't restart.
  if [ "$EXITING" -eq 1 ]; then
    log "wasp stopped by user signal — not restarting"
    break
  fi

  # Uptime heuristic: ran long enough → reset backoff (transient blip, not a
  # tight crash loop). Ran <5s → grow backoff (something's wrong, don't hammer).
  if [ "$dur" -ge 5 ]; then
    if [ "$current_backoff" -ne "$BACKOFF" ]; then
      log "ran ${dur}s — backoff reset to ${BACKOFF}s"
    fi
    current_backoff="$BACKOFF"
  else
    current_backoff=$((current_backoff * 2))
    [ "$current_backoff" -gt "$BACKOFF_MAX" ] && current_backoff="$BACKOFF_MAX"
    log "ran only ${dur}s (rc=$rc) — possible crash loop, backoff ${current_backoff}s"
  fi

  log "wasp exited (rc=$rc, uptime ${dur}s) — cleaning tree before restart"
  kill_tree
  free_ports --force --quiet || log "warn: could not fully free ports"

  log "restarting in ${current_backoff}s (Ctrl+C to give up)"
  # Sleep in 1s ticks so the trap fires promptly on Ctrl+C.
  for _ in $(seq 1 "$current_backoff"); do
    [ "$EXITING" -eq 1 ] && break
    sleep 1
  done
done
