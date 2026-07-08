#!/usr/bin/env bash
#
# duet-sync-pull.sh — pull lifecycle field changes from the GitHub Projects
# board into the matching Duet unit files (Projects → file direction).
#
# Run this after you've steered the board (dragged cards, edited Status /
# Priority / Kind / Feature fields). It finds every synced unit whose board
# value differs from the file's frontmatter, rewrites the file to match the
# board, and commits each change as `duet: <slug> → <field>=<value>`.
#
# Projects wins on lifecycle fields (docs/specs/github-projects-sync.md §D2):
# if the file disagrees with the board, the file is rewritten. Prose is never
# touched. gh_synced_at is stamped on every applied change.
#
# Why this exists instead of an Action: the projects_v2_item webhook event
# only fires for organization-owned projects, not user-owned ones (which is
# what desireco is). So real-time write-back isn't possible without an org
# conversion or a GitHub App. This script is the honest v1: you steer the
# board, then run one command to commit the changes. See the spec's §D7
# Reversal note for the full reasoning.
#
# Usage:
#   scripts/duet-sync-pull.sh              # apply changes, commit each
#   scripts/duet-sync-pull.sh --dry-run    # show what would change, commit nothing
#   scripts/duet-sync-pull.sh --slug X     # only check/apply one unit
#
# Config via env (defaults shown):
#   DUET_PROJECT_NUMBER=5  DUET_PROJECT_OWNER=@me
#
# Exit codes: 0 = success (even if 0 changes); 1 = gh/auth error.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PROJECT_NUMBER="${DUET_PROJECT_NUMBER:-5}"
PROJECT_OWNER="${DUET_PROJECT_OWNER:-@me}"
DRY_RUN=0
ONLY_SLUG=""

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --slug)    ONLY_SLUG="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "✗ unknown arg: $1" >&2; usage 1 ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "✗ gh CLI not found" >&2; exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ python3 not found" >&2; exit 1
fi

# ─── fetch board state once ──────────────────────────────────────────────────
if ! BOARD_JSON="$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json 2>/dev/null)"; then
  echo "✗ gh project item-list failed (token scope? project number?)" >&2
  exit 1
fi

# ─── main work in python (bash is the wrapper) ───────────────────────────────
python3 - "$BOARD_JSON" "$REPO_ROOT" "$DRY_RUN" "$ONLY_SLUG" <<'PYEOF'
import json, os, re, subprocess, sys
from datetime import datetime, timezone

board_json, repo_root, dry_run, only_slug = sys.argv[1:5]
dry_run = int(dry_run)
board = json.loads(board_json)['items']

# Lifecycle fields we sync (Projects → file). These are the keys gh flattens
# from the Projects item. Title is handled separately (it's `<slug>: <title>`
# on the board; only the title-after-colon maps back to frontmatter).
LIFECYCLE = ['status', 'priority', 'kind', 'feature']

# Status on the board is capitalized ("Ready"); in the file it's lowercase
# ("ready"). Normalize: board value lowercased = file value (for these
# enum-ish fields). For free-text fields (feature), compare as-is.
ENUM_FIELDS = {'status', 'priority', 'kind'}

def parse_frontmatter(path):
    with open(path) as f: text = f.read()
    m = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not m: return {}
    fm = {}
    for line in m.group(1).split('\n'):
        # skip comment-only lines and the sync-managed header comment
        if line.strip().startswith('#') or not line.strip(): continue
        if ':' not in line: continue
        k, _, v = line.partition(':')
        v = v.split('#')[0].strip().strip('"').strip("'")
        if v: fm[k.strip()] = v
    return fm

def find_file_for_slug(slug):
    for folder in ('docs/specs', 'docs/backlog', 'docs/tasks'):
        p = os.path.join(repo_root, folder, f"{slug}.md")
        if os.path.exists(p): return p
    return None

def write_frontmatter_change(path, field, new_value, now_iso):
    """Rewrite one frontmatter key + stamp gh_synced_at. Prose untouched.

    Placement rules:
    - If the field exists, replace its value in place.
    - If the field is missing, insert it BEFORE the '# sync-managed' comment
      block (or before gh_node_id if no comment), so lifecycle fields stay
      grouped together and don't get appended after the sync-managed keys.
    - gh_synced_at: replace in place if present (preserve trailing comment up
      to the value), else append to the sync-managed block.
    """
    with open(path) as f: text = f.read()
    m = re.match(r'^(---\n)(.*?)(\n---)', text, re.DOTALL)
    if not m: raise RuntimeError(f"no frontmatter in {path}")
    fm = m.group(2)

    # 1. The target field
    pattern = re.compile(r'^(' + re.escape(field) + r':)(.*)$', re.MULTILINE | re.IGNORECASE)
    if pattern.search(fm):
        fm = pattern.sub(rf'\1 {new_value}', fm)
    else:
        # find insertion point: before the '# sync-managed' comment line, or
        # before gh_node_id if no comment, or at the end
        insert_line = None
        fm_lines = fm.split('\n')
        for i, line in enumerate(fm_lines):
            stripped = line.strip()
            if stripped.startswith('# sync-managed') or stripped.startswith('gh_node_id'):
                insert_line = i; break
        if insert_line is not None:
            # back up over blank lines so we insert before the blank gap too
            while insert_line > 0 and fm_lines[insert_line-1].strip() == '':
                insert_line -= 1
            fm_lines.insert(insert_line, f"{field}: {new_value}")
            # ensure a blank line remains after the lifecycle block
            if insert_line + 1 < len(fm_lines) and fm_lines[insert_line+1].strip() != '':
                fm_lines.insert(insert_line+1, '')
        else:
            fm_lines.append(f"{field}: {new_value}")
        fm = '\n'.join(fm_lines)

    # 2. gh_synced_at — replace value only (preserve any trailing comment text
    # after the value by rewriting the whole line)
    sync_pattern = re.compile(r'^gh_synced_at:.*$', re.MULTILINE)
    if sync_pattern.search(fm):
        fm = sync_pattern.sub(f'gh_synced_at: {now_iso}', fm)
    else:
        # append into the sync-managed block (after gh_node_id if present)
        if re.search(r'^gh_node_id:', fm, re.MULTILINE):
            fm = re.sub(r'^(gh_node_id:.*)$', rf'\1\ngh_synced_at: {now_iso}',
                        fm, count=1, flags=re.MULTILINE)
        else:
            fm = fm.rstrip() + f"\ngh_synced_at: {now_iso}"

    new_text = text[:m.start(2)] + fm + text[m.end(2):]
    with open(path, 'w') as f: f.write(new_text)

def git_commit(path, slug, field, value):
    msg = f"duet: {slug} → {field}={value}"
    subprocess.run(['git', 'add', path], check=True, cwd=repo_root)
    r = subprocess.run(['git', 'commit', '-m', msg], cwd=repo_root,
                       capture_output=True, text=True)
    return r.returncode == 0

# ─── iterate ─────────────────────────────────────────────────────────────────
now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
changes = []  # (slug, field, old, new, path)
skipped_no_file = []
skipped_no_id = []

for item in board:
    slug = item.get('duet ID')
    if not slug:
        skipped_no_id.append(item.get('title','?')[:40])
        continue
    if only_slug and slug != only_slug:
        continue

    path = find_file_for_slug(slug)
    if not path:
        skipped_no_file.append(slug)
        continue

    fm = parse_frontmatter(path)
    for field in LIFECYCLE:
        board_val = item.get(field)
        if board_val is None or board_val == '':
            continue  # board field unset; don't clobber
        # '(none)' is a board-side placeholder for "no value" — skip it
        # when the file genuinely lacks the field (don't write '(none)' in)
        if board_val == '(none)' and field not in fm:
            continue
        # normalize for comparison
        cmp_board = board_val.lower() if field in ENUM_FIELDS else board_val
        cmp_file = fm.get(field, '').lower() if field in ENUM_FIELDS else fm.get(field, '')
        if cmp_board == cmp_file:
            continue  # in sync
        changes.append((slug, field, fm.get(field, '(unset)'), board_val, path))

# ─── report + apply ──────────────────────────────────────────────────────────
if not changes:
    print("✓ everything in sync — no changes to pull.")
    if skipped_no_file:
        print(f"  ({len(skipped_no_file)} board items have no matching file: {', '.join(skipped_no_file[:5])})", file=sys.stderr)
    sys.exit(0)

print(f"found {len(changes)} field change(s) to pull:\n")
for slug, field, old, new, path in changes:
    rel = os.path.relpath(path, repo_root)
    print(f"  {slug:30} {field}: {old!r} → {new!r}")
    print(f"    {rel}")

if dry_run:
    print("\n--dry-run: no changes made.")
    sys.exit(0)

print("\napplying...")
applied = 0
errors = []
for slug, field, old, new, path in changes:
    try:
        write_frontmatter_change(path, field, new, now_iso)
        if git_commit(path, slug, field, new):
            applied += 1
            print(f"  ✓ committed: duet: {slug} → {field}={new}")
        else:
            errors.append(f"{slug}: git commit failed")
    except Exception as e:
        errors.append(f"{slug}: {str(e)[:100]}")

print(f"\napplied: {applied}/{len(changes)}")
if errors:
    print(f"errors: {len(errors)}", file=sys.stderr)
    for e in errors: print(f"  ✗ {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
