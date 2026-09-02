# S1 — What Now + Focus (parity notes)

> P0 pre-study for the platform switch. Source of truth read: `webapp/src/app/`
> (NextPage, FocusPage, focusWhy, taskContext, focusTaskView), `webapp/src/tasks/`
> (operations, operationsCore, activePool), `webapp/src/components/ui/`
> (NextCard, NextAlternatives, SnoozeSheet, FocusMode), `webapp/main.wasp.ts`,
> `webapp/e2e/next.spec.ts`, `docs/WORKFLOW.md` §2.3 + §5, `docs/INTERACTION.md`
> (Working mode). These notes are the checklist the port is verified against.

## 1. Routes / screens

| Route (main.wasp.ts) | Page | Purpose |
| --- | --- | --- |
| `/do` (`AppRoute`) | `app/NextPage` | The home screen — What Now chooser. One task card, not a list. |
| `/do/today/:permalink` (`TodayTaskRoute`) | `app/NextPage` (same page) | The picked-task path: a chosen alternative/task takes the stage. `?task=<token>` on `/do` redirects here (`replace: true`). |
| `/do/focus` (`FocusRoute`) | `app/FocusPage` | Dedicated focus route (not an overlay). Renders the user's single started task; redirects to `/do` when none. |

## 2. Operations (→ oRPC endpoints)

All are Wasp ops in `webapp/src/tasks/operations.ts` delegating to pure cores in
`webapp/src/tasks/operationsCore.ts` (the same cores the `/api/cli/*` routes
call — keep them shared). Auth wrapper: `if (!context.user) throw`.

**Queries**

- `getTopTask` — in `{ lensId }` → `HydratedTask | null`. Guard: `assertLensAllowed(context, lensId)` (FREE → only the included lens, else `HttpError(402, "<feature> is a Pro feature.", {feature, reason})`; branches on `Lens.isIncluded`, not name). Core path: `getTopTaskData` (rank → winner id) then `hydrateTopTaskData` (scoped `{id, userId}`; if the row vanished between rank and hydrate → `null`, never stale). Hydration includes `project{id,permalink,name, goal{id,name,description}}`, `goal{id,permalink,name,description}`, `sessions` (orderBy `startedAt asc`, select startedAt/endedAt), `updates` (where `kind: "NOTE"`, orderBy `createdAt desc`, select body/createdAt), `attachments{id,filename,mimeType}`. History relations attach **only to the winner**.
- `getTaskAlternatives` — in `{ lensId, excludeIds?: string[] }` → `RankedPoolRow[]` (light rows: project/goal names only). Guard: `assertLensAllowed`. Core: `getTaskAlternativesData` — same ranked pool, filters `excludeIds`, slices to `TASK_ALTERNATIVES_LIMIT = 2`.
- `getOtherLensTaskCounts` — in `{ excludeLensId }` → `{ lensId, lensName, count }[]`. Core: `getOtherLensCountsData` resolves the accessible-lens set first (locked FREE lenses never leak), counts per lens via `activePoolWhere`, omits zero-count lenses.
- `getTask` — in `{ id }` (accepts id **or** permalink: `OR: [{id}, {permalink: id}]`) → detail row + `tags`, `updates` (orderBy `createdAt asc` — chronological thread), `project/goal` with permalinks, `attachments`. No lens guard (detail reads unguarded). Core: `getTaskData`.
- `getFocusedTask` — no args → the user's one started task (`userId, isDone: false, startedAt: not null`, orderBy `startedAt desc`), including `tags`, `updates` asc, `sessions` asc, `user.focusSessionMinutes`, `attachments`, `project` (+ nested `goal{id,name,description}`), `goal{id,permalink,name,description}`. Written directly in the wrapper (no core).

**Actions**

- `startTask` — in `{ id }` → `{ id, startedAt }`. Reads `User.focusSessionMinutes` (`45 ? 45 : 25`). Core `startTaskCore`: (1) `updateMany` clears `startedAt` on **every** other started task of the user, (2) defensive `updateMany` closes **all** the user's open `TaskSession`s (`endedAt = now`) — single-Now invariant, (3) creates `TaskSession { taskId, userId, startedAt: now, plannedMinutes: 25|45, completed: false }`, (4) sets `task.startedAt = now`. Then records analytics `FOCUS_STARTED` (visitorId `user_<id>`, route `/do/focus`), best-effort (`void … .catch`).
- `pauseTask` — in `{ id }` → `{ id, startedAt: null }`. Core `pauseTaskCore`: closes this task's open sessions (`endedAt = now`, idempotent `updateMany`), sets `startedAt: null`. Task stays a candidate.
- `completeFocusSession` — in `{ id }` → `{ completed: false }` (no open session) | `{ completed: true, endedAt }`. Core `completeFocusSessionCore`: finds latest open session (`endedAt: null`, orderBy `startedAt desc`); server-side time check — if `now < startedAt + plannedMinutes` (Temporal Duration; `plannedMinutes === 45 ? 45 : 25`) throws `"Focus session is still running."`; on success stamps `endedAt = targetEnd` (the **planned** end, not actual now) and `completed: true`. Timer completion ≠ Task completion.
- `snoozeTask` — in `{ id, preset: "1h" | "3h" | "tomorrow" | "weekend" | "someday" }` → `{ id, status, scheduledDate, snoozedUntil }`. Pure math `snoozeTarget(preset, now, timeZone)`: `1h`/`3h` = now + 1h/3h exact; `tomorrow` = next calendar day at **09:00** in `User.timeZone`; `weekend` = next **Saturday 09:00** local (`(6 - dayOfWeek + 7) % 7 || 7` — Saturday today → +7d); `someday` = `status: SOMEDAY, snoozedUntil: null, scheduledDate: null`. All others set `status: UPCOMING`. Every snooze clears `startedAt`.
- `addTaskUpdate` — in `{ taskId, body }` → `TaskUpdate`. Trims body; empty → `"Note cannot be empty."`. Creates `kind: "NOTE"` (append-only; never mutates task fields).
- `updateTaskContent` — in `{ taskId, content }` → `{ id, content }`. `content.trim() || null`. (Durable clarification, separate from the thread.)
- `completeTaskFromFocus` — in `{ taskId, outcome? }` → `{ id, completedAt }`. Guards: not owned → `"Task not found."`; already done → idempotent return of existing `completedAt` (no second event); `!startedAt` → `"Start the task before completing it."`. Writes: `isDone: true, completedAt: now, startedAt: null` (+ `outcome.trim() || null` only when `outcome !== undefined`; un-completing never clears it), closes open sessions (`endedAt = completedAt`), creates `TaskUpdate { body: "Completed", kind: "COMPLETED" }`. **Status is NOT touched** (so Today's Done section scoping stays accurate). Advances onboarding `SAMPLE_TASK → CAPTURE` when `isOnboardingSample`; analytics `TASK_COMPLETED` (metadata `surface: "onboarding_sample"` for samples).
- `toggleTaskDone` (adjacent, used by other surfaces) — in `{ id, outcome? }`: flips `isDone`, sets `completedAt` on done / clears it on open, **always clears `startedAt`**; outcome only written when marking done; un-completing preserves an existing outcome.

**Entities / DB shape** (`webapp/schema.prisma`)

- `Task`: `description` (title), `permalink` (`@@unique([userId, permalink])`), `content?`, `outcome?`, `isDone`, `completedAt?`, `startedAt?` (non-null = Now), `isOnboardingSample`, `priority Priority` (`LOW|NORMAL|IMPORTANT`, default `NORMAL`), `size Size` (`S|M|L|XL`, default `M`), `status TaskStatus` (`SOMEDAY|UPCOMING|TODAY|WONT_DO`, default `SOMEDAY`), `scheduledDate DateTime? @db.Date` (calendar day), `snoozedUntil DateTime? @db.Timestamptz(3)` (exact instant), `order Int @default(0)`.
- `TaskSession`: `startedAt`, `endedAt?` (null = open; invariant: at most one open per task, enforced close-before-open in start/pause/complete), `plannedMinutes Int?` (25|45; null = legacy), `completed Boolean @default(false)` (true only when a countdown reached zero).
- `TaskUpdate`: `body`, `kind TaskUpdateKind` (`NOTE|COMPLETED`, default `NOTE`), `createdAt`.
- `User`: `focusSessionMinutes Int @default(25)` (closed set 25|45), `timeZone String?` (IANA; null → `"UTC"`), `todayCap Int @default(5)`.

## 3. Behaviors

**Candidate pool** (`tasks/activePool.ts` → `activePoolWhere`) — one predicate drives
Next AND every count that must agree with it: `status ∈ {TODAY, UPCOMING}`,
`isDone: false`, `scheduledDate` null or ≤ today's calendar date in `User.timeZone`,
`snoozedUntil` null or ≤ now. The two guards are independent (a short snooze
hides a scheduled task without dropping the schedule). `SOMEDAY` is never a
candidate. A freshly triaged task (no date, no snooze) is actionable immediately.

**Ranking** (`rankTopTask`, exported for CLI parity):

1. `startedAt != null` first — the Now state survives navigation; among two
   started, earlier `startedAt` wins.
2. `status === "TODAY"` beats `"UPCOMING"` (the court outranks the bench).
3. `PRIORITY_RANK`: `IMPORTANT: 0 < NORMAL: 1 < LOW: 2`.
4. `SIZE_RANK`: `S: 0 < M: 1 < L: 2 < XL: 3` (quick win first).
5. `createdAt` ascending (oldest first).

**Now/Next state machine** — `Next → (Start) → Now → (Done | Defer | Pause) → Next`.
`Now` = `Task.startedAt != null`, persists across navigation (always ranked #1).
Start = `startTask` + `navigate("/do/focus")` in one action (the card's primary
button is always labeled **"Start"** whether candidate or started; started → just
navigates). Pause = `pauseTask` (stays a candidate, loses the slot). Defer =
snooze. Done = `completeTaskFromFocus` (only from focus; the Next card has **no**
completion control).

**Alternatives rail** (NextAlternatives) — "Or choose another task in \<Lens\>"
with hint "The recommendation stays available." Same pool, same comparator, minus
the on-stage task (`excludeIds`), capped at 2. Rendered only while deciding
(`next` state incl. picked task; a started task keeps the stage to itself — query
`enabled: !!lens && !task?.startedAt`). Choosing = pure navigation to
`/do/today/:permalink`; nothing is snoozed/started/demoted; the engine's #1
re-enters the list flagged **"Suggested"** (kicker on its row; rows show
"Choose instead").

**Matcher rationale** (`focusWhy.ts composeWhy`) — truthful, omit-when-empty:
`startedAt` → lead "You're already doing this." (terminal). Lead otherwise:
"Important" (IMPORTANT) · "Quick win" (LOW with size S/M) · "Low priority" (LOW
with L/XL) · none for NORMAL. Detail clauses appended in order: due ("overdue"
(diff<0) / "due today" (0) / "due tomorrow" (1) / "due \<weekday short\>" (≤7d) /
"due \<Mon 30\>" (>7d)) and size ("fits in 15|30 min" — only S/M). Join rules:
with a lead, single overdue part → "and overdue", else "— part1, part2"; no lead
→ detail is the reason, first letter capitalized. `lead → why` (plain),
`detail → whyEmphasis` (strong amber) on the card; a lead-less detail renders
plain, never amber-alone.

**Goal rationale + continuity** (`taskContext.ts`, next state only — never on the
`now` card): `resolveGoal` precedence `project.goal → task.goal → null` (one Goal,
never merged; description trim, whitespace → null). With description: question
"Why does this matter?" + description + attribution "Goal · \<name\>"; without:
"Toward \<name\>." only, no attribution. Never manufactures rationale from
project/task text, priority, due dates, or history. Continuity: valid session =
`endedAt > startedAt` (open/zero/reversed don't count); `workedMs` sum of valid
closed sessions; `formatWorkedLabel`: positive `<1 min worked` when
`workedMs < 60_000`, else rounded minutes with singular/plural ("1 min worked",
"42 min worked"), zero → null; stats row "`<worked> · N session(s) · M note(s)`"
(zero segments omitted; all-zero → no row); `latestNote` = newest trimmed
non-empty NOTE (`kind=COMPLETED` excluded), passive two-line preview labeled
"Latest note".

**Focus screen** (`FocusPage` + `FocusMode`, centered-session layout): one large
centered countdown ring (teal path, `strokeWidth 1.6`) counting down
`focusSessionMinutes * 60_000`; elapsed = now − `sessionStartedAt` (fallback
`startedAt` for legacy pointer-without-session rows); label "`<25|45>` min focus"
or "session complete"; completed-count chip (Timer icon + N, aria
"N completed focus session(s)") shown when > 0; pause/resume control inside the
ring (Pause → exit; after session complete → Play "Start another focus session"
→ `startTask` again — repeat sessions on the same task). Clock freezes while the
wrap-up composer is open. Below the ring: task title, goal rationale block,
clarification (markdown `content` with "Edit details", or empty-state "Add task
details to clarify what done looks like."), attachment thumbs (working material),
action row **Add note / Pause / Wrap up**, append-only activity thread (newest
first visually via column-reverse; NOTE rows + "Completed" event rows with time
"9:41 AM"; "No notes yet." when empty), mobile-only "Not now" (opens SnoozeSheet).

**Completion flow**: "Wrap up" opens the inline composer "How did it go?" with
prompt "`You focused for X. ` Capture a result, decision, learning, or next step.
Optional" (frozen clock, dimmed timer). "Mark complete" (or ⌘↵) → optimistic
local strike-through + `completeTaskFromFocus` → navigate `/do`. "Keep working"
posts the typed text as a NOTE and restores the action row. Onboarding sample
tasks (`task.isOnboardingSample` → `skipCompletionReflection`) complete instantly
with no composer. On failure: error "Could not complete the task. Try again.",
draft restored.

**Exiting focus** (X button "Pause and exit focus", Esc, p, Space) = `pauseTask`
+ refresh + navigate `/do` — no ghost open session.

**Empty / loading states** (NextPage): "Nothing on the table." +
"You're all caught up. Capture something with ⌘K, then triage it to Today to put
it on the table." + "See Today →" link; per-other-lens hints
"`<Lens> · N on the table →`" (from `getOtherLensTaskCounts`, count > 0 only,
click switches lens). Picked token not found → "That task isn't available." /
"It may have moved or been completed. Go back to Today, or clear the selected
task." Onboarding stages `CAPTURE`/`TRIAGE` render the guide instead
("Capture one real thought." / "Now decide what it becomes."). Splash latch: the
welcome veil covers only the first data load; later loads show "…" placeholder.
`getFocusedTask` waits for `isFetching` (stale empty cache must not bounce to
`/do` and force a second Start tap).

## 4. Keyboard

**Global** (`app/useKeyboardShortcuts.ts`, wired app-wide): `⌘K` capture (works
in text fields — the focus-protector) · `⌘\` command palette · `⌘L` lens
switcher · `⌘?` cheatsheet · `Esc` closes topmost overlay · `/` search (outside
fields) · `Space` → `/do` (outside fields + not on button/link/role=button/link)
· `⇧I` Inbox · `⇧N` Next · `⇧T` Today · `⇧G` Triage · `⇧P` Planning · `⇧R`
Review · `⇧C` capture (typing-safe) · `?` cheatsheet (outside fields).

**FocusMode** (window-scoped; typing targets swallow everything but Esc):

- `Esc` — layered: close snooze sheet → close composer → cancel content editor
  (restore draft) → exit focus (pause).
- `n` / `N` — toggle the note composer.
- `p` / `P` **or `Space`** — pause + exit focus.
- `d` / `D` — open the wrap-up (completion) composer.
- `⌘↵` / `Ctrl↵` — submit composer (save note / mark complete); plain `Enter`
  inserts a newline.
- `⌘K` still works (global handler) — the one exception inside Working mode.

Doc keyset (`docs/INTERACTION.md` Working mode) matches impl: Esc/Space pause, D
completion reflection, ⌘K capture, everything else suppressed (zoom, mode, lens).
INTERACTION.md's broader Normal-mode keys (`Z`/`X` zoom, `1`/`2`/`3` mode dial,
`S` switch, `←`/`→` peek, `Enter` start) are the modal architecture's doc-level
map; `Enter`-to-start is not bound in NextPage today (Start is a button).

## 5. Edge cases + invariants

- **Entitlement**: `getTopTask`, `getTaskAlternatives`, `getTasks` call
  `assertLensAllowed` — resolves lensId → lens (tenancy-safe), decision keys on
  `isIncluded` (rename-safe). Paid = `isPlanActive` PRO/FOUNDER or
  `manualAccessGrant` PRO/FOUNDER/FRIEND or `isAdmin` (all bypass). Expired PRO
  (past `planRenewsAt`) is FREE. FREE gets exactly the included lens (seeded Me).
- **Single Now invariant**: `startTask` clears every other `startedAt` and closes
  every open `TaskSession` for the user (ghost-timer prevention).
- `completeFocusSession` is server-time-guarded (early call throws) and stamps
  the planned end, not the actual click time.
- `completeTaskFromFocus` is idempotent (double-click must not double-log
  `kind=COMPLETED`) and requires `startedAt`.
- Snooze/`toggleTaskDone` always clear `startedAt`; snooze-to-someday also clears
  `scheduledDate`.
- **Date/time**: all calendar math goes through `webapp/src/shared/time/temporal.ts`
  (Temporal polyfill): server compares `scheduledDate` as UTC-midnight `Date`
  (`plainDateToDb`) against today-in-`User.timeZone`; `snoozedUntil` compared as
  exact instants; client-side labels use `calendarDayDifference(currentPlainDate(),
  plainDateFromValue(date))` in the **system** zone. `User.timeZone ?? "UTC"`
  everywhere; `initializeTimeZone` seeds it once from the browser.
- Analytics (`FOCUS_STARTED`, `TASK_COMPLETED`) are fire-and-forget; failures
  swallowed. Onboarding advance on completion applies only while the user is on
  stage `SAMPLE_TASK` (`updateMany` guard).
- React Query invalidation keys after each mutation (port must refetch the same
  surfaces): `getTask`, `getTopTask`, `getTaskAlternatives`, `getFocusedTask`,
  `getTasks`, `getDoneToday`, `getLogbook`, `getAppData`, `auth/me`.
- Output shapes must stay SuperJSON/mapped-type friendly (Wasp payload constraint
  — homomorphic mapped types, not interfaces extending Prisma rows).

## 6. e2e coverage (`webapp/e2e/next.spec.ts`)

Suite runs **mobile**: `viewport 390×844, isMobile, hasTouch` (a reported
double-tap bug — Start must reach focus with no intermediate card).

1. "an Upcoming task (no due date) also surfaces on home" — signup →
   `completeTopTask` (clears up to 3 seeded starter tasks via the focus loop) →
   triage "Bench task" as task with **no When** (lands Upcoming, no
   scheduledDate) → `/do` shows "Bench task". (Pool = Today + undated/future-due
   Upcoming, WORKFLOW §5.2.)
2. "'Start' enters focus mode in one action (F13)" — after cleanup, triage
   "Deep work task" with `when: today` → `/do` shows the task and a `/Next in/`
   context label → click button `/^start$/i` → URL is `/do/focus` and
   `getByLabel(/focus:/i)` is visible.
3. "completing a task in focus mode removes it from Next (F16)" — Start → focus
   → complete via buttons `/mark complete/i` then `/^complete$/i` → the task
   text has count 0 (left focus and Next; no checkbox path exists).

Dropped on purpose (spec header): empty-state, "a Today task appears", "Now
persists", Pause, "Not now" — trivial or component-tested.

**Spec drift warning**: the completion selectors in tests 1–3 helpers
(`"Mark complete"` → `"Complete"`) predate the 2026-08-08 centered-session
redesign (`db5c598`); current labels are **"Wrap up"** → composer **"Mark
complete"** (instant complete for onboarding samples). Keep the three
transitions, re-bind the selectors. Helpers: `signupNewUser` (DB-seeded verified
user + `/login?devEmail=` autologin), `completeTopTask`, `triageOneItem`
(capture ⌘K → wizard → Ready).
