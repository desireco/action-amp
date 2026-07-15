#!/usr/bin/env bash
# worktree-sync.sh — sync the current worktree's branch with main.
#
# Default action: fetch origin, fast-forward local main (without checking it
# out — that would fight the worktree's branch), then rebase the current
# branch on top. Linear history, your commits stay on top.
#
# Run it from inside a worktree:
#   bash webapp/scripts/worktree-sync.sh
#
# Flags:
#   --push        after a clean rebase, push the branch to origin
#   --abort       run `git rebase --abort` if you're mid-rebase
#   --continue    run `git rebase --continue` after you've resolved conflicts
#   --autostash   stash uncommitted changes around the rebase, pop after
#   -h, --help
#
# Conflict policy: STOP and let you resolve. This script never auto-aborts
# and never force-resets — on conflict it prints the next-step hints and exits
# non-zero. Resolve in your editor, then `git rebase --continue` (or re-run
# this script with --continue), then optionally `--push`.
#
# Edge cases handled:
#   - in the main checkout → error (this is for branches in worktrees)
#   - detached HEAD → error (no branch to rebase)
#   - already mid-rebase/merge → suggest --abort / --continue, refuse to start
#   - origin unreachable → warn, proceed with local main only
#   - branch has no upstream + --push → error cleanly (don't invent a remote)
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

# ── args ───────────────────────────────────────────────────────────────────
ACTION="rebase"   # default
DO_PUSH=0
AUTOSTASH=0
for arg in "$@"; do
  case "$arg" in
    --push)        DO_PUSH=1 ;;
    --abort)       ACTION="abort" ;;
    --continue)    ACTION="continue" ;;
    --autostash)   AUTOSTASH=1 ;;
    --help|-h)
      sed -n '2,/^set -euo pipefail$/p' "$0" | sed -e 's/^# //' -e 's/^#//'
      exit 0
      ;;
    *) die "unknown argument: $arg (try --help)" ;;
  esac
done

# ── where are we? ──────────────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || die "not inside a git repo"
GIT_DIR="$(git rev-parse --git-dir)"

# Must be inside a worktree (git-dir contains ".git/worktrees/").
if [[ "$GIT_DIR" != *".git/worktrees/"* ]]; then
  die "this script rebases a worktree branch onto main, but you're not in a worktree
(git-dir was '$GIT_DIR'). Run it from inside a worktree, e.g.
  cd ../action-amp-<name> && bash webapp/scripts/worktree-sync.sh"
fi

cd "$REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[ -n "$BRANCH" ] && [ "$BRANCH" != "HEAD" ] \
  || die "HEAD is detached — check out a branch first (git checkout <branch>)."
[ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ] \
  || die "you're on '$BRANCH' in a worktree — sync from a feature branch, not main."

# ── detect in-progress rebase/merge ─────────────────────────────────────────
GIT_DIR_ABS="$(cd "$REPO_ROOT" && cd "$GIT_DIR" && pwd)"
IN_REBASE=0; IN_MERGE=0
[ -d "$GIT_DIR_ABS/rebase-merge" ] || [ -d "$GIT_DIR_ABS/rebase-apply" ] && IN_REBASE=1
[ -f "$GIT_DIR_ABS/MERGE_HEAD" ] && IN_MERGE=1

if [ "$ACTION" = "abort" ]; then
  if [ "$IN_REBASE" = "1" ]; then
    git rebase --abort && echo "✓ rebase aborted; $BRANCH is back where it was."
  elif [ "$IN_MERGE" = "1" ]; then
    git merge --abort && echo "✓ merge aborted."
  else
    echo "nothing to abort (no rebase or merge in progress)."
  fi
  exit 0
fi

if [ "$ACTION" = "continue" ]; then
  if [ "$IN_REBASE" = "0" ]; then
    echo "no rebase in progress."
    exit 0
  fi
  # --continue can itself hit further conflicts; hand the exit code through.
  if git rebase --continue; then
    echo "✓ rebase complete: $BRANCH"
  else
    echo ""
    echo "Still conflicts. Resolve them, then:"
    echo "  git add <files>   &&   git rebase --continue"
    echo "  # or:  bash webapp/scripts/worktree-sync.sh --continue"
    echo "  # or:  bash webapp/scripts/worktree-sync.sh --abort"
    exit 1
  fi
  # Fall through to optional --push.
  DO_PUSH_STEP=1
else
  # Starting a fresh sync.
  if [ "$IN_REBASE" = "1" ] || [ "$IN_MERGE" = "1" ]; then
    die "a rebase or merge is already in progress. Resolve it first:
  git status
  git add <files> && git rebase --continue   # or: bash webapp/scripts/worktree-sync.sh --continue
  git rebase --abort                          # or: bash webapp/scripts/worktree-sync.sh --abort"
  fi
  DO_PUSH_STEP=0

  git rev-parse --verify --quiet refs/heads/main >/dev/null \
    || die "no local 'main' branch. Create it first (e.g. from the main checkout: git fetch && git checkout main)."

  # ── 1. fetch origin (non-fatal — works offline) ──────────────────────────
  echo "→ fetching origin…"
  if ! git fetch origin 2>/dev/null; then
    echo "  (fetch failed — proceeding with local main only)"
  fi

  # ── 2. fast-forward local main without checking it out ───────────────────
  # update-ref is the safe way: only moves main forward, never into the
  # worktree's working state. Prefer origin/main if it's ahead; otherwise the
  # local main is already the source of truth.
  if git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null; then
    MAIN_LOCAL="$(git rev-parse main)"
    MAIN_REMOTE="$(git rev-parse origin/main)"
    if [ "$MAIN_LOCAL" != "$MAIN_REMOTE" ]; then
      # Only fast-forward (origin/main must descend from local main).
      if git merge-base --is-ancestor "$MAIN_LOCAL" "$MAIN_REMOTE"; then
        git update-ref refs/heads/main "$MAIN_REMOTE"
        echo "→ main fast-forwarded to origin/main ($(git rev-parse --short main))"
      else
        echo "  (origin/main diverged from local main — leaving local main as-is)"
      fi
    fi
  fi

  # ── 3. rebase current branch onto main ───────────────────────────────────
  # Pre-check: a dirty tree makes git rebase refuse outright (it won't touch
  # unstaged work). Catch that up front so the error is actionable, not a
  # confusing "cannot rebase" buried in git's output. --autostash lets the
  # common noise case (lockfiles churned by install) proceed.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    if [ "$AUTOSTASH" = "0" ]; then
      die "working tree is dirty — git won't rebase over uncommitted changes:
$(git status --short | sed 's/^/    /')

Commit/stash them, or re-run with --autostash to stash + pop around the rebase:
  bash webapp/scripts/worktree-sync.sh --autostash"
    fi
    echo "→ dirty tree (--autostash): stashing…"
  fi

  BEFORE="$(git rev-parse HEAD)"
  echo "→ rebasing $BRANCH onto main…"
  REBASE_ARGS=(main)
  [ "$AUTOSTASH" = "1" ] && REBASE_ARGS=(--autostash "${REBASE_ARGS[@]}")
  if git rebase "${REBASE_ARGS[@]}"; then
    AFTER="$(git rev-parse HEAD)"
    AHEAD="$(git rev-list --count main..HEAD)"
    if [ "$BEFORE" = "$AFTER" ]; then
      echo "✓ $BRANCH already up to date with main."
    else
      echo "✓ $BRANCH rebased onto main ($(git rev-parse --short main)), $AHEAD commit(s) ahead."
    fi
  else
    # Conflict — STOP. Don't abort, don't force. Hand control back.
    echo ""
    echo "✗ conflicts while rebasing onto main. Resolve them, then:"
    echo "    git status"
    echo "    git add <resolved files>"
    echo "    git rebase --continue"
    echo "  # or, with this script:"
    echo "    bash webapp/scripts/worktree-sync.sh --continue"
    echo "  # to give up:"
    echo "    git rebase --abort   # or: bash webapp/scripts/worktree-sync.sh --abort"
    exit 1
  fi
fi

# ── optional: push ─────────────────────────────────────────────────────────
if [ "${DO_PUSH_STEP:-0}" = "1" ] || [ "$DO_PUSH" = "1" ]; then
  if git rev-parse --verify --quiet "@{upstream}" >/dev/null 2>&1; then
    echo "→ pushing $BRANCH…"
    if git push; then
      echo "✓ pushed $BRANCH."
    else
      echo "✗ push failed (see above). The rebase itself succeeded."
      exit 1
    fi
  else
    die "can't push: $BRANCH has no upstream. Set one with:
  git push -u origin $BRANCH"
  fi
fi
