# S9 wiring — Search + Resources on the new stack

Slice: **S9 (sitewide search + command palette + project resources)**.
Deliverables landed as fragments plus this note. Parity checklist:
`packages/contract/src/s9-search-resources/README.md` (the P0 notes).
Everything below is what the integrator (or the current tree) needs.

## 1. Composition lines

Per the slice contract the fragments are delivered uncomposed; per the S5/S6
precedent (and S8's same-call resolution) the lines were applied and verified
during this batch's e2e gate. If they are ever reverted, these are the whole
integration:

**`packages/contract/src/router.ts`**

```ts
import { searchContract } from "./search.js";
import { resourcesContract } from "./resources.js";

export const contractRouter = {
  // …existing surfaces…
  search: searchContract,
  resources: resourcesContract,
};
```

**`apps/api/src/router.ts`**

```ts
import { searchProcedures } from "./procedures/search.js";
import { resourcesProcedures } from "./procedures/resources.js";

export const router = {
  // …existing surfaces…
  search: searchProcedures,
  resources: resourcesProcedures,
};
```

**`packages/contract/src/index.ts`** — additive exports of the slice's own
schemas/types only (already applied, same as every prior slice):

```ts
export {
  searchContract,
  CommandIndexItemSchema, SearchMatchedFieldSchema, SearchResultKindSchema,
  SearchResultStateSchema, SearchSiteResultSchema,
} from "./search.js";
export type {
  CommandIndexItem, CommandIndexKind, SearchMatchedField, SearchResultKind,
  SearchResultState, SearchSiteResponse, SearchSiteResult, CommandIndexResponse,
} from "./search.js";
export { resourcesContract } from "./resources.js";
```

Wire paths: `/rpc/search/{site,index,entitlement}` and
`/rpc/resources/{create,update,delete}`.

**`packages/domain/package.json`** — additive export maps (already applied):
`"./search": "./src/search/index.ts"`, `"./resources": "./src/resources/index.ts"`.

## 2. Global palette mounting (`apps/web/src/routes/+layout.svelte`)

One block wires the palette (and, riding the same line, the global ⌘K capture
the s2-s3 note reserved). Applied and e2e-verified:

```svelte
<script lang="ts">
  import { page } from "$app/stores";
  import CapturePopover from "../lib/components/CapturePopover.svelte";
  import CommandPalette from "../lib/components/search/CommandPalette.svelte";
  import { capture } from "../lib/stores/capture.svelte";
  import { search } from "../lib/stores/search.svelte";
  const captureHostedByPage = $derived($page.url.pathname === "/do/inbox");
</script>

<svelte:window
  onkeydown={(e) => {
    capture.onGlobalKey(e);
    search.onGlobalKey(e);
  }}
/>

{#if capture.open && !captureHostedByPage}
  <CapturePopover />
{/if}
{#if search.open}
  <CommandPalette />
{/if}
```

- `search.onGlobalKey` is the webapp key contract: ⌘\ / Ctrl+\ opens the
  Command intent everywhere (even text fields); plain `/` opens Search below
  the typing guard; both are blocked by focus/triage/capture/cheatsheet via
  `paletteAvailability.ts`, fed from this stack's own state (`$page` paths,
  `capture.open`, `shell.keysHint`).
- The `captureHostedByPage` guard is interim: S3's per-page capture mounts on
  `/do/inbox` double-mount the popover while they exist. When that page drops
  them (s2-s3-wiring.md's own instruction), delete the guard line and the
  `{#if}` condition with it.

## 3. What the slice owns (files)

- `packages/contract/src/search.ts`, `packages/contract/src/resources.ts`
  (+ additive `index.ts` exports, §1)
- `packages/domain/src/search/**` (operationsCore verbatim port + the op
  layer `operations.ts` + `guards.ts` + tests),
  `packages/domain/src/resources/**` (operationsCore + `guards.ts` + tests)
- Seam: additive `types.ts` / `seam.ts` / `client.ts` / `seam.checks.ts`
  extensions — `contains`/`startsWith`/`mode` string filters, the nested
  `updates: { some: … }` EXISTS probe, search/index select+row shapes for
  Task/Project/Goal/Resource/InboxItem, resource CRUD delegate surface
  (findFirst/findMany/update/delete/create-with-row), `seam.checks` locks for
  the search + resource cores. Coexists with S8's Logbook extensions (the
  search branches discriminate on distinct select keys; ordering documented
  in client.ts).
- `apps/api/src/procedures/search.ts`, `apps/api/src/procedures/resources.ts`,
  `apps/api/src/seed-search.ts`
- `apps/web`: `lib/components/search/{CommandPalette.svelte,paletteRegistry.ts,
  paletteMatching.ts,paletteAvailability.ts}`, `lib/stores/search.svelte.ts`,
  `lib/components/ProGate.svelte`, `lib/styles/{CommandPalette,ProGate,
  resources}.css`, `lib/components/projects/ResourceSection.svelte`
- `apps/web/e2e/search.spec.ts`
- One additive block in
  `apps/web/src/lib/components/projects/ProjectDetailView.svelte` (the
  Resources mount — closes S5's deferral, s5-s6-wiring.md §3.3).

## 4. Deliberate deviations (reviewed, not drift)

1. **`search.entitlement` query** — webapp's shell knew `entitled` from
   useAuth and never fired the queries for FREE users; the new stack has no
   shell identity read yet (S11 owns settings). The fragment adds this one
   tiny query so the palette renders the calm ProGate without 402 noise.
   Retires when a shell `me` surface composes.
2. **fuse.js not installed** — apps/web gains no dependencies in this slice,
   so `paletteMatching.ts` shims the webapp's Fuse call (threshold 0.38,
   ignoreLocation, keys title 0.7 / aliases 0.2 / subtitle 0.1) with a
   token-AND scorer over the same weighted fields. Exact/prefix tiers, order
   stability, server-body pass-through, and the 30-row cap are verbatim.
   Known gap (cross-review, probed): the shim is a substring matcher, not a
   fuzzy one — typo queries real Fuse admits are rejected ("setings" and
   "trage" lose their match; webapp's own pinned case "lanch projct" →
   "Launch project" fails on the shim), while token splits across fields are
   admitted where Fuse rejects them ("dark mode" → Toggle theme). Exact,
   prefix, and 1-char tiers behave identically, and the server search path is
   byte-identical, so the regression is confined to typo'd command-mode
   input. To retire: `bun add fuse.js` in apps/web, restore the webapp body
   verbatim (the file header marks the swap point), and accept it by
   re-running webapp's pinned case above.
3. **Theme / lens-switch commands are lookups, not actions** — the registry
   keeps all 15 commands for keyset parity; `Toggle theme` and lens entries
   close the palette without acting until the shell theme toggle and the
   active-lens picker (S7 follow-up) exist. `Shortcut help` opens the existing
   keysHint cheatsheet; `Capture a thought` opens the real capture.
4. **Attachment thumbs skipped** — resource image attachments are S12 (share
   target); the contract carries none and the section renders rows only.
   The domain core still accepts attachment payloads (S12 wires the intake).
5. **`getProjectResourcesData` not ported** — the CLI list route is s18's
   surface; the web reads ride the project detail payload as in webapp. The
   function ships module-private in the domain core for that day.
6. **Resources section only on STANDARD projects** — the SIMPLE_LIST branch
   of the project page keeps S4's checklist. (Cross-review correction: the
   webapp page actually renders the Resources section unconditionally — a
   Simple-list project shows the rows and an Add button whose save answers
   the 400. The port hides the section instead: an always-erroring Add button
   is noise. Edge case either way — a STANDARD project converted to
   SIMPLE_LIST keeps its resource rows; webapp still shows them, the port
   doesn't. Revisit with the conversion surface.)

## 5. Seed (run once; idempotent, localhost-only)

```
cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-search.ts
```

Ensures the dev user has searchable demo rows (task, live + archived inbox
notes, a resource in the General project) and the PRO grant the palette
needs. e2e does NOT require it — `search.spec.ts` is self-sufficient via RPC
setup — but global-setup should adopt it when wave-2 integrates (same list as
the other seeds).

## 6. e2e

`apps/web/e2e/search.spec.ts` — the 4 webapp behaviors ported plus one S9
addition for the Resources section. Adaptations, behavior identical:

- `signupNewUser({ admin: true })` → `loginAs(DEV_EMAIL)` (the seeded PRO
  grant is the whole-account entitlement the search guard admits);
- Free case → `loginAs` a fresh unique email (the dev login route creates
  FREE users with no grant);
- `triageOneItem` → direct RPC setup (`/rpc/projects/create` +
  `/rpc/projects/createTask` + `/rpc/projects/setTaskStatus`);
- the response wait targets `/rpc/search/site`;
- the home is `/` (routes/do/+page.svelte has not composed), and an open
  task's title renders in the "Task title" input on the task page.

Run book:

```
cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev NODE_ENV=development bun --hot src/index.ts
cd apps/web && bunx vite dev --port 5174
cd apps/web && bunx playwright test --workers=1
```

## 7. Deferred / for later slices

- **S12 (PWA)** — resource attachment intake + `GET /api/attachments/:id`
  serving + the section's display-only thumbs.
- **S16 (billing)** — the ProGate upgrade links + trigger shape.
- **Shell (S-later)** — the header search button (INTERACTION's pointer
  equivalent, with the Pro badge when not entitled); theme toggle action;
  lens switching from palette rows (S7 follow-up: active-lens state).
- **s18 (CLI)** — `resource` commands over the same cores; the CLI list route
  (SIMPLE_LIST wording there is "A Simple list keeps only checklist items." —
  the CLI variant of the 400 lives in the api fragment when it composes).
