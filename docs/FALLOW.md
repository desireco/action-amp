# Fallow codebase intelligence — setup & findings

> Generated after installing [`fallow`](https://github.com/fallow-rs/fallow) (v2.60.0,
> Homebrew) and tuning it for the Wasp project layout. This doc is the
> **index for the findings**; the actionable improvements live in
> [`BACKLOG.md`](BACKLOG.md) under the "Code health" section.
>
> Re-run any time: `cd webapp && fallow dead-code && fallow health && fallow dupes`.

## What fallow is

A static analyzer for TS/JS that surfaces, without configuration:
**unused code** (files, exports, types, deps), **circular dependencies**,
**code duplication** (clone groups), and **complexity hotspots**
(cyclomatic / cognitive / CRAP scores + file-health rankings).

A free static layer covers everything above; a paid runtime layer
(hot-path review, cold-path deletion evidence) exists but is **not** wired up
here — we use the static layer only.

## Installation status

- **Binary:** `fallow` 2.60.0 via Homebrew (`/opt/homebrew/bin/fallow`). No
  `npm` dev-dep added — keeping it out of `package.json` avoids bloating the
  Wasp-generated install; contributors on macOS install it with
  `brew install fallow-rs/tap/fallow`.
- **Config:** [`webapp/.fallowrc.jsonc`](../webapp/.fallowrc.jsonc) — see the
  file's comments for *why each knob is set*. The two non-obvious ones:
  - `entry: ["main.wasp.ts", ...]` — Wasp wires pages/operations/auth via
    string config + `import … with { type: "ref" }`. Without `main.wasp.ts`
    named as an entry point, **every** page and operation reads as "unused."
  - `ignorePatterns: [".wasp/**", "src/auth/google/**", ...]` — `.wasp/out/`
    is generated; `src/auth/google/*` is intentionally parked (Google social
    auth disabled in `main.wasp.ts`, kept for re-enablement).
- **Cache:** `.fallow/` exists at repo root and in `webapp/`. Both
  self-ignore via an inner `.gitignore` (`*`), so cache never lands in git.

## Headline numbers (post-config)

| Signal | Before config | After config | Notes |
|---|---|---|---|
| Unused files | 72 | **1** | The 71 were false positives (Wasp ref-imports + parked Google auth). |
| Unused exports | 60+ | **12** | Real signal — see below. |
| Unused type exports | 23 | **23** | Mostly `index.ts` barrel re-exports. |
| Unused dependencies | 29 | **1** | `react-hook-form` (zero imports). The other 28 were `.wasp/out` SDK deps. |
| Unused devDependencies | 3 | **2** | `@wasp.sh/spec` is a **false positive** — it's the Wasp DSL imported in `main.wasp.ts:1`; fallow doesn't resolve the `file:.wasp/spec/` workspace symlink. `@tsconfig/*` are real but harmless (Wasp-generated `.wasp/out` packages). Don't auto-fix these. |
| Circular dependencies | 7 | **7** | All `component → index.ts → component` barrel cycles. |
| Duplication | 5.6% / 1,456 lines | unchanged | 64 clone groups, 13 families. |
| Maintainability | — | **92.6 / 100 (good)** | Avg cyclomatic 2.1, p90 4. |

## Verified findings worth acting on

Each was hand-checked against the source — these are **not** raw analyzer noise.

### A. Dead code (high confidence, low effort)

1. **`react-hook-form` is an unused dependency.** Declared in
   `webapp/package.json` line 18, zero imports across `src/` and `e2e/`.
   Remove from `dependencies`.
2. **`src/app/SettingsPage.css` is a vestigial placeholder** — a 3-line
   comment file. Its own header says all styles moved to
   `SettingsLayout.css` (verified: `.aa-settings-section` /
   `.aa-settings-note` live there). Delete it.
3. **12 unused exports** — the meaningful ones (not barrel re-exports):
   - `src/billing/config.ts` — `isFounder`, `PLAN_BADGE`
   - `src/billing/stripe.ts` — `PRICE_PLAN_LABEL`
   - `src/feedback/config.ts` — `DEFAULT_ADMIN_EMAIL`
   - `src/shared/permalinks.ts` — `permalinkBase`
   - `src/inbox/triageFlow.ts` — `formatChipDate`
   - `src/lists/ListShell.tsx` — `ListHeader`
   - `src/components/ui/ResourcePickerSheet.tsx` — the whole component
     (re-exported from `index.ts` but never imported by a page).

   `fallow fix --dry-run` will show the auto-removal diff; review before
   applying. The billing/feedback ones may be intentional public API —
   confirm against `docs/` before deleting.

### B. Circular dependencies (7, all the same shape)

Every cycle is `Foo.tsx → components/ui/index.ts → Foo.tsx` — a barrel file
re-exporting a component that itself imports from the barrel. Seven
components: `ConfirmDialog, FocusMode, NextCard, ResourcePickerSheet,
ShortcutCheatsheet, SnoozeSheet, TriageCard`. Fix: have those components
import siblings via **relative paths** (`./Card`) instead of through
`./index`. Low effort, removes a whole class of tree-shaking /
init-order risk.

### C. Duplication (5.6%, two patterns)

The 64 clone groups cluster into two repeatable shapes:

- **Test setup boilerplate** — the same mock-context / email-factory /
  seed-task blocks copied across `operations.test.ts` files
  (inbox, tasks, goals, projects, onboarding, app). Extract a shared
  `src/test/fixtures.ts`. This is the single biggest dedup win and the
  lowest-risk one.
- **`DesignSystemPage.tsx`** — 5 internal clone groups (66 lines). It's a
  design-system showcase page; the repetition is *literal* component
  demos. Acceptable, or factor into a `<DemoRow>` helper.

### D. Complexity hotspots (refactor candidates)

Maintainability is already 92.6 (good) — these are the long-tail items,
ranked by fallow's priority score. All are "extract sub-component /
helper" work, not rewrites.

| Priority | File | Why |
|---|---|---|
| 36.8 | `src/lists/TodayPage.tsx` | 411 LOC, cognitive 48 — extract grouping helpers. |
| 36.6 | `src/app/focusTaskView.ts` | 100% dead exports — pair with finding A.3. |
| 32.5 | `src/tasks/TaskDetailPage.tsx` | 295 LOC, cognitive 30. |
| 29.4 | `src/components/ui/ResourcePickerSheet.tsx` | Cycle (B) + unused export (A.3). |
| 28.5 | `src/billing/operations.ts` | 4 unused exports. |
| 27.2 | `src/billing/stripe.ts` | 3 unused exports. |
| 25.5 | `src/inbox/TriagePage.tsx` | 742 LOC, cognitive 67 — the biggest single refactor. |
| 19.4 | `src/components/ui/TaskRow.tsx` | cognitive 50. |
| 18.2 | `src/inbox/operations.ts` | `triageInboxItem` cognitive 30. |

## How to use fallow day-to-day

```bash
cd webapp

# The three core reports:
fallow dead-code          # unused files / exports / deps + circular imports
fallow health             # complexity + refactoring targets
fallow dupes              # clone groups + clone families

# Triage changed files only (fast, for PR review):
fallow audit --changed-since main

# See what auto-fix would do, without touching files:
fallow fix --dry-run

# JSON for piping into a script / dashboard:
fallow dead-code --format json
```

### Optional: gate commits on it

`fallow setup-hooks` installs a hook that blocks `git commit`/`git push` when
`fallow audit` finds issues in changed files. **Not enabled by default** —
only turn it on once the findings above are cleaned up, otherwise it'll
block on noise we haven't triaged yet.

## What we deliberately did *not* do

- **Did not add fallow to `package.json`.** It's a Homebrew install to keep
  the Wasp install lean. If the team prefers npm-managed tooling, add it as
  `devDependencies` and a `lint:dead-code` script instead.
- **Did not enable the paid runtime layer.** Static analysis is enough for
  now; runtime coverage would need production wiring we don't have.
- **Did not auto-fix anything.** `fallow fix` removes exports/deps
  automatically; the findings above were verified by hand and are queued as
  backlog items, not applied blind.
