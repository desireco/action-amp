#!/usr/bin/env bash
#
# duet-pull-next.sh — Build's claim path. Find the next unit to work on by
# reading the GitHub Projects board (not the files), pick one by round-robin/
# priority, and flip it to Building on BOTH the board and the file in one
# atomic step.
#
# This is the board-primary pull per docs/specs/build-pulls-from-board.md.
# Build calls this as step 1 of its loop. The board IS the queue; the file's
# status: frontmatter follows as a side effect.
#
# Board-first ordering (D3 of the spec): flip the card on the board first,
# then rewrite the file. If the board flip succeeds but the file write fails,
# the script exits non-zero — run duet-sync-pull.sh to reconcile. The reverse
# order risks two Builds pulling the same unit; board-first makes the board
# authoritative at every instant.
#
# Usage:
#   scripts/duet-pull-next.sh               # claim one Next item
#   scripts/duet-pull-next.sh --dry-run     # show what would be claimed, flip nothing
#   scripts/duet-pull-next.sh --kind spec   # restrict to one kind
#   scripts/duet-pull-next.sh --slug X      # claim a specific slug (must be Next)
#
# Config via env (defaults shown):
#   DUET_PROJECT_NUMBER=5  DUET_PROJECT_OWNER=@me
#
# Exit codes: 0 = claimed or idle (both valid); 1 = error (gh, auth, file write).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_NUMBER="${DUET_PROJECT_NUMBER:-5}"
PROJECT_OWNER="${DUET_PROJECT_OWNER:-@me}"
DRY_RUN=0
KIND_FILTER=""
SLUG_FILTER=""

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --kind)    KIND_FILTER="$2"; shift 2 ;;
    --slug)    SLUG_FILTER="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "✗ unknown arg: $1" >&2; usage 1 ;;
  esac
done

for cmd in gh python3 git; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "✗ $cmd not found" >&2; exit 1; }
done

# ─── fetch board state + field/option IDs ────────────────────────────────────
if ! BOARD_JSON="$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --limit 100 2>/dev/null)"; then
  echo "✗ gh project item-list failed (token scope? project number?)" >&2
  exit 1
fi

# Fetch Status field ID + the "Building" option ID at runtime (these change
# when the field is edited — the bug we hit earlier in the session).
FIELD_META="$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json 2>/dev/null)" || {
  echo "✗ gh project field-list failed" >&2; exit 1; }

# ─── all the real work in python ─────────────────────────────────────────────
python3 - "$BOARD_JSON" "$FIELD_META" "$REPO_ROOT" "$DRY_RUN" "$KIND_FILTER" "$SLUG_FILTER" "$PROJECT_NUMBER" "$PROJECT_OWNER" <<'PYEOF'
import json, os, re, subprocess, sys
from datetime import datetime, timezone

(board_json, field_meta, repo_root, dry_run, kind_filter, slug_filter,
 project_number, project_owner) = sys.argv[1:10]
dry_run = int(dry_run)
board = json.loads(board_json)['items']
fields = json.loads(field_meta)['fields']

# Find Status field ID + the "Building" option ID
status_field_id = None
building_option_id = None
for f in fields:
    if f.get('name') == 'Status':
        status_field_id = f.get('id')
        for opt in f.get('options') or []:
            if opt.get('name') == 'Building':
                building_option_id = opt.get('id')
                break
        break
if not status_field_id or not building_option_id:
    print("✗ couldn't find Status field or Building option on the board", file=sys.stderr)
    print(f"  status_field_id={status_field_id} building_option_id={building_option_id}", file=sys.stderr)
    sys.exit(1)

# Get the project node ID (PVT_...) for item-edit calls
project_node = None
# field-list doesn't return the project node id; we need it for item-edit.
# Fetch it via project view.
try:
    proj_json = subprocess.run(
        ['gh', 'project', 'view', str(project_number), '--owner', project_owner, '--format', 'json'],
        capture_output=True, text=True, check=True).stdout
    project_node = json.loads(proj_json).get('id') or json.loads(proj_json).get('url','').split('/')[-1]
    # gh project view returns 'id' in some versions; fall back to parsing from url
    if not project_node.startswith('PVT_'):
        # try the raw GraphQL
        gql = subprocess.run(['gh','api','graphql','-f','query={ user(login: "'+ \
            subprocess.run(['gh','api','user','--jq','.login'],capture_output=True,text=True,check=True).stdout.strip() +'") { projectV2(number: '+str(project_number)+') { id } } }'],
            capture_output=True, text=True, check=True).stdout
        project_node = json.loads(gql)['data']['user']['projectV2']['id']
except Exception as e:
    print(f"✗ couldn't resolve project node id: {e}", file=sys.stderr)
    sys.exit(1)

def find_file_for_slug(slug):
    for folder in ('docs/specs', 'docs/backlog', 'docs/tasks'):
        p = os.path.join(repo_root, folder, f"{slug}.md")
        if os.path.exists(p): return p
    return None

def rewrite_status_in_file(path, now_iso):
    """Rewrite status: next → building + stamp gh_synced_at. Prose untouched."""
    with open(path) as f: text = f.read()
    m = re.match(r'^(---\n)(.*?)(\n---)', text, re.DOTALL)
    if not m: raise RuntimeError(f"no frontmatter in {path}")
    fm = m.group(2)
    # Rewrite status value (preserve formatting/comment after value? no — status
    # carries no comment in our convention; rewrite the whole value)
    status_pat = re.compile(r'^(status:)(.*)$', re.MULTILINE | re.IGNORECASE)
    if not status_pat.search(fm):
        raise RuntimeError(f"no status: field in {path}")
    fm = status_pat.sub(r'\1 building', fm)
    # Stamp gh_synced_at (replace whole line)
    sync_pat = re.compile(r'^gh_synced_at:.*$', re.MULTILINE)
    if sync_pat.search(fm):
        fm = sync_pat.sub(f'gh_synced_at: {now_iso}', fm)
    else:
        # append after gh_node_id if present, else at end
        if re.search(r'^gh_node_id:', fm, re.MULTILINE):
            fm = re.sub(r'^(gh_node_id:.*)$', rf'\1\ngh_synced_at: {now_iso}',
                        fm, count=1, flags=re.MULTILINE)
        else:
            fm = fm.rstrip() + f"\ngh_synced_at: {now_iso}"
    new_text = text[:m.start(2)] + fm + text[m.end(2):]
    with open(path, 'w') as f: f.write(new_text)

# ─── select ──────────────────────────────────────────────────────────────────
# Build pulls Status=Next items, round-robin across Kind, then highest
# Priority, then oldest Created. We don't have Created as a sortable field
# easily from item-list, so we use the gh_node_id suffix as a rough age proxy
# (later items get later IDs). Good enough for tie-breaking.
candidates = []
for it in board:
    if it.get('status') != 'Next': continue
    if kind_filter and it.get('kind') != kind_filter: continue
    if slug_filter and it.get('duet ID') != slug_filter: continue
    candidates.append(it)

if not candidates:
    ready_count = sum(1 for it in board if it.get('status') == 'Ready')
    print(f"idle: 0 Next items ({ready_count} Ready awaiting promotion)")
    sys.exit(0)

# Round-robin across kinds: prefer the kind least recently claimed.
# Without persistent state, we approximate by rotating kind order using a hash
# of the current minute (cheap determinism). Within a kind, priority desc.
KIND_ORDER = ['spec', 'backlog', 'task', 'bug']
def sort_key(it):
    kind_idx = KIND_ORDER.index(it.get('kind','spec')) if it.get('kind') in KIND_ORDER else 99
    prio_order = {'P0':0,'P1':1,'P2':2,'P3':3}
    prio_idx = prio_order.get(it.get('priority','P3'), 3)
    # age proxy: last 6 chars of item id (later = larger)
    age = it.get('id','')[-6:]
    return (kind_idx, prio_idx, age)
candidates.sort(key=sort_key)

# Round-robin: if we have multiple kinds present, pick the kind that appears
# first in KIND_ORDER among those present. (Simplification of true round-robin;
# good enough for v1.)
chosen = candidates[0]
slug = chosen.get('duet ID')
path = find_file_for_slug(slug)

if not path:
    print(f"✗ claimed {slug} on board but no file found in docs/{{specs,backlog,tasks}}/", file=sys.stderr)
    sys.exit(1)

rel_path = os.path.relpath(path, repo_root)

if dry_run:
    print(f"would claim: {slug}")
    print(f"  kind: {chosen.get('kind')}, priority: {chosen.get('priority')}, tier: {chosen.get('tier')}")
    print(f"  file: {rel_path}")
    print(f"  (board flip: Next → Building; file rewrite + commit)")
    sys.exit(0)

# ─── claim (board-first, then file) ──────────────────────────────────────────
now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
item_pvti = chosen['id']

# 1. Flip the board card
r = subprocess.run(
    ['gh','project','item-edit',
     '--id', item_pvti,
     '--field-id', status_field_id,
     '--project-id', project_node,
     '--single-select-option-id', building_option_id],
    capture_output=True, text=True)
if r.returncode != 0:
    print(f"✗ board flip failed for {slug}: {r.stderr.strip()[:200]}", file=sys.stderr)
    sys.exit(1)

# 2. Rewrite the file + commit
try:
    rewrite_status_in_file(path, now_iso)
    subprocess.run(['git','add',path], check=True, cwd=repo_root)
    r = subprocess.run(['git','commit','-m',f'duet: {slug} → building'],
                       cwd=repo_root, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"git commit failed: {r.stderr.strip()[:200]}")
except Exception as e:
    print(f"✗ board flipped to Building for {slug} but file write failed: {e}", file=sys.stderr)
    print(f"  run scripts/duet-sync-pull.sh to reconcile", file=sys.stderr)
    sys.exit(1)

print(f"claimed: {slug}")
print(f"  kind: {chosen.get('kind')}, priority: {chosen.get('priority')}, tier: {chosen.get('tier')}")
print(f"  file: {rel_path}")
print(f"  board: Next → Building; file: status: next → building; committed: duet: {slug} → building")
PYEOF
