# Temporal injection refactor — one capture parser, two Temporal bindings

> Status: **planned, not started** (approved 2026-09-24). Tracked in
> [desireco/action-amp#15](https://github.com/desireco/action-amp/issues/15)
> (Roadmap board → Ready). Execute top-to-bottom: commit 1, verify, commit 2,
> verify. Work on `main`, direct commits, per `AGENTS.md`.
>
> Origin: the 2026-09-24 Wasm research pass (focus screen + triage) concluded
> Wasm buys nothing for either screen; the real pain it surfaced is the
> duplicated capture parser this plan eliminates.

## Goal

Delete the hand-synced client copy of the capture parser. `web` consumes the
domain parser directly; the Temporal dependency is injected per environment:

- **Bun (api + domain tests):** native global `Temporal`, unchanged —
  `packages/domain/src/shared/time/temporal.ts` already binds it at module
  load and throws if absent.
- **Browser:** the existing mini-Temporal shim installs itself onto
  `globalThis.Temporal` **before** `temporal.ts` evaluates, so the same
  binding module picks up the shim namespace.

The parser file `packages/domain/src/shared/capture/parse.ts` stays
**byte-identical** — only the two consumers' wiring changes.

Why this shape instead of a DI parameter on `parseCapture`: the injection seam
already exists on both sides (`temporal.ts` reads `globalThis.Temporal`; the
shim already installs a global when the platform lacks one). Wiring them
together means zero parser-body changes (preserving the "byte-verbatim port"
property the S2/S3 slice valued) and zero call-site changes. Mixing real/shim
Temporal receivers is impossible by construction: each realm has exactly one
flavor — the old shim-header warning about mixed internal-slot reads only
applies if both flavors exist in one realm, which never happens here.

Verified compatibility (2026-09-24): the shim's namespace implements every
member the parser's helper path touches — `Now.timeZoneId` (and
`instant`/`plainDateISO`), `Instant.from`/`fromEpochMilliseconds`/`compare`,
`PlainDate.from` (string + object forms)/`compare`, `PlainTime.from`. Only
`Duration.from` is absent, and nothing on the parser path uses it (no helper
the parser imports calls `Temporal.Duration`). ESM import-order semantics
guarantee the wrapper's ordering works in dev and build; Vite resolves the
domain source's `.js`-on-`.ts` specifiers (the same resolver `vitest` already
exercises on this source tree via `bunx --bun vitest run`).

## Current state (verified 2026-09-24 — line refs may drift)

- **Server parser:** `packages/domain/src/shared/capture/parse.ts:177` —
  `parseCapture(raw: string, now: Date = new Date(), knownLensNames: string[] = [], timeZone = systemTimeZone()): ParsedCapture`.
  Imports `{ Temporal, instantFrom, instantToDate, instantToPlainDate, plainDateToDb, systemTimeZone }` + types from `../time/temporal.js`.
- **Client copy:** `web/src/lib/capture/parse.ts:179` — byte-identical to the
  domain file except the header comment and the import specifier
  (`./temporal-shim` instead of `../time/temporal.js`). Sync is purely by hand;
  nothing automated checks it.
- **Temporal binding (Bun):** `packages/domain/src/shared/time/temporal.ts:112-121`
  — reads `globalThis.Temporal` at module evaluation, throws if absent. Zero
  imports (no drizzle, no `bun:*`, no node APIs) — safe for any realm that has
  a Temporal global. Exported subpath `"./shared/time"` already exists.
- **Browser shim:** `web/src/lib/capture/temporal-shim.ts` — 305 lines,
  self-contained (Intl + Date only). `MiniPlainDate`/`MiniPlainTime`/
  `MiniZonedDateTime`/`MiniInstant`, Intl two-pass timezone resolution, a mini
  `Temporal` namespace export (with `Now`), helper functions (`instantFrom`,
  `instantToDate`, `plainDateFrom`, `plainDateFromValue`, `plainDateFromDb`,
  `plainDateToDb`, `instantToPlainDate`, `systemTimeZone`, `currentPlainDate`,
  `calendarDayDifference`), and a side effect at the bottom that installs
  `globalThis.Temporal` when the platform lacks one.
- **Shim consumers:** `web/src/lib/capture/parse.ts` (the copy — deleted by
  this refactor) and `web/src/lib/format/dates.ts:6-13`
  (`Temporal, calendarDayDifference, currentPlainDate, instantFrom, plainDateFromValue, systemTimeZone`).
- **Parser consumers:** web — only
  `web/src/lib/components/CapturePopover.svelte:24`
  (`import { parseCapture, type ParsedCapture } from "../capture/parse"`).
  Server — only `packages/domain/src/inbox/operationsCore.ts:22-25`
  (api consumes it transitively via `@actionamp/domain/inbox`).
- **Test suite:** `packages/domain/src/shared/capture/parse.test.ts` — vitest,
  14 describe blocks / 66 cases, fixed local-time `NOW` (Wed 2026-06-24
  10:00), timezone-portable (NOW and expectations both use local-anchored
  `Date` constructors, parser defaults to system tz). Run via
  `bun run --filter '@actionamp/domain' test` (`bunx --bun vitest run`).
  `web` has **no** unit runner — only Playwright e2e (`web/e2e/`), which pins
  popover behavior but deliberately not chip grammar.
- **Package wiring:** `web/package.json:18` depends only on
  `@actionamp/contract` + `fuse.js`; `packages/domain/package.json` has an
  exports map (no `./shared/capture` entry yet) and is consumed as TS source
  (entries point at `src/`). Root workspaces: `api`, `web`, `packages/*`.
- **Provenance:** both parser files were born in commit `325aec9`
  (S2+S3 parity, "byte-verbatim (66/66 contract tests)");
  `docs/plans/slices/s2-s3-wiring.md:117-123` prescribes exactly this
  refactor: "If apps/web ever gains a `@actionamp/domain` dependency, drop the
  copy and import the domain module; `temporal-shim.ts` … goes with it."

## Changes

### Commit 1 — domain side (standalone green, web untouched)

1. **New** `packages/domain/src/shared/time/temporal.browser.ts` — the moved
   `web/src/lib/capture/temporal-shim.ts`, content verbatim, header rewritten
   for its new role: browser-side Temporal binding for the domain package;
   installs `globalThis.Temporal` when absent so `temporal.ts` binds it;
   the per-realm single-flavor argument replaces the old "parser never uses
   the global" comment. Keep the whole export surface (dates.ts imports the
   helpers). Note: the module is DOM-free (Intl + Date only) so it compiles
   under domain's NodeNext/no-DOM tsconfig.
2. `packages/domain/package.json` exports map += 
   `"./shared/time/browser": "./src/shared/time/temporal.browser.ts"` and
   `"./shared/capture": "./src/shared/capture/parse.ts"`.
3. Extract the 66-case suite body from `parse.test.ts` into **new**
   `packages/domain/src/shared/capture/parse.suite.ts` exporting
   `parserSuite(parseCapture)` — the describe tree moves verbatim (header
   comments travel with it); `ParsedCapture` imported as type-only so the
   suite file pulls no runtime binding.
4. `parse.test.ts` becomes a thin runner: import `parseCapture` from
   `./parse.js`, call `parserSuite(parseCapture)` — real Bun Temporal,
   unchanged coverage.
5. **New** `packages/domain/src/shared/capture/parse.browser.test.ts`: save
   `globalThis.Temporal` (cast `(globalThis as { Temporal?: unknown })` —
   domain's tsconfig has no Temporal lib), set it to `undefined`, dynamic
   `await import("../time/temporal.browser.js")` (installs the mini
   namespace), dynamic `await import("./parse.js")` (binds it), run
   `parserSuite(parseCapture)`, and `afterAll` restores the saved global so
   worker reuse can't leak the mini namespace into other suite files
   (vitest `isolate` gives per-file module registries, not per-file globals).
   The same 66 cases now prove the shim satisfies the parser graph — the
   exact class of drift this architecture could silently introduce.
   **Fallback** if Bun refuses the global clear: guard with `describe.skipIf`
   and rely on the Chromium e2e spec.

### Commit 2 — web side

6. `web/package.json` += `"@actionamp/domain": "workspace:*"`.
7. `web/src/lib/capture/parse.ts` → ~10-line wrapper:

   ```ts
   // The capture parser lives in @actionamp/domain (single source; the domain
   // suite's 66 cases pin it). Import order is load-bearing: the browser
   // Temporal binding must install globalThis.Temporal BEFORE the domain's
   // temporal.ts module evaluates and binds it.
   import "@actionamp/domain/shared/time/browser";
   export { parseCapture } from "@actionamp/domain/shared/capture";
   export type { ParsedCapture, ParsedPriority, ParsedSize } from "@actionamp/domain/shared/capture";
   ```

   **`CapturePopover.svelte` is NOT touched** — it keeps its
   `../capture/parse` import (it also carries uncommitted WIP from a
   concurrent session; do not stage it).
8. **Delete** `web/src/lib/capture/temporal-shim.ts`.
9. `web/src/lib/format/dates.ts`: import specifier `../capture/temporal-shim`
   → `@actionamp/domain/shared/time/browser` (same named exports, zero body
   changes).
10. `web/src/lib/share.ts`: header comment tweak — it cites "the
    capture-parser precedent", which this refactor removes.
11. Docs cascade: update `docs/plans/slices/s2-s3-wiring.md:117-123` (mark
    the prescribed refactor done) and any grep hits for the client copy /
    temporal-shim in `docs/features/capture.md` and elsewhere under `docs/`.

## Verification

- **Baseline first:** `bun run --filter '@actionamp/domain' test` (expect all
  green), `curl -sf localhost:8080/ready` and check :5174 to see what's
  already running (never start/kill shared dev servers blindly — AGENTS.md).
- After commit 1: domain tests — now real-Temporal + browser-shim runs of the
  66 cases; `bun run --filter api typecheck` (api consumes domain source; the
  path is unchanged but the check is cheap).
- After commit 2: `bun run --filter web check` (svelte-check; baseline
  0 errors / 8 warnings — compare counts, don't blame new work for the 8);
  `bun run --filter web build` (proves Vite client resolution of domain
  source with `.js`→`.ts` specifiers).
- If dev servers are up: `cd web && bunx playwright test e2e/capture.spec.ts`
  (localhost only — the Tailscale IP breaks service-worker specs; triage any
  failure against the concurrent WIP already in that spec before blaming this
  refactor).
- `npm run lint` count vs the known-broken baseline (93 pre-existing
  design-token violations on main; oxlint itself clean).
- Two focused commits on `main`, explicit paths only (`git add` named files,
  never `-A` — concurrent-session rule). Suggested messages:
  `refactor(domain): browser Temporal binding + dual-run parser suite (refs #15)`
  and `refactor(web): consume the domain capture parser via the browser binding (refs #15)`.

## Risks & fallbacks

- **Forced global clear in the dual-run test** under `bunx --bun vitest` —
  fallback ready (`describe.skipIf` + e2e reliance). Restore-in-`afterAll`
  prevents cross-file leakage either way.
- **Import-order coupling** is real but isolated to one commented wrapper
  file; the failure mode is a loud module-eval throw that names the fix (the
  `temporal.ts` "Temporal is not available" error).
- **Future Chromium shipping Temporal:** both realms switch to real Temporal
  automatically (the shim's install-if-missing self-disables); deleting the
  shim entirely then becomes a one-file follow-up. Type-level mixing risk is
  nil today because the parser's outputs cross as `Date`/`string`
  (`parsedScheduledDate` is a `Date` from `plainDateToDb`), never as
  `PlainDate` objects.

## Out of scope (follow-ups, not this ticket)

`web/src/lib/share.ts` twin (web↔api), `web/src/lib/capture/files.ts` caps
mirror, and the share-target client copy.
