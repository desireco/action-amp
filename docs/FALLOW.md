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

## Headline numbers

Tracked across three points: the raw analyzer run (no config), the tuned
config (false positives suppressed), and after the cleanup pass.

| Signal | Raw | After config | After cleanup | Notes |
|---|---|---|---|---|
| Unused files | 72 | 1 | **0** | The 72 were false positives (Wasp ref-imports + parked Google auth); the last was a stray empty `App.tsx`. |
| Unused exports | 60+ | 13 | **1** | Just the barrel `BottomSheet` re-export (intentional API). |
| Unused type exports | 23 | 23 | **23** | Mostly `index.ts` barrel re-exports — low value to chase. |
| Unused dependencies | 29 | 1 | **0** | `react-hook-form` removed (was a transitive dep of Wasp's SDK; we never imported it). |
| Circular dependencies | 7 | 7 | **0** | All were barrel cycles; fixed by direct relative imports. |
| Duplication | 5.6% / 1,456 lines | unchanged | **5.0% / 1,307 lines** | Someday/Upcoming handlers, TodayPage grouping, overlay close buttons extracted. |
| Maintainability | — | 92.6 | **93.0 / 100 (good)** | Avg cyclomatic 2.1, p90 4. |

`@wasp.sh/spec` still shows as an unused devDep — that's a **false positive**
(it's the Wasp DSL imported in `main.wasp.ts:1`; fallow can't resolve the
`file:.wasp/spec/` workspace symlink). Don't auto-fix it.

## What the cleanup pass did

Ten commits on `chore/fallow-cleanup` across two passes (see `git log main..HEAD`):

**Pass 1:**
- **A1** removed `react-hook-form` (zero imports; transitive via Wasp SDK).
- **A2** deleted the vestigial `SettingsPage.css` placeholder.
- **B** broke 7 barrel-file cycles in `components/ui/` (direct relative imports).
- **A3** removed 12 dead exports + a stray empty `App.tsx`; suppressed
  `ResourcePickerSheet` in config (spec `ready`, not yet shipped).
- **C** extracted `useTaskListActions` (Someday/Upcoming handler dedup).
- **D** reduced complexity in TaskRow (`TaskRowNotes` + `clickableProps`),
  TodayPage (`groupByGoal`), and TriagePage (`buildDispatchPayload`).

**Pass 2 (re-ran fallow on the cleaned tree):**
- Un-exported `buildOutcome` — surfaced as dead once its only external
  caller moved to `buildDispatchPayload` in pass 1.
- Extracted `CloseButton` — the X-icon overlay close affordance was inlined
  verbatim in 4 overlays; dedupes a 28-line cross-file clone.

All behavior-preserving — `wasp compile` + 488 tests pass at every commit.

## Remaining items (queued, not blocking)

After the cleanup pass the signal is mostly noise or intentional. These are
the items worth a second look when next convenient:

- **23 unused *type* re-exports** in `components/ui/index.ts` — these are
  barrel re-exports (`BreadcrumbItem`, `DispatchTone`, …) that no consumer
  imports through the barrel. Low value to chase; the barrel is the public
  API and the types are documented there.
- **`DesignSystemPage.tsx`** — 5 internal clone groups (66 lines). It's a
  design-system showcase; the repetition is literal component demos. Acceptable,
  or factor into a `<DemoRow>` helper if it grows.
- **Test-setup boilerplate** — the `vi.mock("../billing/entitlementHttp", …)`
  block appears across 7 `operations.test.ts` files, but with per-file comment
  variants. A shared helper would lose the per-file rationale for ~15 lines
  saved; left as-is.
- **Inherent complexity** — `TriagePage` (675 LOC) and `TodayPage` (296 LOC)
  are still rated CRITICAL/HIGH. Both are actively-iterated core surfaces
  (`triage-classify-step` spec branch, recent Today polish); their remaining
  complexity is largely inherent to their feature set (many states × data
  sources × dialogs), not duplication. Decompose further only when a feature
  change touches them.

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
