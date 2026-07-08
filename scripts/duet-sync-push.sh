#!/usr/bin/env bash
#
# duet-sync-push.sh — push Duet unit files into the GitHub Projects board
# (file → Projects direction). The reconciliation path.
#
# For every unit in docs/specs/, docs/backlog/, docs/tasks/:
#   - No matching board item → create a draft issue, populate every field from
#     the file's frontmatter, and write the new item's node ID back into the
#     file as gh_node_id (write-once).
#   - Matching item (by gh_node_id, or by Duet ID when gh_node_id is absent)
#     → NO-OP on lifecycle fields (Projects wins; use duet-sync-pull.sh for
#     that). Only backfills prose-derived / non-lifecycle fields the board
#     can't set by dragging: Duet ID, Path, Created, Tier (derived), and the
#     item body (a pointer + Summary/Why mirror).
#
# Idempotent: a second run with no changes reports "0 updated, 0 created" and
# touches nothing. gh_synced_at is stamped only when a file actually changes
# (i.e. on first push, when gh_node_id is written in).
#
# This is the reconciliation half of the Projects-wins contract
# (docs/specs/github-projects-sync.md §D7). The other direction (Projects →
# file) is duet-sync-pull.sh. The real-time GitHub Action from the spec's
# §D7 is deferred — projects_v2_item webhooks don't fire for user-owned
# projects, and desireco is a user account. See the spec's Open Questions.
#
# Usage:
#   scripts/duet-sync-push.sh              # create + backfill all units
#   scripts/duet-sync-push.sh --dry-run    # show what would happen, change nothing
#   scripts/duet-sync-push.sh --slug X     # only push one unit
#   scripts/duet-sync-push.sh --backfill-bodies  # also refresh item bodies (Summary/Why)
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
BACKFILL_BODIES=0

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)        DRY_RUN=1; shift ;;
    --slug)           ONLY_SLUG="$2"; shift 2 ;;
    --backfill-bodies) BACKFILL_BODIES=1; shift ;;
    -h|--help)        usage 0 ;;
    *) echo "✗ unknown arg: $1" >&2; usage 1 ;;
  esac
done

for cmd in gh python3 git; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "✗ $cmd not found" >&2; exit 1; }
done

# ─── fetch board state + field metadata once ─────────────────────────────────
if ! BOARD_JSON="$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json 2>/dev/null)"; then
  echo "✗ gh project item-list failed (token scope? project number?)" >&2
  exit 1
fi

if ! FIELD_META="$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json 2>/dev/null)"; then
  echo "✗ gh project field-list failed" >&2
  exit 1
fi

if ! PROJECT_JSON="$(gh project view "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json 2>/dev/null)"; then
  echo "✗ gh project view failed (can't resolve project node id)" >&2
  exit 1
fi

# ─── all the real work in python ─────────────────────────────────────────────
python3 - "$BOARD_JSON" "$FIELD_META" "$PROJECT_JSON" "$REPO_ROOT" \
            "$DRY_RUN" "$ONLY_SLUG" "$BACKFILL_BODIES" <<'PYEOF'
import json, os, re, subprocess, sys, time
from datetime import datetime, timezone

(board_json, field_meta, project_json, repo_root, dry_run, only_slug,
 backfill_bodies) = sys.argv[1:9]
dry_run = int(dry_run)
backfill_bodies = int(backfill_bodies)
board = json.loads(board_json)['items']
fields = json.loads(field_meta)['fields']
project = json.loads(project_json)

# ─── resolve the project node id (PVT_...) ───────────────────────────────────
# gh project view --format json returns 'id' on newer gh, 'url' always.
project_node = project.get('id') or ''
if not project_node.startswith('PVT_'):
    # fall back to a GraphQL lookup
    try:
        gql = subprocess.run(
            ['gh','api','graphql','-f',
             'query={ viewer { projectV2(number: ' + str(project.get('number','5')) +
             ') { id } } }'],
            capture_output=True, text=True, check=True).stdout
        project_node = json.loads(gql)['data']['viewer']['projectV2']['id']
    except Exception as e:
        print(f"✗ couldn't resolve project node id: {e}", file=sys.stderr)
        sys.exit(1)

# ─── field + option IDs (resolved at runtime; ids change when fields are edited) ──
F = {}  # name → {id, type, options{name→id}}
for f in fields:
    name = f.get('name')
    if not name: continue
    entry = {'id': f.get('id'), 'type': f.get('type'), 'options': {}}
    for opt in f.get('options') or []:
        entry['options'][opt.get('name')] = opt.get('id')
    F[name] = entry

for need in ('Status','Kind','Priority','Tier','Feature','Duet ID','Path','Created'):
    if need not in F:
        print(f"✗ board is missing custom field '{need}'", file=sys.stderr)
        sys.exit(1)

# Priority → Tier derivation (matches the live board: P0/P1→Now, P2→Next,
# P3→Later). Icebox is reserved for backlog-draft maybes that haven't earned a
# slot — we don't write it on push; a human drags there if they want.
TIER_FROM_PRIORITY = {
    'P0': 'Now', 'P1': 'Now',
    'P2': 'Next',
    'P3': 'Later',
}

# ─── helpers ─────────────────────────────────────────────────────────────────
def gh(args, check=True):
    r = subprocess.run(['gh'] + args, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"gh failed: {r.stderr.strip()[:200]}")
    return r

def gh_json(args):
    return json.loads(gh(args).stdout)

def gh_graphql(query, **variables):
    args = ['api','graphql','-f', f'query={query}']
    for k, v in variables.items():
        args += ['-f', f'{k}={v}']
    r = gh(args)
    return json.loads(r.stdout)

def parse_frontmatter(path, slug):
    """Parse frontmatter, filling defaults for the keys stub files omit.

    Some backlog/spec stubs carry only `feature:` + `status:`. We derive the
    rest so they still sync cleanly: id from the slug, title from the first
    `# ` heading, kind/ priority from sensible defaults.
    """
    with open(path) as f: text = f.read()
    m = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not m:
        fm = {}
    else:
        fm = {}
        for line in m.group(1).split('\n'):
            if line.strip().startswith('#') or not line.strip(): continue
            if ':' not in line: continue
            k, _, v = line.partition(':')
            v = v.split('#')[0].strip().strip('"').strip("'")
            if v: fm[k.strip()] = v
    # defaults for stub files
    fm.setdefault('id', slug)
    fm.setdefault('kind', 'spec')
    fm.setdefault('priority', 'P3')
    fm.setdefault('status', 'draft')
    if 'title' not in fm:
        # derive from the first # heading in the body
        hm = re.search(r'^# (.+)$', text, re.MULTILINE)
        fm['title'] = hm.group(1).strip() if hm else slug
    return fm, text

def find_unit_files():
    """Yield (slug, path) for every unit file across the three folders."""
    seen = set()
    for folder in ('docs/specs', 'docs/backlog', 'docs/tasks'):
        d = os.path.join(repo_root, folder)
        if not os.path.isdir(d): continue
        for name in sorted(os.listdir(d)):
            if not name.endswith('.md') or name == 'README.md': continue
            slug = name[:-3]
            if slug in seen: continue   # specs/foo.md wins over backlog/foo.md
            seen.add(slug)
            yield slug, os.path.join(d, name)

def write_gh_node_id(path, fm_text_full, node_id, now_iso):
    """Write gh_node_id (write-once) + gh_synced_at into a file's frontmatter.

    Only called on first push, when the item was just created. Inserts the
    sync-managed block after the human-authored frontmatter, before the
    closing ---. Prose untouched.
    """
    with open(path) as f: text = f.read()
    m = re.match(r'^(---\n)(.*?)(\n---)', text, re.DOTALL)
    if not m: raise RuntimeError(f"no frontmatter in {path}")
    fm = m.group(2)

    # gh_node_id — write-once. If somehow present, don't overwrite.
    if not re.search(r'^gh_node_id:', fm, re.MULTILINE):
        # ensure there's a blank line then the sync-managed block
        if not fm.endswith('\n'):
            fm += '\n'
        # back up over trailing blank lines
        fm = fm.rstrip('\n') + '\n\n# sync-managed (do not hand-edit; written by duet sync):\n'
        fm += f'gh_node_id: {node_id}      # sync-managed (write-once)\n'
        fm += f'gh_synced_at: {now_iso}   # sync-managed (drift detection)'
    else:
        # already has gh_node_id; just refresh gh_synced_at
        sync_pat = re.compile(r'^gh_synced_at:.*$', re.MULTILINE)
        if sync_pat.search(fm):
            fm = sync_pat.sub(f'gh_synced_at: {now_iso}', fm)
        else:
            fm = fm.rstrip() + f"\ngh_synced_at: {now_iso}"

    new_text = text[:m.start(2)] + fm + text[m.end(2):]
    with open(path, 'w') as f: f.write(new_text)

def extract_summary_why(path):
    """Same extraction as duet-board-bodies.sh — Summary + Why for the item body."""
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

# ─── build a lookup of existing board items ──────────────────────────────────
# Primary key: gh_node_id (the item's 'id' field). Fallback: Duet ID.
by_node_id = {}
by_duet_id = {}
for it in board:
    nid = it.get('id')
    did = it.get('duet ID') or ''
    if nid: by_node_id[nid] = it
    if did: by_duet_id[did] = it

# ─── field-write primitives ─────────────────────────────────────────────────
def set_single_select(item_id, field_name, option_name):
    fid = F[field_name]['id']
    oid = F[field_name]['options'].get(option_name)
    if not oid:
        raise RuntimeError(f"option '{option_name}' not on field '{field_name}'")
    gh(['project','item-edit','--id',item_id,'--project-id',project_node,
        '--field-id',fid,'--single-select-option-id',oid])

def set_text(item_id, field_name, value):
    fid = F[field_name]['id']
    gh(['project','item-edit','--id',item_id,'--project-id',project_node,
        '--field-id',fid,'--text',value])

def create_draft_item(title, body):
    """Create a draft issue on the project. Returns the new item's node id (PVTI_...)."""
    q = '''
      mutation($projectId: ID!, $title: String!, $body: String!) {
        addProjectV2DraftIssue(input: {projectId: $projectId, title: $title, body: $body}) {
          projectItem { id }
        }
      }'''
    r = gh_graphql(q, projectId=project_node, title=title, body=body)
    return r['data']['addProjectV2DraftIssue']['projectItem']['id']

# ─── backfill non-lifecycle fields on an existing item ──────────────────────
# Projects wins on status/priority/kind/feature — don't touch those here.
# Only backfill the fields the board can't set by dragging: Duet ID, Path,
# Tier, and (optionally) the body. (The Created field is GitHub's built-in
# date and is read-only via the API — set it once manually if needed.)
def backfill_existing(item_id, fm, path, rel_path, do_body):
    changes = []
    # Duet ID
    cur_did = next((it.get('duet ID') for it in board if it.get('id')==item_id), None)
    if fm.get('id') and cur_did != fm.get('id'):
        set_text(item_id, 'Duet ID', fm.get('id'))
        changes.append(f'Duet ID={fm.get("id")}')
    # Path (always re-point; files move)
    cur_path = next((it.get('path') for it in board if it.get('id')==item_id), None)
    if cur_path != rel_path:
        set_text(item_id, 'Path', rel_path)
        changes.append(f'Path={rel_path}')
    # Tier (derived — keep in sync with priority on the board)
    board_prio = next((it.get('priority') for it in board if it.get('id')==item_id), None)
    want_tier = TIER_FROM_PRIORITY.get(board_prio or fm.get('priority','P3'), 'Later')
    cur_tier = next((it.get('tier') for it in board if it.get('id')==item_id), None)
    if want_tier != cur_tier and want_tier in F['Tier']['options']:
        set_single_select(item_id, 'Tier', want_tier)
        changes.append(f'Tier={want_tier}')
    # Body (optional + on create)
    if do_body:
        summary, why = extract_summary_why(path)
        body = make_body(rel_path, summary, why)
        # item-edit --body only works on draft issues; our items are drafts.
        gh(['project','item-edit','--id',item_id,'--body',body])
        changes.append('body')
    return changes

# ─── iterate ─────────────────────────────────────────────────────────────────
now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
created_count = 0
updated_count = 0
errors = []
file_commits = 0

units = list(find_unit_files())
if only_slug:
    units = [(s, p) for s, p in units if s == only_slug]

for slug, path in units:
    rel_path = os.path.relpath(path, repo_root)
    try:
        fm, _ = parse_frontmatter(path, slug)
    except Exception as e:
        errors.append(f"{slug}: can't parse frontmatter: {e}")
        continue

    node_id = fm.get('gh_node_id')
    existing = None
    if node_id and node_id in by_node_id:
        existing = by_node_id[node_id]
    elif slug in by_duet_id:
        existing = by_duet_id[slug]   # fallback join when gh_node_id absent

    title = f"{slug}: {fm.get('title','').strip()}"

    if not existing:
        # ── create ──
        summary, why = extract_summary_why(path)
        body = make_body(rel_path, summary, why)
        if dry_run:
            print(f"  would CREATE: {slug}  ({rel_path})")
            print(f"    title: {title}")
            continue
        item_id = create_draft_item(title, body)
        # populate fields
        set_text(item_id, 'Path', rel_path)  # set Path correctly (populate_fields placeholder)
        # set the rest
        status = (fm.get('status') or 'draft').capitalize()
        if status in F['Status']['options']:
            set_single_select(item_id, 'Status', status)
        kind = fm.get('kind', 'spec')
        if kind in F['Kind']['options']:
            set_single_select(item_id, 'Kind', kind)
        prio = fm.get('priority', 'P3')
        if prio in F['Priority']['options']:
            set_single_select(item_id, 'Priority', prio)
        tier = TIER_FROM_PRIORITY.get(prio, 'Later')
        if tier in F['Tier']['options']:
            set_single_select(item_id, 'Tier', tier)
        if fm.get('feature'):
            set_text(item_id, 'Feature', fm['feature'])
        set_text(item_id, 'Duet ID', slug)
        # write gh_node_id back into the file + commit
        try:
            write_gh_node_id(path, None, item_id, now_iso)
            subprocess.run(['git','add',path], check=True, cwd=repo_root)
            r = subprocess.run(['git','commit','-m',f'duet: {slug} → board (gh_node_id stamped)'],
                               cwd=repo_root, capture_output=True, text=True)
            if r.returncode == 0:
                file_commits += 1
        except Exception as e:
            errors.append(f"{slug}: created on board but gh_node_id write failed: {e}")
        created_count += 1
        print(f"  ✓ created: {slug}  (item {item_id})")
        time.sleep(0.3)  # be gentle to the API
        continue

    # ── existing item: backfill non-lifecycle fields only ──
    item_id = existing['id']
    try:
        changes = backfill_existing(item_id, fm, path, rel_path,
                                    do_body=(backfill_bodies or False))
        if changes:
            updated_count += 1
            print(f"  ✓ updated: {slug}  ({', '.join(changes)})")
        time.sleep(0.2)
    except Exception as e:
        errors.append(f"{slug}: backfill failed: {str(e)[:120]}")

# ─── report ──────────────────────────────────────────────────────────────────
print()
print(f"created: {created_count}")
print(f"updated: {updated_count}")
print(f"file commits: {file_commits}")
if dry_run:
    print("(dry-run: nothing was changed)")
if errors:
    print(f"errors: {len(errors)}", file=sys.stderr)
    for e in errors: print(f"  ✗ {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
