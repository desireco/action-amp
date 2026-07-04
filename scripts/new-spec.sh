#!/usr/bin/env bash
#
# new-spec.sh — scaffold a new ActionAmp feature spec + paired feature catalog
# entry, then print the exact lines to add to ROADMAP.md and features/README.md.
#
# Replaces the ~5 min of mechanical setup a new spec needs:
#   - unique-slug check (no spec/feature collision)
#   - docs/specs/<slug>.md from _TEMPLATE.md (frontmatter filled)
#   - docs/features/<slug>.md skeleton (frontmatter filled)
#   - early conflict scan (entities/symbols your spec will touch, against
#     existing specs — surfaces the kind of cross-spec reversal this repo
#     needed between task-fields and resources-project-owned)
#   - printed index-entry guidance (no auto-edit — placement needs judgment)
#
# It does NOT write prose, ground against code, or decide structure.
# Those are the model's job. See AGENTS.md "Task → doc routing" first.
#
# Usage:
#   scripts/new-spec.sh <slug> [--title "..."] [--area focus|planning|cross-cutting]
#
# Examples:
#   scripts/new-spec.sh task-fields --title "Task enhancement fields"
#   scripts/new-spec.sh task-fields --title "..." --area cross-cutting
#
set -euo pipefail

# ─── repo location ───────────────────────────────────────────────────────────
# Resolve to repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f docs/specs/_TEMPLATE.md ]]; then
  echo "✗ not in an ActionAmp repo: docs/specs/_TEMPLATE.md missing (cwd=$(pwd))" >&2
  exit 1
fi

# ─── args ────────────────────────────────────────────────────────────────────
SLUG=""
TITLE=""
AREA="cross-cutting"   # safe default; ROADMAP/features index use it loosely

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)  TITLE="$2"; shift 2 ;;
    --area)   AREA="$2";  shift 2 ;;
    -h|--help) usage 0 ;;
    *)        SLUG="$1"; shift ;;
  esac
done

[[ -n "$SLUG" ]] || { echo "✗ missing <slug>" >&2; usage 1; }
[[ "$SLUG" =~ ^[a-z][a-z0-9-]*$ ]] || {
  echo "✗ slug must be kebab-case lowercase (got: '$SLUG')" >&2; exit 1; }
[[ ${#SLUG} -le 64 ]] || { echo "✗ slug too long (max 64)" >&2; exit 1; }

# Default title from slug if not given.
[[ -n "$TITLE" ]] || TITLE="$SLUG"

case "$AREA" in
  focus|planning|cross-cutting) ;;
  *) echo "✗ --area must be one of: focus, planning, cross-cutting" >&2; exit 1 ;;
esac

# ─── unique-slug check ───────────────────────────────────────────────────────
if [[ -f "docs/specs/$SLUG.md" ]]; then
  echo "✗ docs/specs/$SLUG.md already exists" >&2; exit 1
fi
if [[ -f "docs/features/$SLUG.md" ]]; then
  echo "✗ docs/features/$SLUG.md already exists" >&2; exit 1
fi
if [[ "$SLUG" == "_template" || "$SLUG" == "_TEMPLATE" ]]; then
  echo "✗ slug reserved" >&2; exit 1
fi

# ─── date ────────────────────────────────────────────────────────────────────
TODAY="$(date +%Y-%m-%d)"

# ─── write spec ──────────────────────────────────────────────────────────────
SPEC_PATH="docs/specs/$SLUG.md"
cat > "$SPEC_PATH" <<EOF
---
id: $SLUG
kind: spec
title: "$TITLE"
status: draft
priority: P2
feature: $SLUG
spec_owner: discover
build_owner: build
created: $TODAY
---

# Spec: $TITLE

> **Status: \`draft\`.** <!-- one line on what's resolved vs what's open -->

## Summary

<!-- One paragraph, plain language. A stranger should understand what's being
     built. State what exists today and what this changes. -->

## Why

<!-- The problem. Who has it. The evidence it's real. Cite file:line for any
     code claim ("Today X is set to null, inbox/operations.ts:144"). -->

## Decisions locked

<!-- The non-obvious choices, with reasoning. This is the section that protects
     Build from re-litigating. If a decision reverses another spec, say so here
     AND add a reversal note on the other spec (the task-fields ↔
     resources-project-owned reversal is the pattern). -->

## Done-conditions

<!-- TESTABLE predicates, not vibes. Group into lettered subsections (A/B/C…)
     by area (data, write path, render, edit…). Every item should be verifiable
     by grep, a route, or a screenshot. -->

### A. <!-- area -->

- [ ] <!-- predicate — how it's verified -->

## Non-goals

<!-- What we are explicitly NOT building. This protects Build from scope creep. -->

- <!-- out of scope -->

## Open questions

<!-- For Build to raise; Discover resolves here. Empty or "_(none — resolved)_" -->
<!-- when ready. Flip status: draft → ready when this section closes. -->

- _(none)_

## Dependencies

<!-- New npm deps, schema migrations, or other specs that must reconcile. -->

## Prototypes

_(none)_
EOF

# ─── write feature catalog entry ─────────────────────────────────────────────
FEATURE_PATH="docs/features/$SLUG.md"
cat > "$FEATURE_PATH" <<EOF
---
slug: $SLUG
title: "$TITLE"
feature_area: $AREA
status: missing
spec: $SLUG.md                  # draft — created $TODAY
verified: $TODAY
---

# $TITLE

**Wanted.** <!-- one line on the user-facing ask -->

**Today.** <!-- what exists in code, with file:line. "Nothing" is a valid
             answer — say so. -->

**Spec.** \`docs/specs/$SLUG.md\` — **\`draft\`** (created $TODAY). <!-- one
              line on the headline decision(s) and any cross-spec reversal. -->

**Why it matters.** <!-- one line tying it to PRODUCT.md / the wedge / a
                        differentiator. -->

**Files (expected).** <!-- the files this will touch: schema.prisma, ops, pages,
                          components. Guess from the routing map in AGENTS.md. -->
EOF

# ─── conflict scan ───────────────────────────────────────────────────────────
# Heuristic: pull entity-ish tokens (CapWords) from the user-supplied TITLE
# (NOT the scaffolded file — that's mostly template prose and would drown the
# signal). grep each across existing specs. A hit doesn't mean a conflict — it
# means "worth a look": you might extend, reverse, or note as non-conflicting.
echo
echo "── conflict scan (heuristic — review hits, ignore noise) ──────────────"
# Stopwords: common English + the spec template's own heading words. Tuned to
# keep entity names (Task, Resource, Lens, Project, Goal, Inbox, Tag, …).
STOP='^(A|An|The|This|That|These|Those|For|From|With|Without|And|Or|But|Not|No|New|Old|All|Any|Each|Every|Some|Other|More|Less|Empty|Full|Open|Closed|Done|Status|Spec|Summary|Why|How|What|When|Where|Who|Decisions|Dependencies|Prototypes|Build|Discover|Add|Edit|Delete|Update|Create|Make|Get|Set|Use|Using|Via|Into|Onto|Over|Under|Between|Through|During|After|Before|Field|Fields|Page|Pages|List|Lists|Mode|Modes|Area|Areas|Work|Today|Now|Next|Then|Here|There|One|Two|Three|First|Last|V1|V2)$'
TOKENS="$(printf '%s\n' "$TITLE" | grep -oE '\b[A-Z][a-zA-Z]{2,}\b' | sort -u | grep -vE "$STOP" || true)"

if [[ -z "$TOKENS" ]]; then
  echo "(no entity-ish tokens in title — nothing to scan. If your spec touches"
  echo "  named entities like Task, Resource, Lens, fill the spec and grep them"
  echo "  across docs/specs/ by hand:  grep -l 'Resource' docs/specs/*.md)"
else
  HIT_ANY=0
  while IFS= read -r tok; do
    [[ -z "$tok" ]] && continue
    HITS="$(grep -lF "$tok" docs/specs/*.md 2>/dev/null | grep -v "$SPEC_PATH" || true)"
    if [[ -n "$HITS" ]]; then
      HIT_ANY=1
      echo "  ⚠ '$tok' also appears in:"
      echo "$HITS" | sed 's/^/      /'
    fi
  done <<< "$TOKENS"
  [[ "$HIT_ANY" -eq 0 ]] && echo "(no overlaps with existing specs — clean)"
fi
echo

# ─── guidance: index entries to add by hand ──────────────────────────────────
echo "── ROADMAP.md — add to the appropriate tier (Now/Next/Then) ──────────"
echo "  location: see tiers at docs/ROADMAP.md (search '## Priority order')"
echo "  suggested line (edit tier + wording to fit):"
echo "    N. **$SLUG** (\`draft\`, new $TODAY) — <!-- one-line summary; cite"
echo "       the spec at docs/specs/$SLUG.md -->"
echo
echo "── features/README.md — add to 'Planned (not in code)' ──────────────"
echo "  location: docs/features/README.md (search '### Planned')"
echo "  suggested line:"
echo "    - [$SLUG](./$SLUG.md) (\`missing\`, spec \`draft\`) — <!-- one-line -->"
echo
echo "── next steps (the model's job, not this script's) ──────────────────"
echo "  1. Ground the spec: read the relevant code (schema.prisma, ops, pages)"
echo "     per AGENTS.md 'Task → doc routing'. Cite file:line in Done-conditions."
echo "  2. Fill Decisions locked with the non-obvious choices + reasoning."
echo "  3. For any conflict-scan hit, decide: extend, reverse (add a note on"
echo "     the other spec), or note as non-conflicting."
echo "  4. Flip status: draft → ready when Open questions closes."
echo "  5. Commit spec + feature entry together (1:1, per features/README.md)."
echo
echo "✓ created:"
echo "    $SPEC_PATH"
echo "    $FEATURE_PATH"
