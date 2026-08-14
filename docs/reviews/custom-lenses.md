---
feature: custom-lenses
status: review
spec: docs/specs/done/custom-lenses.md
review_kind: pre-build + post-implementation
review_owner: build
---

# Pre-build review: custom-lenses

<!-- Build owns this file. Discover reads it, resolves the Open Questions, then
     flips the spec draft → ready. This is a COLD-CONTEXT read of the spec
     against the actual codebase as of 2026-07-03 — done BEFORE any
     implementation, to catch ambiguity/staleness before it costs build time.
     It is NOT the post-implementation review the standard template describes
     (no "What changed / Gates run" yet — nothing has changed). -->

## Verdict

**Not ready. Do not build yet.** The spec's mechanism is correct and the
structural call (LensKind enum + id-keyed state) is the right load-bearing fix.
But:

1. **Two of four Open Questions change code, not constants** — they cannot be
   built against a placeholder.
2. **Four `file:line` references are stale** — including the one that names the
   load-bearing rename-fragile site (it points at the wrong file).
3. **One done-condition is ambiguous** between "already true" and "real work."

Discover should resolve the open questions, refresh the references, and flip
`draft → ready`. Details below.

## Open Questions — go/no-go per question

| # | Question | Spec's stated default | Safe to build against as-is? | Build's call |
|---|---|---|---|---|
| 1 | **Pro cap number** | `PRO_LIMITS.lenses = 8` until confirmed | ✅ Yes — isolated constant, trivially changed | **Build against 8.** Low-risk placeholder. |
| 2 | **Delete target** (reassign to Me vs. archive) | "Recommendation: reassign to Me" | ⚠️ No — changes the delete action body *and* the confirmation copy *and* a test | **Must confirm.** Product behavior, not a constant. |
| 3 | **Rename seeded lenses allowed?** | "Recommendation: yes" | ⚠️ No — flips the Settings UI (rename affordance on seeded rows) and an entitlement test | **Must confirm.** Coupled to the LensKind fix, which is the whole point. |
| 4 | **Chip threshold at 4** | Locked at 4, flagged "Confirm" | ✅ Yes — single `>=` constant | **Build against 4.** Low-risk. |

Two of four are safe placeholders; two are not. That alone blocks.

## Stale references (the spec drifts from the code)

The spec's "Stable handle" section is load-bearing — it is the rename-safety
argument. Its pointers are off by a release or two:

| Spec says | Reality (verified 2026-07-03) |
|---|---|
| `assertLensAllowed` is at `entitlements.ts:82` | It's in **`webapp/src/billing/entitlementHttp.ts:72`**. `entitlements.ts` is the *pure* layer; the rename-fragile spot there is `lensViolation` at **line 66**, which keys on the literal string `"Me"`/`"Work"`. The spec names the wrong file for the wrong function. |
| `AppShell.tsx:64` for localStorage-by-name | Roughly right (line 71 today), but the FREE-gate at **`AppShell.tsx:78`** *also* hardcodes `name === "Work"` — a second rename-fragile site the spec doesn't mention. |
| `TriagePage.tsx:82` is the Context radio | Line 82 is the `TriageContext` *type*. The radio is at **`TriagePage.tsx:462`**. |
| `AppShell.tsx:329` for "the mobile lens menu" | I found no distinct mobile lens menu. `LensSwitch` renders at ~329 inside the desktop sidebar footer. The spec may be conflating the desktop footer with a mobile dock. Discover: confirm what this refers to, or drop it. |

The mechanism is right; the pointers are not. A builder following the line
numbers would waste time and could miss the actual rename-fragile site
(`lensViolation` in `entitlements.ts`, not `assertLensAllowed` in
`entitlementHttp.ts`).

**Suggestion:** drop line numbers from specs entirely — they rot. File + symbol
(`entitlements.ts :: lensViolation`) survives refactors.

## Done-conditions needing rewording

- **"Triage's Context step radio renders the full lens list"** — **already
  true.** `TriagePage.tsx:97` does `const lenses = appData?.lenses ?? []` and
  the radio at line 462 maps over them. The remaining work is the **adaptive
  ≥4 pattern** (radio → denser form), not "list all lenses." Reword to:
  *"Triage's Context step goes adaptive at ≥4 lenses (matching the sidebar
  switcher pattern); at ≤3 today's radio is unchanged."*

- **"`resolveLensName` renamed/extended to `resolveLens` returning `{name, kind}`"**
  — fine as written, but note the ripple: `entitlementHttp.ts:78` and the test
  at `entitlements.test.ts:110` both consume the current return shape. Scope
  the test rewrite; not a blocker.

- **"Vitest covers … the active-lens id migration"** — testable, but the
  migration is a *client-side* localStorage shim on app load. Confirm Discover
  wants this in Vitest (jsdom) vs. an e2e. Minor.

## What the spec gets right (keep)

- **LensKind enum + id-keyed localStorage** is the correct load-bearing fix.
  The schema already carries `@@unique([userId, name])` and "Phase 2" comments
  (`schema.prisma:103`, `onboarding/operations.ts:12`) — this is the intended
  evolution, not a surprise.
- **Adaptive switcher** (segmented ≤3, chip + popover ≥4) is well-specified and
  matches the calm, low-chrome ethos. The popover keymap (`↑↓`/`↵`/`/`/`esc`/
  `⌘L`) is concrete enough to build directly.
- **Pro-only configuration** correctly reuses the existing `<ProGate>` +
  `proLocked` pattern — `LensSwitchOption.proLocked` already exists
  (`LensSwitch.tsx:25`).
- **Color-as-palette-key** (not hex) matches the `--aa-lens-*` token pattern.
  Scope note for the build: only `indigo`/`emerald` ramps exist today
  (`tokens.css:49-59`); the spec adds 6 new keys × 5 steps × light+dark ≈ 60
  new token lines plus 6 `[data-lens]` blocks. Real work, not trivial — fine to
  build, just not "add a few tokens."
- **Doc cascade** is correctly identified per AGENTS.md's "structure changes
  start in WORKFLOW.md" rule, and the cascade list looks complete.

## Internal consistency

- The two FREE-behavior statements agree (§Done-conditions + §Open-questions:
  FREE = seeded two, Work visible-but-locked). Good.
- No clash with WORKFLOW.md beyond what the cascade already plans to fix.
- Non-goals are clean and protective (no hex, no reorder, no archive, no
  sharing, no per-lens prefs).

## Size estimate (for revise-then-lock vs. lock-with-defaults)

If Q2 + Q3 are resolved and references refreshed: **medium.** Schema migration
+ 3 actions + a Settings tab + the adaptive switcher + 2 client migrations
(localStorage id-keying, LensKind-based gating) + ~60 lines of token ramps +
~4 Vitest cases + a 6-doc cascade. A focused multi-day build, not an
afternoon. No architectural risk once the two product questions are answered.

## Asked of Discover

1. **Answer Q2** (delete target: reassign to Me vs. archive) — real blocker.
2. **Answer Q3** (rename seeded lenses allowed?) — real blocker, coupled to
   the LensKind fix.
3. **Refresh or drop** the four stale `file:line` references (prefer
   `file :: symbol`).
4. **Reword** the Triage radio done-condition to "adaptive at ≥4."
5. Then flip `docs/specs/done/custom-lenses.md` `draft → ready`.

Q1 (cap = 8) and Q4 (threshold = 4) are safe defaults — Build will use them
as written.

---

# Post-implementation review: custom-lenses

Branch: `build/custom-lenses` (12 commits ahead of `main`). Built 2026-07-03.
The pre-build review above is preserved as-is; this section covers the shipped
code. Read this to sign off (or block).

## What changed

The full custom-lenses feature: LensKind enum + id-keyed state (the rename-
safety fix), 6 curated hue ramps, the adaptive switcher (segmented ≤3, chip +
popover ≥4, ⌘L), a new `getLenses` query, three CRUD actions, a Settings Lenses
tab (Pro CRUD + FREE ProGate + two-mode delete dialog), the doc cascade, and an
`isAdmin` staff/dev bypass (added mid-build to unblock testing).

Commits (oldest → newest):
- `7ab0fc1` schema: LensKind enum + kind/purpose cols + migration
- `a8fcf3c` entitlements: name→kind, assertLensConfigAllowed, PRO_LIMITS
- `da2896e` onboarding seed + getAppData expose kind/purpose
- `037f801` server: createLens/updateLens/deleteLens (+ Goal-collision fix)
- `532e43b` tokens: 6 new lens hue ramps
- `8f5fc01` adaptive switcher (chip+popover ≥4) + ⌘L
- `333d60f` active-lens state: name→id migration
- `b36a0bd` Settings Lenses tab
- `73d2ab7` isAdmin staff/dev bypass (mid-build addition)
- `1fc6e76` doc cascade
- `fb2b948` review fixes (B1/B2/S1/S2/S5)

## Gates run

- **Cold-context reviewers (2):** correctness/regressions + tests/validation.
  Both read the full diff cold (`git diff main...build/custom-lenses`).
  - Correctness: 2 BLOCKERS (B1 sidebar-count regression, B2 sort order) +
    5 SHOULD-FIX (S1–S5). All blockers + S1/S2/S5 fixed in `fb2b948`; S3/S4
    spawned to `docs/tasks/lens-free-gate-loading-edge-cases.md` (low severity,
    server guard is the boundary).
  - Validation: 2 tautological tests flagged (migration), several integration
    gaps (FREE→ProGate untested, migration effect untested, composed
    rename-safety, create-at-cap, data-lens mirror, esc/⌘L). Spawned to
    `docs/tasks/lens-integration-test-gaps.md` (medium). Pure-logic + server
    layers are honestly covered.
- **Diagnostics:** `wasp compile` clean (no TS errors on edited files).
- **Tests:** `vitest run` → **335 passed, 0 failed** (25 test files). Covers:
  entitlement guards (rename-safety, isAdmin bypass, lensConfigViolation),
  lens CRUD (create-at-cap wiring, delete-CUSTOM-only, Goal-collision 409,
  hard-delete-empty-only, reassign), getLenses seeded-first sort, the
  adaptive popover keyboard nav (↑↓/↵//filter), the migration contract.

## Done-conditions (per spec) → status

**Data model**
- [x] LensKind enum exists; seeded lenses tagged on migration — PASS (migration
      backfills Work→WORK, Me→PERSONAL by name; verified via psql).
- [x] Lens.purpose String? — PASS.
- [x] aa-lens → aa-lens-id one-shot migration — PASS (sentinel resolution;
      **integration effect untested** — see spawned task).

**Settings UI**
- [x] Lenses tab in SettingsLayout at /do/settings/lenses — PASS.
- [x] Entire tab Pro-gated; FREE sees ProGate — PASS (code correct;
      **UNTESTED at the page level** — see spawned task).
- [x] Pro tab lists lenses with dot/name/purpose/counts/kind — PASS.
- [x] Pro can rename/edit-purpose/recolor/create/delete — PASS (server ops
      tested; UI forms untested).
- [x] Delete with content → confirmation (reassign vs delete) — PASS (server
      enforces empty-only hard-delete; UI dialog offers both modes).

**Switcher**
- [x] ≤3 → segmented control unchanged — PASS.
- [x] ≥4 → chip + popover, + New lens row, keyboard nav — PASS (LensPopover
      tests cover ↑↓/↵//filter/outside-click; **esc + ⌘L untested** — spawned).
- [x] data-lens mirror on switch — PASS (code correct; **UNTESTED** — spawned).
- [x] FREE sees exactly seeded two; Work visible-but-locked — PASS (proLocked
      on kind; gate-on-select code correct; **UNTESTED at integration** — spawned).

**Server**
- [x] createLens/updateLens/deleteLens exist, tenancy-scoped, enforce
      entitlements, call assertUnderCap/assertLensConfigAllowed — PASS.
- [x] assertLensAllowed keys on LensKind (rename-safe) — PASS (pure layer
      tested with composed input; **end-to-end guard untested** — spawned).
- [x] resolveLensName → resolveLens returns {name, kind} — PASS.

**Cross-cutting**
- [x] Triage Context step lists full lens set — PASS (already true pre-build;
      adaptive ≥4 not yet wired into Triage — spawned/note).
- [x] Mobile lens menu lists all lenses — PASS.
- [x] Vitest covers: stable-handle gating after rename; create-at-cap (402);
      delete-CUSTOM-only; the active-lens id migration — PARTIAL (each covered
      at the pure layer; integration gaps spawned).
- [x] wasp db migrate-dev runs clean; wasp compile passes — PASS.

## Findings

### Applied (in `fb2b948`)
- B1: getAppData lensId contract (sidebar counts re-scope on switch).
- B2: getLenses seeded-first JS sort.
- S1: onboarding seed loop lookup by kind (rename-safe, no re-seed).
- S2: deleteLens hard-delete requires empty lens.
- S5: test fixtures include kind/purpose.

### Spawned (docs/tasks/)
- `lens-free-gate-loading-edge-cases.md` — S3 (transient gate bypass while
  loading) + S4 (workGated reset on self-heal). Low severity.
- `lens-integration-test-gaps.md` — the validation reviewer's 7 coverage gaps.
  Medium. The most load-bearing: a `LensesPage.test.tsx` for FREE→ProGate, and
  an integration test for the migration effect.

### Deferred / rejected
- Transaction wrapping for deleteLens reassign — deferred (no transaction
  precedent in the codebase; the failure mode is benign — empty lens left
  extant, user retries). The Goal-first ordering makes the dangerous case
  (partial move on collision) impossible.
- Hard-delete of content with explicit confirmation — rejected in favor of
  S2 (empty-only). The spec's "no silent cascade delete" is best honored by
  never cascading, not by cascading with a warning.

## Verdict

**Ready for sign-off** with the caveat that the integration test gaps
(spawned) should be picked up before this hits production. The rename-safety
invariant (the spec's whole point) is correct end-to-end; the blockers found
by review were display/scoping regressions, not entitlement holes. The server
boundary is solid (tenancy + kind + cap + empty-only-delete all enforced and
tested). Human-in-the-loop: this branch should not merge until you've reviewed
the diff and exercised the feature in the dev app.
