# S2+S3 wiring — Capture + NL parse, Inbox/triage

> Handoff for the integrator. Status: all slice gates green (contract tsc;
> domain tsc + vitest incl. the slice's 103 tests; api tsc + 38/38;
> svelte-check 0 errors; oxlint clean; e2e 8/8 — see "Gates").
>
> Composition note: the two one-liners below are ALREADY APPLIED, matching the
> convention S5/S6 established mid-flight (each slice nests its own line). If
> the integrator prefers to compose themselves, they are exactly two deletions
> (the `inbox:` line + its import in each file).

## 1. Composition (two one-liners)

`packages/contract/src/router.ts`:

```ts
import { inboxContract } from "./inbox.js";

export const contractRouter = {
  tasks: tasksContract,
  inbox: inboxContract, // S2+S3
  // …other surfaces as their slices land
};
```

`apps/api/src/router.ts`:

```ts
import { inboxProcedures } from "./procedures/inbox.js";

export const router = {
  tasks: tasksProcedures,
  inbox: inboxProcedures, // S2+S3
};
```

Wire paths: `/rpc/inbox/create|list|triage|update|restore|lenses` and
`/rpc/inbox/projectsForResolver` (oRPC keeps camelCase path segments — e2e
waits on `/rpc/inbox/triage`). `apps/api/src/procedures/inbox.ts` implements
against the composed contract (`ORPC.inbox…`), so removing the line without
removing the fragment breaks api tsc.

## 2. Global ⌘K mounting (one block in `apps/web/src/routes/+layout.svelte`)

```svelte
<script lang="ts">
  import CapturePopover from "../lib/components/CapturePopover.svelte";
  import CaptureFab from "../lib/components/CaptureFab.svelte";
  import { capture } from "../lib/stores/capture.svelte";
</script>

<svelte:window onkeydown={(e) => capture.onGlobalKey(e)} />
{#if capture.open}
  <CapturePopover />
{/if}
<CaptureFab />
```

- `capture.onGlobalKey` = the webapp key contract: ⌘K/Ctrl+K works everywhere
  (even in text fields, `preventDefault`); Shift+C is the typing-safe backup.
- Until this lands, the S2/S3 route pages (`/do/inbox`) mount the popover +
  Fab themselves and handle the same keys, so capture e2e is green.
- After mounting globally, the per-page mounts can be dropped from
  `routes/do/inbox/+page.svelte` (they are marked in that file).

## 3. What the slice owns (files)

- `packages/contract/src/inbox.ts` (+ additive `index.ts` exports)
- `packages/domain/src/inbox/**` (operationsCore + tests), `src/shared/capture/parse.*`
- Seam: additive `types.ts` / `seam.ts` / `client.ts` / `seam.checks.ts` extensions
  (InboxItem/InboxAttachment/Tag delegates; Task/Project create + nested
  attachments + tag-connect; ListItem findFirst/create; Resource create),
  plus `./inbox` export in domain `package.json`
- `apps/api/src/procedures/inbox.ts`, `apps/api/src/seed-inbox.ts`
- `apps/web`: `lib/capture/{parse,temporal-shim,detectMention,caretCoords}.ts`,
  `lib/format/{dates,linkify}.ts`, `lib/triage/flow.ts`,
  `lib/stores/{capture,inbox}.svelte.ts`,
  `lib/components/{CapturePopover,CaptureFab,TriageCard,Linkify,Icon}.svelte`,
  `lib/styles/*` (verbatim webapp CSS: Overlays/Chip/Button/Linkify/TriageCard/
  PropertyChips/PickerSheet/InboxPage/TriagePage),
  `routes/do/inbox/{+page.svelte,review/+page.svelte}`
- e2e: `apps/web/e2e/{capture,triage,triage-dispatch}.spec.ts`

## 4. Seed (run once; idempotent, localhost-only)

```
cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-inbox.ts
```

Ensures the dev user's Me lens + General/Briefs (STANDARD) + Groceries
(SIMPLE_LIST) projects, a PRO manual grant (project-cap headroom for the
`project` triage decision — a dev fixture), and two unprocessed inbox items.

## 5. Deferred / for later slices

- **Images & attachments UI — S12 (PWA)**: paste/drop intake, thumbnails,
  `GET /api/attachments/:id` serving, share-target structured fields. The
  domain core already moves attachment bytes on every triage branch, and the
  contract/DTOs carry attachment metadata; only the intake/serving UI is
  missing. Nothing in the parser/CRUD paths requires them.
- **Analytics** (CAPTURE_CREATED / TRIAGE_COMPLETED) and the
  `getInboxItem` single-row read: land with the analytics + share-target
  slices (AnalyticsEvent needs a session row; fire-and-forget telemetry only).
- **Goal picker data**: triage's Supports-goal picker renders (S6 interaction,
  empty-state copy included) but the goals source feeds it once S6's contract
  composes — wire `client.goals.*` scoped to the chosen lens into
  `lib/triage/flow.ts` `projectFields` at that point.
- **On-screen Logbook restore** (archive round-trip is e2e-pinned at the wire
  via `/rpc/inbox/restore`): the Logbook UI + Restore button are S8.
- **Checklist landing view** (`/do/projects/<permalink>`): the list-item
  dispatch is e2e-pinned by response kind + Inbox zero; the on-screen
  checklist assertion upgrades when S5 composes.
- **e2e config**: the shared-dev-user specs (mine + the other slices') need
  `workers: 1` in `apps/web/playwright.config.ts` — with 2 workers the files
  race one database (repro: run capture+triage specs together without the
  flag). `bunx playwright test e2e/{capture,triage,triage-dispatch}.spec.ts
  --workers=1` is the verified green invocation.
- **Client parser sync**: `apps/web/src/lib/capture/parse.ts` is a verbatim
  client copy of the domain parser (apps/web depends only on the contract).
  If apps/web ever gains a `@actionamp/domain` dependency, drop the copy and
  import the domain module; `temporal-shim.ts` (a minimal Temporal for
  browsers without the global) goes with it. The 66-case domain suite is the
  contract both copies satisfy.

## 6. Gates (as verified)

- `packages/contract`: `bunx tsc --noEmit` ✅
- `packages/domain`: `bunx tsc --noEmit` (slice files; S5/S1+S4 in-flight
  files excluded) ✅ · `bunx --bun vitest run` 251/251 total, incl. the slice's
  103 (parser 66 + triage core 28 + capture/read 9) ✅ · oxlint 0/0 ✅
- `apps/api`: `bunx tsc --noEmit` (composed) ✅ · `bunx vitest run` 38/38 ✅
- `apps/web`: svelte-check — 0 errors/warnings on every slice file (the
  remaining check errors are S5/S6's uncomposed stores) ✅ · oxlint 0/0 ✅
- Playwright: capture 2/2, triage 4/4, triage-dispatch 2/2 (`--workers=1`) ✅
- `git status`: the slice's files plus the two additive composition lines
  (and the slice's additive seam/index edits).
