#!/usr/bin/env bash
#
# duet-capture.sh — fast Duet intake. Captures a spoken idea as a minimal
# "maybe" draft in docs/backlog/, docs/specs/, or docs/tasks/, with the
# lightest frontmatter that still enters the Duet queue.
#
# This is the low-friction floor of the protocol: capture many ideas fast,
# refine later (duet-refine) or in Discover's main loop. It does NOT scaffold
# a full spec (use scripts/new-spec.sh for that — it's the *refined* path with
# conflict scan + catalog entry). Capture is intentionally dumber than that.
#
# Usage:
#   scripts/duet-capture.sh "<idea>" [--kind backlog|spec|task] [--title "..."] [--priority P0-P3]
#
# Examples:
#   scripts/duet-capture.sh "dark mode for the focus screen"
#   scripts/duet-capture.sh "stripe webhook idempotency" --kind task --priority P1
#   scripts/duet-capture.sh "weekly review mockup" --kind spec --title "Weekly review v1"
#
# Output: writes the file, prints the path. Commits nothing (Discover commits
# at refine/lock time, not capture time).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -d docs/specs ]]; then
  echo "✗ not in an ActionAmp repo: docs/specs/ missing (cwd=$(pwd))" >&2
  exit 1
fi

# ─── args ────────────────────────────────────────────────────────────────────
IDEA=""
KIND="backlog"           # default: "maybe" bucket — the lowest-friction floor
TITLE=""
PRIORITY=""              # default derived from kind below

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-1}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kind)     KIND="$2";     shift 2 ;;
    --title)    TITLE="$2";    shift 2 ;;
    --priority) PRIORITY="$2"; shift 2 ;;
    -h|--help)  usage 0 ;;
    *)          IDEA="$1";     shift ;;
  esac
done

[[ -n "$IDEA" ]] || { echo "✗ missing \"<idea>\"" >&2; usage 1; }

case "$KIND" in
  backlog|spec|task) ;;
  *) echo "✗ --kind must be one of: backlog, spec, task (got: '$KIND')" >&2; exit 1 ;;
esac

# Default priority by kind: backlog=maybe(P3), spec/task=draft queue(P2)
[[ -n "$PRIORITY" ]] || case "$KIND" in
  backlog) PRIORITY="P3" ;;
  spec|task) PRIORITY="P2" ;;
esac

case "$PRIORITY" in
  P0|P1|P2|P3) ;;
  *) echo "✗ --priority must be P0|P1|P2|P3 (got: '$PRIORITY')" >&2; exit 1 ;;
esac

# ─── slug from idea ──────────────────────────────────────────────────────────
slugify() {
  local s="$1"
  # lowercase, replace non-alnum with hyphens, collapse repeats, trim ends
  s="$(echo "$s" | tr '[:upper:]' '[:lower:]')"
  s="$(echo "$s" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  # cap at 60 chars to leave room for -2, -3 disambiguation
  s="${s:0:60}"
  s="${s%-}"
  echo "$s"
}

SLUG="$(slugify "${TITLE:-$IDEA}")"
[[ -n "$SLUG" ]] || { echo "✗ could not derive a slug from the input" >&2; exit 1; }

# ─── pick folder + ensure uniqueness ─────────────────────────────────────────
case "$KIND" in
  backlog) DIR="docs/backlog" ;;
  spec)    DIR="docs/specs"   ;;
  task)    DIR="docs/tasks"   ;;
esac
mkdir -p "$DIR"

PATH_="$DIR/$SLUG.md"
if [[ -f "$PATH_" ]]; then
  # disambiguate: foo.md → foo-2.md → foo-3.md …
  N=2
  while [[ -f "$DIR/$SLUG-$N.md" ]]; do N=$((N+1)); done
  SLUG="$SLUG-$N"
  PATH_="$DIR/$SLUG.md"
fi

# ─── title: prefer --title, else capitalize the idea ─────────────────────────
if [[ -z "$TITLE" ]]; then
  # portable capitalize-first (BSD sed lacks GNU's \U): lowercase, then cap
  # the first char via awk. Avoids the "Udark" bug from \U on macOS.
  TITLE="$(printf '%s' "$IDEA" | tr '[:upper:]' '[:lower:]' | awk '{ print toupper(substr($0,1,1)) substr($0,2) }')"
fi

TODAY="$(date +%Y-%m-%d)"

# ─── write the minimal unit ─────────────────────────────────────────────────
# Backlog ("maybe") is the lightest: one-line Why, no Done-conditions, no
# spec_owner/build_owner (those come at promotion). Spec/task get the fuller
# frontmatter since they're already declaring intent to build.
if [[ "$KIND" == "backlog" ]]; then
cat > "$PATH_" <<EOF
---
id: $SLUG
kind: backlog
title: "$TITLE"
status: draft              # "maybe" — refine via duet-refine or Discover before promotion
priority: $PRIORITY
created: $TODAY
---

# $TITLE

## Why

$IDEA

<!-- Refine: ground this in code (file:line or docs/features/), pressure-test
     via \`roast\`, convert to testable Done-conditions. Or kill it
     (status: done, one-line "decided no"). -->
EOF
else
cat > "$PATH_" <<EOF
---
id: $SLUG
kind: $KIND
title: "$TITLE"
status: draft
priority: $PRIORITY
feature:                   # fill if this targets a known feature
parent:                    # fill if spawned from a review/spec
spec_owner: discover
build_owner: build
created: $TODAY
---

# $TITLE

## Summary

$IDEA

<!-- Refine toward ready: ground Summary + Why in the codebase, add testable
     Done-conditions, lock Decisions. See duet-refine skill. -->

## Why

<!-- The problem, who has it, the evidence (file:line or a catalog citation). -->

## Done-conditions

- [ ] <!-- testable predicate -->

## Open questions

- _(none yet)_
EOF
fi

echo "✓ captured ($KIND, $PRIORITY):"
echo "    $PATH_"
echo ""
echo "next: refine it  →  Skill: duet-refine  (or leave as a maybe)"
