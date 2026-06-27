---
feature: doc-reconciliation
status: done
spec_owner: discover
build_owner: build
---

# Feature: Reconcile docs with shipped code

## Summary

Make `BACKLOG.md` and `IMPLEMENTATION-CHECKLIST.md` match the actual shipped
state of the code, so future work (and Build) isn't planned against a lie.
`BACKLOG.md` (dated 2026-06-23) lists as "not built" items that are
demonstrably live (deploy, triage, focus engine, lists, billing). This is a
docs-only spec: move done items, archive the obsolete, and surface the real
remaining gap list. Discover writes it; **Build should not need to do this** —
but it's tracked here so it gets done in one pass alongside the code specs.

## Why

ROADMAP.md §0: "The docs are stale relative to the code." Planning off stale
docs is the cheapest way to make Build rebuild something that exists, or to
miss what's actually missing. The free-tier + onboarding audits already proved
the docs under-state shipped work. This spec is the one-time reconciliation;
going forward, WORKFLOW.md §6's cascade + this roadmap keep things honest.

> **Note:** This is the one spec Discover may execute directly (it owns the
> docs). It's listed as a spec only so it's visible in the queue. If Discover
> hasn't done it by the time Build polls, Build should skip it and flag it.

## Done-conditions

- [ ] **`BACKLOG.md` reflects reality.** Every `[ ]` item that is actually
      shipped is flipped to `[x]` with a one-line "DONE <date>" note + commit
      ref where known. Specifically these (confirmed shipped 2026-06-27):
      Railway deploy, triage surface, focus engine (`getTopTask` + Now/Next),
      Today/Upcoming/Someday/Projects/Goals/Logbook pages, capture palette,
      design tokens, Stripe billing, focus-switch nav.
- [ ] **`IMPLEMENTATION-CHECKLIST.md` Phases 0–7 are reconciled.** Any ⬜/🔨
      item that is actually done is marked ✅; any ✅ that's actually missing
      is corrected. The phase headings get a "Last verified: 2026-06-27" line.
- [ ] **A "Real remaining gap list" section is added** to `BACKLOG.md`,
      cross-referencing the open `docs/specs/*.md` files (the duet queue is
      now the source of truth for what's left).
- [ ] **No code changes.** This spec touches only `docs/`. If a doc claims
      something that contradicts the code and the *code* is right, the doc
      changes. (If the code is wrong, that's a different spec — raise it, don't
      silently fix code here.)
- [ ] **`AGENTS.md` routing table still accurate.** Spot-check that the
      task→doc table points at docs that still exist and are current.

## Non-goals

- **No rewriting PRODUCT.md / WORKFLOW.md / PRICING.md.** Those are canonical
  and current; this is about the *backlog/checklist* drift only.
- **No new docs.** Reconcile existing; don't expand.
- **No architectural changes.** If a reconciliation surfaces a real structural
  issue, file it as a new `docs/specs/` draft — don't fix it here.

## Open questions

- _(none.)_

## Prototypes

_(none — docs only.)_
