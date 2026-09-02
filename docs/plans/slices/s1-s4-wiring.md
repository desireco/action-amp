# S1 (What Now + Focus) + S4 (Tasks & lists) — wiring notes

> Integration notes for the combined S1+S4 batch. **No composition edits were
> required**: the batch extends the existing `tasks.*` namespace, whose
> composition line (`tasks: tasksContract` / `tasks: tasksProcedures`) already
> exists in both routers, so every new procedure flows through automatically.

## 0. Composition — nothing to add

- `packages/contract/src/router.ts` — unchanged (`tasks:` line pre-existed).
- `apps/api/src/router.ts` — unchanged.
- `packages/contract/src/index.ts` — additive export block for the S1+S4
  schema names (see the comment in the file). `SizeSchema` is NOT re-exported
  from tasks.ts there — the inbox fragment already exports it (a second
  export of the same name is a TS duplicate-export error).
- Package wiring: `packages/domain/package.json` gained one exports entry
  (`"./simpleLists"`) and `packages/domain/src/tasks/index.ts` gained four
  additive barrel lines (taskExtrasCore, appDataCore, extrasEntities,
  focusedTask) — the standard barrel pattern, frozen core files untouched.

## 1. Seed (run before the S1/S4 e2e specs)

```sh
cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bun src/seed-s4.ts
```

Idempotent AND resetting (dedicated test users, so re-runs wipe + recreate
their rows; stamps `lastTodayRolloverAt` so the lazy rollover never sweeps the
seeded Today rows mid-run):

- `s4-next@test.local` — "Bench task" (Upcoming, undated), "Deep work task"
  (Someday; the spec promotes → starts → completes it through focus).
- `s4-today@test.local` — "Focus task 1..6" + "Swap me around", all Today
  (cap test + the When-chip round-trip).
- `s4-lists@test.local` — SIMPLE_LIST projects "Packing" (`/do/projects/packing`)
  and "Groceries".

## 2. e2e specs (all green: 7/7)

| Spec | Ports | Notes |
|---|---|---|
| `apps/web/e2e/next.spec.ts` | webapp next.spec 1–3 | Mobile viewport; "Wrap up" → composer → "Mark complete" selectors per the 2026-08-08 redesign; triage steps re-bound to `tasks.updateStatus` (capture/triage are S2/S3 surfaces). |
| `apps/web/e2e/today.spec.ts` | webapp today.spec 1–2 | Cap assertions identical; demote/promote re-bound to the **When chip** in the expanded row drawer (capped rows host the editor; overflow rows carry only "Do" — parity). |
| `apps/web/e2e/simple-lists.spec.ts` | webapp simple-lists.spec | Create-via-projects (S5) and triage-into-list (S2/S3) steps deferred to those slices; checklist surface (add / check / clear-checked / n-j-k-Space-e-Del-Esc keyset) fully covered on the seeded "Packing" list. The add flow refocuses the input after each add (webapp parity), so the spec blurs before sending single-key commands. |

### smoke.spec.ts (NOT this batch's file — needs the orchestrator)

`apps/web/e2e/smoke.spec.ts` fails 3/3 because its assertions target the F11
spike ModeScreen that this slice's What Now home replaces (per the batch's
mandate that `/` is the What Now screen). Suggested rebinding, keeping the
valuable wire-level checks:

- Test 1 (unauthenticated shell) → unauthenticated `/` renders the What Now
  empty-state chrome without crash (the SPA shows the error/empty branch).
- Test 2 (seeded data path) → keep the `apiPost("/rpc/tasks/list", {})`
  wire assertions verbatim (they still pass; the seed user's rows are there),
  drop the ModeScreen on-screen rows assertion in favor of
  `loginAs` + `/` showing the What Now hero for `dev@local.test`… note the
  dev user has no "Me" lens guarantee — seed-s4 users or seed.ts's lens both
  work.
- Test 3 (mode dial keys) → superseded by next.spec's focus-mode keyboard;
  delete or rebind to What Now keys.

## 3. Contract surface added (all under `tasks.*`)

Queries: `topTask`, `alternatives`, `otherLensCounts`, `focusedTask`, `task`,
`today`, `week`, `doneToday`, `byLens`, `appData`, `pickProjects`,
`pickGoals`, `simpleList`, `listProject`.
Actions: `start`, `pause`, `completeSession`, `complete`, `snooze`,
`toggleDone`, `addUpdate`, `updateContent`, `setOutcome`, `updateDetails`,
`updateStatus`, `unscheduleOverdue`, `createListItem`, `renameListItem`,
`setListItemDone`, `deleteListItem`, `clearCompletedListItems`.

Wire conventions: instants are ISO strings; `scheduledDate` is `yyyy-MM-dd`
(UTC-midnight `Date` at the seam, per the `@db.Date` convention). Core
`Error`s are the webapp's user-facing validation messages, rethrown as oRPC
BAD_REQUEST (the HttpError(400) analogue).

## 4. Judgment calls the integrator should know

1. **`assertLensAllowed`** — ported inside the api fragment (resolveLens →
   lensViolation). oRPC has no native 402 code; the Pro gate throws
   `FORBIDDEN` with the webapp's exact message (`"<feature> is a Pro
   feature."`) and `{feature, reason}` in `data`. Revisit when S16 unifies
   error surfaces.
2. **User prefs** — the seam has no User delegate (and `ActingUser` carries no
   `timeZone`/`focusSessionMinutes`/`todayCap`), so the batch ships a minimal
   User delegate in `createTaskExtrasEntities` (`packages/domain/src/tasks/
   extrasEntities.ts`); handlers read prefs per request (one extra PK query
   vs the webapp, same behavior).
3. **Extra delegates** — `createTaskExtrasEntities` (TaskUpdate/User/Project/
   Goal) and `createSimpleListEntities` (Project guard + ListItem CRUD) live
   beside their cores, NOT in the seam's `createEntities`, avoiding collisions
   with S5/S6's concurrent seam work. They follow the same client-side-default
   rules (mint ids, P2025 analogue). If the integrator later folds them into
   the seam, the cores' slices are already satisfied by the seam's shapes.
4. **`getFocusedTask`** — its include (tags + FULL thread + FULL sessions +
   project→goal) is not a seam overload, so it's a domain-side Drizzle query
   (`tasks/focusedTask.ts`, `getFocusedTaskData(db, {userId})`), never
   `db.$client` raw. The API attaches `focusSessionMinutes` from prefs.
5. **`appData` counts** — `{today, upcoming, someday}` only (the three the
   S1/S4 screens read); inbox/projects/goals badge counts rejoin with S2/S5/
   S6. Same scope rules as the webapp (today global-accessible; the rest
   active-lens). Includes the lazy daily rollover + throttled `lastActiveAt`.
6. **Analytics** — `FOCUS_STARTED`/`TASK_COMPLETED` are NOT ported (no
   analytics delegate in packages/); the behavioral contract is unaffected.
   Onboarding advance (SAMPLE_TASK → CAPTURE) IS ported.
7. **`completeTaskFromFocus` / `updateTaskDetails`** — ported from the webapp
   operations.ts wrappers into `packages/domain/src/tasks/taskExtrasCore.ts`
   (bodies verbatim; guard reads use full-row `findUnique` since the seam's
   select union is advisory-only at runtime).
8. **Over-cap overflow rows** carry no row editor (webapp parity) — the
   today.spec swap test therefore uses a capped row.

## 5. Parity checklist status (P0 notes)

S1 — routes `/do`, `/do/today/:permalink`, `/do/focus`: **done** (What Now
card + context line + alternatives rail cap 2 + why-rationale split
lead/whyEmphasis + goal rationale + continuity stats + latest note + empty
state with other-lens hints + picked-not-found state + snooze sheet presets;
focus ring/planned 25|45 from prefs/wrap-up composer/pause+exit/Esc-layering/
n-p-d-keys/⌘↵; single-Now invariant via startTaskCore).
Deferred: onboarding CAPTURE/TRIAGE guide stages (S13), attachment lightbox +
thumbs (rendered metadata only when present; S9's byte route), ⌘K capture
(S2), splash veil reduced to a plain placeholder (no SplashScreen component
ported).

S4 — Today (cap display/meter/banner/overflow "Do"/goal grouping/lens pill
when 2+ lenses/done-today with Hide-Show), Upcoming (six buckets fixed order,
rose overdue group, recovery banner + unschedule), Someday (flat muted, no
promote button), Week (Mon–Sun, empty days kept, "Today · " prefix, overdue →
Today bucket), Task detail (prose Save, won't-do ConfirmDialog, done-panel
outcome via setOutcome, property keys [ ] - = H live), Row editors
(chips-only, immediate updateTaskDetails saves, due-on-Someday auto-promotes,
one-parent rule, invalid picks dropped), Simple lists (≤500 validation,
Open/Checked sections, clear-checked confirm, full keyset): **done**.
Deferred: FeedbackDialog on Today's done rows + done-task feedback inline
form (S17-adjacent feedback surface, no feedback op in this batch's
contract), "Insert project resource" picker on detail (S9), row reorder ops
for simple lists (`order` is create-time max+1; no reorder op exists in the
webapp ops either — reorder UI is a later spec), Today cap editor
(saveTodayCap → S11 settings).

## 6. Files owned by this batch

- `packages/contract/src/tasks.ts` (extended), `packages/contract/src/index.ts` (additive exports)
- `packages/domain/src/simpleLists/**` (core + entities + tests + barrel), `packages/domain/src/shared/imageAttachments.ts`
- `packages/domain/src/tasks/`: taskExtrasCore(.test).ts, appDataCore.ts, extrasEntities.ts, focusedTask.ts, index.ts (additive lines)
- `packages/domain/package.json` (one exports line)
- `apps/api/src/procedures/tasks.ts` (extended), `apps/api/src/seed-s4.ts` (new)
- `apps/web/src/lib/`: dto.ts, taskView.ts, stores/{whatNow,lists,simpleList}.svelte.ts, components/{WhatNow,WhatNowCard,AlternativesRail,FocusView,TaskRow,GroupedList,PropertyChips,RowEditor,SnoozeSheet,BottomSheet,PickerSheet,ConfirmDialog,ListEmpty,CountLinkButton,CompletionCircle,Chip,SimpleListChecklist}.svelte
- `apps/web/src/routes/+page.svelte` (What Now home) + `do/today`, `do/today/[permalink]`, `do/focus`, `do/upcoming`, `do/someday`, `do/week`, `do/tasks/[permalink]` (+ the SIMPLE_LIST branch of `do/projects/[permalink]`, now co-hosted with S5's standard-project view)
- `apps/web/e2e/{next,today,simple-lists}.spec.ts`

## 7. Gate results (at handoff)

- contract `bunx tsc --noEmit` — clean.
- domain `bunx tsc --noEmit` — clean; `bunx --bun vitest run` — 251/251
  (24 of those are this batch's: 11 simpleLists + 13 taskExtras).
- api `bunx tsc --noEmit` — clean; `bunx --bun vitest run` — 38/38.
- web `bunx svelte-check` — 0 errors, 0 warnings.
- `bunx oxlint` on this batch's paths — 0 warnings, 0 errors.
- `bunx playwright test e2e/next.spec.ts e2e/today.spec.ts e2e/simple-lists.spec.ts`
  (both servers up, seed run) — 7 passed.
