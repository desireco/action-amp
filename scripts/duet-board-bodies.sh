#!/usr/bin/env bash
#
# duet-board-bodies.sh — sync the Summary + Why from each Duet unit's markdown
# file into the matching GitHub Projects item's body, so cards are self-
# describing on the board.
#
# Honors the Projects-wins contract (docs/specs/github-projects-sync.md):
# the item body is a *mirror* for board readability, not the source. The body
# holds a Source pointer + the Summary section + the Why section (capped at
# ~500 chars). Full done-conditions, decisions locked, non-goals, and review
# findings stay in the file — the body never duplicates them.
#
# Re-run any time after editing a spec's Summary or Why to refresh the board.
# Idempotent: a second run with no changes produces the same bodies.
#
# Usage:
#   scripts/duet-board-bodies.sh                # update all synced units
#   scripts/duet-board-bodies.sh <slug>         # update one unit by slug
#
# Prerequisites:
#   - gh authed with read:project + project scopes
#   - units already pushed to the board (each carries gh_node_id in frontmatter)
#   - the GitHub Project (default: ActionAmp Duet, #5 under @me)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ─── config ──────────────────────────────────────────────────────────────────
PROJECT_NUMBER="${DUET_PROJECT_NUMBER:-5}"
PROJECT_OWNER="${DUET_PROJECT_OWNER:-@me}"

if ! command -v gh >/dev/null 2>&1; then
  echo "✗ gh CLI not found" >&2; exit 1
fi

# ─── python (3) ──────────────────────────────────────────────────────────────
PY="python3"

# ─── do the work in one python invocation (bash is just the wrapper) ─────────
"$PY" - "$PROJECT_NUMBER" "$PROJECT_OWNER" "${1:-}" <<'PYEOF'
import json, os, re, subprocess, sys, time

PROJECT_NUMBER = sys.argv[1]
PROJECT_OWNER = sys.argv[2]
ONLY_SLUG = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None

def gh(args):
    r = subprocess.run(['gh'] + args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"gh failed: {r.stderr.strip()[:200]}")
    return r.stdout

# ─── fetch board state ───────────────────────────────────────────────────────
items = json.loads(
    gh(['project','item-list', PROJECT_NUMBER, '--owner', PROJECT_OWNER, '--format','json', '--limit','100'])
)['items']

# Build slug → (pvti, di) mapping. Slug comes from the Duet ID field.
board = {}
for it in items:
    slug = it.get('duet ID') or ''
    if not slug: continue
    di = it.get('content',{}).get('id')
    if not di: continue
    board[slug] = {'pvti': it['id'], 'di': di}

if not board:
    print("✗ no items with a Duet ID found on the board", file=sys.stderr)
    sys.exit(1)

# ─── extract Summary + Why from each unit file ───────────────────────────────
def extract_sections(path):
    with open(path) as f: text = f.read()
    body = re.sub(r'^---\n.*?\n---\n*', '', text, count=1, flags=re.DOTALL)
    body = re.sub(r'^# .*\n+', '', body)
    sections = {}
    parts = re.split(r'^(## .+)$', body, flags=re.MULTILINE)
    current = None
    for p in parts:
        if p.startswith('## '):
            current = p[3:].strip().split('(')[0].strip().lower()
            sections[current] = ''
        elif current:
            sections[current] += p
    def clean(s):
        s = re.sub(r'<!--.*?-->', '', s, flags=re.DOTALL)
        s = re.sub(r'\n{3,}', '\n\n', s).strip()
        return s
    return (clean(sections.get('summary') or sections.get('what') or ''),
            clean(sections.get('why') or ''))

def cap(s, n=500):
    if len(s) <= n: return s
    cut = s.rfind('\n\n', 0, n+100)
    if cut == -1 or cut < n//2:
        cut = s.rfind('. ', 0, n+50)
        cut = cut + 1 if cut != -1 else n
    return s[:cut].rstrip() + ' …'

def make_body(path, summary, why):
    parts = [
        f"> **Source:** `{path}` — full done-conditions, decisions, and review "
        f"findings live in the file. This body is a board-readable mirror.",
        "",
        "## Summary",
        "",
        summary if summary else "_(no summary — see the file.)_",
        "",
    ]
    if why:
        parts += ["## Why", "", cap(why, 500)]
    return '\n'.join(parts)

# ─── iterate ─────────────────────────────────────────────────────────────────
slugs = [ONLY_SLUG] if ONLY_SLUG else sorted(board.keys())
updated = 0
skipped = 0
errors = []

for slug in slugs:
    if slug not in board:
        errors.append(f"{slug}: not on the board (no matching Duet ID)")
        continue

    # find the file
    path = None
    for folder in ('docs/specs', 'docs/backlog', 'docs/tasks'):
        candidate = f"{folder}/{slug}.md"
        if os.path.exists(candidate):
            path = candidate; break
    if not path:
        errors.append(f"{slug}: no file in docs/{{specs,backlog,tasks}}/")
        continue

    summary, why = extract_sections(path)
    body = make_body(path, summary, why)
    di = board[slug]['di']

    try:
        gh(['project','item-edit','--id', di, '--body', body])
        updated += 1
        print(f"  ✓ {slug}")
    except RuntimeError as e:
        errors.append(f"{slug}: {str(e)[:120]}")
    time.sleep(0.2)

print()
print(f"updated: {updated}")
print(f"skipped: {skipped}")
if errors:
    print(f"errors:  {len(errors)}", file=sys.stderr)
    for e in errors: print(f"  ✗ {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
