# S7+S11 wiring — Lenses (areas) + Settings (account & prefs) on the new stack

Slice batch: **S7 (Lenses/areas) + S11 (Settings/account — the lens-management
+ preference parts)**. Deliverables landed as fragments + components plus this
note; nothing outside the slice's own files was redesigned. Everything below is
what the integrator (or the current tree) needs to make the batch live.

Parity bar: functionally and visually the same as webapp (s11-settings README
is the checklist; its §6 items 1–9 + 11–15 are covered — item 10's push flow
stops at the S12 boundary, items 16–18 are S18, item 19's 401 shape is F10's).

## 1. Composition lines

Per-surface fragments implement their own contract fragment
(`implement(lensesContract)` / `implement(prefsContract)`), so parallel slices
never edit shared composition. The composition lines are:

**`packages/contract/src/router.ts`**

```ts
import { lensesContract } from "./lenses.js";
import { prefsContract } from "./prefs.js";

export const contractRouter = {
  // …existing surfaces…
  lenses: lensesContract,
  prefs: prefsContract,
};
```

**`apps/api/src/router.ts`**

```ts
import { lensesProcedures } from "./procedures/lenses.js";
import { prefsProcedures } from "./procedures/prefs.js";

export const router = {
  // …existing surfaces…
  lenses: lensesProcedures,
  prefs: prefsProcedures,
};
```

Status: these lines were applied and verified during this batch's e2e gate
(the s5/s6 precedent). The fragments themselves never edit composition — if
they are ever reverted, the two lines above are the whole integration.

**`packages/contract/src/index.ts`** — additive exports of the slice's own
schemas only (applied): `lensesContract`, `LensColorSchema`,
`LensCreatedSchema`, `LensSummarySchema`, `LENS_COLORS`; `prefsContract`,
`getAccount`/`getPreferences`/save outputs, `FOCUS_SESSION_DEFAULT`,
`FOCUS_SESSION_OPTIONS`, `TODAY_CAP_DEFAULT/MIN/MAX`, `FocusSessionMinutes`.

**`packages/domain/package.json`** — additive export map (applied):
`"./lenses": "./src/lenses/index.ts"`.

**Seam extensions** (additive, `packages/domain/src/db/`): the `LensDelegate`
gains the summary-include reads (`LensSummaryInclude` → `LensSummaryRow`:
per-lens non-done `_count`s + the `hasAnyContent`/`blockingProjects` probes,
translated to grouped count queries in `client.ts`) and the Settings tab's
CRUD writes (`count/create/update/delete`, `LensCreated` projection).
`seam.checks.ts` pins `getLensesCore`/`getLensCore`/`createLensCore`/
`updateLensCore`/`deleteLensCore`.

## 2. Contract surface (wire paths)

- `/rpc/lenses/*`: `list, create, update, delete` — shapes mirror
  webapp/src/lenses/operationsCore.ts + the op layer. Declared errors:
  `PAYMENT_REQUIRED` (402, data `{feature, reason}`), `CONFLICT` (409:
  duplicate name / seeded delete / hard delete with content / reassign goal
  collision), `NOT_FOUND` (404 lens/target), `BAD_REQUEST` (400 unknown
  palette key, reassign target = self, empty name).
- `/rpc/prefs/*`: `updateProfile, getAccount, getPreferences,
  saveTodayCap, saveFocusSessionMinutes, saveReviewPreferences,
  saveDailyReminder, getNotificationPreferences`. Validation strings are the
  webapp's verbatim.

## 3. Deliberate deviations (reviewed, not drift)

1. **`prefs.getAccount` + `prefs.getPreferences` are new reads.** The webapp
   read the account off Wasp `useAuth` and the prefs off `getAppData`; the new
   stack has no session query yet (S10) and S4's `tasks.appData` output
   deliberately omits the prefs fields. `getAccount` returns the profile, the
   sign-in email, `plan`, and the `entitled` flag the Lenses tab and lens
   switcher gate client-side. S10's future `me` query supersedes the account
   fields; retire `getAccount` then.
2. **The Pro lens soft cap is actually enforced.** The webapp's lens op called
   the generic `assertUnderCap`, whose `capViolation` short-circuits entitled
   users — so its "a 9th lens" 402 was unreachable dead code for the only
   users who pass the config gate. The port adds `assertLensesUnderCap`
   (`packages/domain/src/lenses/guards.ts`), which binds whoever passes the
   config gate at `PRO_LIMITS.lenses`, with the notes' exact payload
   (`feature: "a 9th lens"`, `reason: "more life contexts unlock with Pro"`).
   Placement preserved: config gate → count → cap → create. Unit-pinned in
   `guards.test.ts`; e2e asserts the 402 on a direct call.
3. **`isUniqueViolation` walks the error `cause` chain**
   (`packages/domain/src/goals/lifecycleCore.ts`). postgres.js wraps driver
   errors (`{query, params, cause}`) — the Postgres `23505` sits on `.cause`,
   so the old top-level-only check never matched against the real client and
   every duplicate-name rewrite (lens AND goal renames) 500'd. This is a
   strict superset of the old behavior; the goals rename-collision 409 works
   against the real DB now too.
4. **`prefs.getNotificationPreferences.vapidPublicKey` returns null** until
   S12 owns the VAPID keys. The client enable flow surfaces the webapp's exact
   "Notifications are not configured on this ActionAmp server yet." — which is
   also today's behavior without the env, so S11 parity holds.
5. **No settings keyboard shortcuts** (s11 notes §4). The settings pages are
   mouse/tap only; the global chord set does not target them.
6. **`logout` is UI-only until S10.** The Account tab's confirm dialog renders
   per parity; its confirm currently returns to `/` — S10's session-logout
   route replaces the placeholder (search `logOut` in
   `apps/web/src/routes/do/settings/+page.svelte`).
7. **About version** reads `apps/web/package.json` via `src/lib/version.ts`
   (the webapp injected `__APP_VERSION__` at build time from the same source).

## 4. Lens switching — the switcher + what re-scopes

`apps/web/src/lib/stores/lenses.svelte.ts` owns the active lens:
`localStorage["aa-lens-id"]` (id-keyed, webapp rename-safety), FREE gating on
`isIncluded` (never the name), the `<html data-lens>` identity mirror, and an
appData mirror refreshed on switch. `LensSwitcher.svelte` ports
LensChip + LensPopover (↑↓/Enter// filter/Esc, Pro chips, "+ New lens…" →
`/do/settings/lenses`).

**Shell mount lines (shared composition — apply when the shell composes; the
component is self-contained):**

```svelte
<!-- routes/+layout.svelte (or the future AppShell layout) -->
<script lang="ts">
  import LensSwitcher from "$lib/components/LensSwitcher.svelte";
  import { lenses } from "$lib/stores/lenses.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { goto } from "$app/navigation";

  let showGate = $state(false);
  $effect(() => {
    if (!lenses.appData) void lenses.loadAppData();
    if (!prefs.account) void prefs.loadAccount();
  });
  const options = $derived(
    lenses.lenses.map((l) => ({
      id: l.id,
      label: l.name,
      color: l.color,
      purpose: l.purpose,
      proLocked: !prefs.account?.entitled && !l.isIncluded,
    })),
  );
</script>

{#if showGate && lenses.gate}
  <div class="aa-pro-gate" role="alert">
    <p class="aa-pro-gate__title">{lenses.gate.feature} is a Pro feature.</p>
    <p class="aa-pro-gate__reason">{lenses.gate.reason}</p>
  </div>
{/if}

<div class="aa-shell-sidebar">
  <LensSwitcher
    {options}
    active={lenses.activeLensId ?? ""}
    onSelect={(id) => void lenses.switch(id, prefs.account)}
    onClose={() => (showGate = false)}
    onNewLens={() => goto("/do/settings/lenses")}
    newLensProLocked={!prefs.account?.entitled}
  />
</div>
```

The gate renders where the shell mounts it (the store keeps
`lenses.gate` set until a permitted switch clears it).

**Screen re-scoping status (S7 parity specifics):**

- `whatNow.svelte.ts` holds its own `lensId` + `appData` — S1's screens scope
  their queries by it; switch to `lenses.activeLensId` when the S1 screens
  adopt the switcher store (mechanical: same id, both self-heal to the first
  lens).
- `lists.svelte.ts` `loadLensList` scopes Upcoming/Someday by
  `appData.lenses[0].id` — **it ignores any active-lens state** (a known
  S4 stand-in; the wiring comment in the file says the same). Until S4's
  screens consume `lenses.activeLensId`, Upcoming/Someday always show the
  first lens. Today/Week/Done-today are global across accessible lenses by
  design (WORKFLOW §5.11), so they are lens-scope-correct regardless.
- `projects`/`goals` stores scope by the first lens the same way (S5/S6
  stand-in noted in their wiring doc).
- The server is the boundary everywhere: lens-scoped reads 402 on a locked
  lens, so a stale client scope degrades to the ProGate, never to leakage.

## 5. e2e

`apps/web/e2e/lenses.spec.ts` (10 tests; the s11 README §6 checklist items
1, 2, 6, 7, 8, 11, 12, 13, 14, 15 — there is no webapp lenses e2e; this file
IS the spec). Data seeded by `apps/api/src/seed-lenses.ts` (idempotent,
localhost-only, RESET semantics for the two s11 users' work rows + prefs):

```
cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-lenses.ts
# API:  cd apps/api && DATABASE_URL=… NODE_ENV=development bun --hot src/index.ts
# Web:  cd apps/web && bunx vite dev --port 5174
cd apps/web && bunx playwright test --workers=1
```

- `s11-lenses@test.local` PRO — Me + Work (1 goal / 1 project / 1 task,
  "Day job") + Studio (empty, coral).
- `s11-free@test.local` FREE — the two defaults.
- The spec is self-consistent (unique-per-run names, cleanup after reassigns),
  but run the seed before the first pass on a fresh DB — the exact-list and
  cap tests assume the seeded three.

Gates at batch time: contract `bunx tsc` clean; domain `bunx --bun vitest run`
326 green + `bunx tsc` clean; api `bunx tsc` clean + vitest 38/38;
`bunx svelte-check` 0 errors; oxlint clean on the slice's paths; playwright
full suite 37 passed / 1 skipped (pre-existing skip) with the lenses spec
10/10.

## 6. Deferred to other slices

- **S12 (push/PWA):** `savePushSubscription`, the VAPID keys behind
  `vapidPublicKey`, and the service-worker steps of the daily-reminder enable
  flow (the client marks the call site with `S12 wiring:` in
  `preferences/+page.svelte`).
- **S16 (billing):** the Settings tab bar's Billing link is a stub link; the
  Account/Preferences pages never link pricing.
- **S18 (CLI routes) + S10 (session):** the "Access tokens" tab is a stub
  link (webapp `patRoutes.ts` REST surface); logout route per §3.6.
- **S17 (admin):** out of scope here — no admin tab exists in the webapp tab
  bar, so none was rendered.
- **S1/S4/S5/S6 follow-up:** migrate the screens' lens scoping to
  `lenses.activeLensId` (§4); retire `projects.moveTargets` once the Move
  picker consumes `/rpc/lenses/list`.
