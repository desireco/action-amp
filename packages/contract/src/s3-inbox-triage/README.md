# S3 — Inbox / Triage (parity notes)

> P0 pre-study for the platform switch. Source of truth read: `webapp/src/inbox/InboxPage.tsx`,
> `TriagePage.tsx`, `triageFlow.ts`, `triagePropertyFields.ts`, `useTriageKeyboard.ts`,
> `projectResolver.ts`, `operations.ts` / `operationsCore.ts`, `webapp/main.wasp.ts`,
> `webapp/e2e/triage.spec.ts` + `triage-dispatch.spec.ts` + `helpers.ts`,
> `docs/TRIAGE.md` (canonical keymap/co-author), `docs/WORKFLOW.md` §2.2,
> `docs/features/inbox-triage.md`. These notes are the checklist the port is verified against.

## 1. Routes / screens

| Route (main.wasp.ts) | Page | Notes |
|---|---|---|
| `/do/inbox` — `InboxRoute` | `inbox/InboxPage.tsx` | The queue surface: centered list of UNPROCESSED items, newest first, with parsed-token chips. `?item=<id>` search param scrolls that row into view (smooth; `auto` under reduced motion) and highlights it (`is-search-target`). |
| `/do/inbox/review` — `InboxTriageRoute` | `inbox/TriagePage.tsx` | The per-item wizard. `?i=N` (from an inbox row click) seeds the START position: the snapshot queue is **rotated** so item N is first, then wraps — a session always drains every item that was waiting on entry. `i` is read once (non-reactive) so a stale URL value can't yank the index. |
| `/do/logbook` | (S-other) | Archive destination: archived InboxItems surface in the Logbook's archived section with a Restore action. |
| Landing targets | — | Row click / "Start triage" CTA → `/do/inbox/review?i=N`; Next page's onboarding CTA → `/do/inbox/review`. |

Inbox page anatomy: header ("Universal inbox" / "Inbox" / subcopy) over a bounded surface; loading skeleton; empty state **"Inbox clear"** ("Nothing is waiting for a decision…" + `⌘K` hint + "Capture a thought" CTA → `/do?capture=1`); queue header ("Waiting for a decision", `N captured thought(s) · newest first`, "Start triage" → `/do/inbox/review`). Row: optional square media cover (96px, 72px narrow; first image + `+N` badge; click → lightbox), title (structured share `title` else raw `text`), distinct `content` body only when normalized-different from title, meta chips (`captured X ago`, source hostname chip, date/snooze/project/priority/size/tag chips), trailing arrow. Whole row navigates to triage via a **stretched-link overlay** (`.aa-inbox__row-link`, absolute over the row) so URL anchors (Linkify) and the media button stay clickable siblings — never nested anchors.

## 2. Operations (Wasp → oRPC endpoints)

Ops in `webapp/src/inbox/operations.ts`; pure cores in `inbox/operationsCore.ts` (no `wasp/server` import — port these directly). Wasp op ids: `get-inbox-items`, `get-inbox-item`, `create-inbox-item`, `triage-inbox-item`, `restore-archived-item`, `update-inbox-item`, `get-projects-for-resolver` (S2 covers the capture-side two).

| Op | Kind | Input | Output | Core |
|---|---|---|---|---|
| `getInboxItems` | query | none | `InboxItem[]` — user's rows, `status: "UNPROCESSED"`, `orderBy createdAt desc`, select incl. `attachments {id, filename, mimeType}` + every `parsed*` field | `getInboxItemsCore` |
| `getInboxItem` | query | `{ id: string }` | full row or `null` (unknown id / other user's item / deleted) — used by the share confirmation page | inline |
| `triageInboxItem` | action | `{ inboxItemId: string; decision: TriageDecision; lensId?: string; goalId?: string; projectId?: string; name?: string; priority?: "LOW"\|"NORMAL"\|"IMPORTANT"; size?: "S"\|"M"\|"L"\|"XL"; content?: string }` | `{ kind: "task"\|"project"\|"list-item"\|"archive"\|"delete"; id: string }` (resource currently reuses `kind: "project"`) | `triageInboxItemCore` |
| `updateInboxItem` | action | `{ inboxItemId: string; text: string }` | `{ id }`; trims; blank text throws `"Text cannot be empty."`; **UNPROCESSED-only WHERE** (updateMany) so a late debounce flush after dispatch no-ops instead of racing the delete | inline |
| `restoreArchivedItem` | action | `{ inboxItemId: string }` | `{ id }`; throws `"Inbox item not found."` for missing/other-user's; sets `status: "UNPROCESSED", archivedAt: null` | inline |
| `getProjectsForResolver` | query | none | cross-lens project tuples, recent-active-first (see S2) — triage uses it for list-item destinations + project-bridged lens inference | inline |

Also used by TriagePage (defined elsewhere): `getAppData` (lens list), `getProjects` (scoped `{lensId}`), `getGoals` (scoped `{lensId}`). Supporting endpoint: `GET /api/attachments/:id` (image serving, session-cookie auth) and `GET /api/cli/attachment/:id` (PAT twin). CLI mirror: `GET /api/cli/inbox/list`, `POST /api/cli/inbox/triage` (`patRoutes.ts` — validates decision enum, `lensId` required unless decision ∈ {archive, delete, list-item}, `projectId` required for list-item; entitlement violations → 402).

### `triageInboxItemCore` — the orchestrator (the port's contract)

`TriageDecision = "task-today" | "upcoming" | "someday" | "project" | "resource" | "list-item" | "archive" | "delete"`.

1. Load item + attachment **metadata only** (blobs fetched lazily per moving branch — never pull up to 20 MB on every click). Not found or other user's → `"Inbox item not found."` (wrapper maps plain Errors to 400; unknown → 404 at CLI).
2. **Filing-lens resolution + entitlements** (injected callbacks keep the core pure): every decision except `archive`/`delete` files somewhere. `list-item` requires `projectId` that is the user's SIMPLE_LIST project (`"List items require a Simple-list Project."` / `"Project not found."`), filing lens = that project's lens. Others require `lensId` (`"Lens not found."`) owned by the user. Then `assertLens(filingLensId)` runs — **FREE users may only file into Me (PERSONAL kind)**; violation → `HttpError(402, "<feature> is a Pro feature.", {feature, reason})`. Archive + delete skip the guard (they discard, not file).
3. **Precedence: explicit triage choice > capture-parser guess > default.** `priority ?? item.parsedPriority ?? "NORMAL"`, `size ?? item.parsedSize ?? "M"`, `title = name?.trim() || item.title || item.text`, `itemNotes = [item.content, item.sourceUrl].filter(Boolean).join("\n\n") || null`.
4. Branches:
   - **task-today / upcoming / someday** → `Task` with `status` TODAY/UPCOMING/SOMEDAY. Tags: `parsedTags` upserted per-user (prefix `@`/`#` stripped, lowercased, `Tag.color = "teal"`, unique `userId_name`) and **connected inline in the single create**; empty parsedTags → no tags key at all. Project: explicit `projectId` (must be in the chosen lens, `"Project not found."`; SIMPLE_LIST → `"A task cannot be filed into a Simple-list Project."`) else the lens's project named `"General"` (may be null). Permalink via `uniquePermalink(taskPermalinkSource(title, projectPermalink))`. **scheduledDate/snoozedUntil are nulled when decision is task-today** (Today ignores them); otherwise carried from `parsedScheduledDate`/`parsedSnoozedUntil`. `content = content?.trim() || itemNotes` (blank → null). Attachments (with blobs) nested-create `TaskAttachment` rows in the same atomic write.
   - **project** → new `Project` named `title` in the lens, optional `goalId`. **Entitlement cap first**: count of lens's non-done projects handed to `assertProjectCap` — FREE cap 3 → 402 `{feature: "a 4th project", reason: "organize more than 3 projects with Pro"}`. Unique permalink from name. Attachments carry onto `ProjectAttachment`.
   - **resource** → `projectId` REQUIRED (`"Resources must be filed under a project."`); must be user's, non-SIMPLE_LIST (`"A resource cannot be filed into a Simple-list Project."`). Creates `Resource {title, url: item.sourceUrl, notes: resolvedContent ?? item.content, projectId}` + `ResourceAttachment` images.
   - **list-item** → `createListItemCore(simpleLists/operationsCore)` with `{text: title, content: resolvedContent ?? item.content, sourceUrl, preparedAttachments}` → `ListItem` + `ListItemAttachment`.
   - **archive** → `InboxItem.update {status: "ARCHIVED", archivedAt: new Date()}` — **kept**, recoverable from Logbook; creates nothing.
   - **delete** → `InboxItem.delete` — hard-removes, **not recoverable** (capture mistakes).
5. Create-type decisions then **delete the seed InboxItem** (the transformed entity IS the record; cascade removes the original InboxAttachments only after the copies exist).
6. Wrapper side effects: onboarding `TRIAGE → COMPLETE` (conditional updateMany); analytics `TRIAGE_COMPLETED` (route `/do/inbox/review`); plain `Error` rethrown as 400 (message surfaces in the UI).

## 3. The triage wizard (impl structure)

Per-item **wizard, not one-key dispatch** (the old single-card keymap `1/2/3/P/R/Del` is gone). Steps: **Classify → Spec → Ready**. Working draft (`triageFlow.ts :: Working`): `{ type, title, when: "Today"|"Upcoming"|"Someday", size, priority, content, projectId, projectGoalId, due: "—"|"This week"|"Next week"|"Next month", parentProjectId, kind: "Link"|"Note" }`.

Type order (visual + keymap order — `TRIAGE_TYPES`): **Task** ("an action — something to do") · **List item** ("a flat item to check off") · **Resource** ("a link or reference — not an action") · **Project** ("an outcome needing more than one step") · **Delete** ("get rid of it — not kept").

**Archive is NOT in the current type chooser.** The `"archive"` decision value remains fully server-supported (`triageInboxItem` marks the item ARCHIVED; `restoreArchivedItem` + the Logbook's Restore undo it), but the wizard UI no longer exposes an Archive row (removed in commit `001ae76`; the label "Note" was also renamed "Resource" in `bdb948b`, and List item was inserted second with renumbered keys in `372fa58`). Consequence: `webapp/e2e/triage.spec.ts` tests 3 ("Note") and 4 ("Archive") encode the **July-14 UI** and are stale against the current chooser — port the *behaviors* they assert (resource parent gating, archive losslessness), not their selectors.

### Classify (step 1)
- **Lens inference** (pre-fill, never silent file): `[[lens]]` token (`parsedLensId` → by id, else `parsedLens` matched on lens name) OR **project-bridged** (explicit `parsedProjectId` pick, or resolver over `getProjectsForResolver`). `[[ ]]` beats project inference. Labels: `"selected project <name>"` / `"selected <lens>"` / `"from [[token]] in your capture"` / `"from project <name>"` (aria-live hint).
- **Project destination**: when a concrete project resolved, Classify shows a `Destination: <Project> · <Lens>` banner and **hides the standalone lens pills** (changeable later from Spec). A **SIMPLE_LIST** destination auto-switches the flow to the one-step list-item path (`isListDestination`), preselecting that list.
- Otherwise: lens renders as **large styled pills** (radiogroup, one per lens; active pill fills with the lens identity color). Fallback pills `Work`/`Me` render before `getAppData` resolves.
- When the item carries a parsed/resolved STRUCTURED project, the **Project type row is filtered out** (a matched project means "task in that project", never "new project by the same name").
- Continue button gate: `!chosenLensId || !title.trim()` generally; delete needs title; list-item needs `listProjectId` + title. Button label: `"Continue"` / `"Delete"` / `"Add to <list>"`.
- List-item path: compact confirmation — `<select>` "Add to list" of all SIMPLE_LIST projects **across lenses** (options labeled `Name · LensName`; placeholder "Choose a list…"; hint "No lists yet — create one from the Projects page." when none). Note when attachments exist: "Its image attachments will move with it to <list>." Spec + Ready are skipped (Enter/Continue dispatches directly).

### Spec (step 2)
- Property rows are the shared **PropertyChips** chip editor (same component as the task page) + PickerSheet bottom sheets for Project/Goal/Resource-parent. Task fields: **When · Size · Priority · Project** ("General" shown when unset) + a **Context** textarea (→ `Task.content`, placeholder "Add details, links, or next steps."). Project fields: **Goal** (external picker; empty message "No goals yet — make one on the Goals page.") · **Due** (chip options This week/Next week/Next month — display only in the v1 core, not persisted). Resource fields: **Project** (required parent, "Pick project…") · **Kind** (Link/Note).
- Confirm summary in plain English: task → `→ {When} · {Size} · {Priority} · in {ProjectName}`; project → `→ new Project[ · supports {Goal}]`; list-item → `→ add to simple list`; resource → `→ {Kind} filed under {Parent|—}`. Buttons: **Back** (to Classify) + **Ready** (gated by `canComplete`).
- `canComplete` (`triageFlow.ts`): nonblank title always required; list-item needs `listProjectId`; non-list types need `chosenLensId`; resource additionally needs `parentProjectId`. (Goal is never required; Task never links to a Goal — projects support goals, tasks don't; triage never creates a Goal.)
- **Title editing**: the card body is a reading surface (URLs linkified) until clicked / pencil ("Edit captured text"); editing updates `working.title` immediately AND writes back to the stored InboxItem on a **~600 ms debounce** (`updateInboxItem`, flushed on item-advance + unmount; never blanks the stored item). Spec's "Title" edits are local-only (renaming the future entity ≠ editing the capture). While the title editor is focused, ALL triage shortcuts are suppressed and Enter is text input (resume on blur).
- **Defaults, never auto-Today** (locked): When **Upcoming** (the bench) — the ONE exception: a capture `today`/`tonight` token (parsedScheduledDate is today) pre-fills When=Today, because it's user intent. Size **M**, Priority **Normal**, Project **General** (lens-scoped; a `#project` hint links only if a project by that name exists in the lens — no auto-create), Lens = active lens unless inferred. Parser tokens pre-fill; defaults fill only the gaps.

### Ready / dispatch
- Calls `triageInboxItem` via `buildDispatchPayload` (task: `projectId = manual pick ?? resolvedProjectId`, priority, size, content; project: goalId; resource: parentProjectId; list-item: listProjectId; delete: base only).
- **Exit animation encodes the decision** (`OUTCOME_EXIT`): task-today/upcoming/list-item → **right**; someday/resource → **left**; project → **up**; delete → **down**. Exit fires immediately (optimistic); server resolves async. Error path: network-ish messages → calm copy `"Couldn't reach the server — it may be restarting. Try again in a moment."`; others show the server message; `dispatched`/exit reset.
- After success: invalidate `getInboxItems`, `getProjects`, `getAppData`, `auth/me`; then **await refetch** of `getTasks` (or `getSimpleList` for list-items) so navigating to Today/Upcoming never shows a stale cache. Advance index after 320 ms animation settle.
- Queue mechanics: walkthrough navigates a **FIXED snapshot** of the inbox taken on first arrival (not the live refetching query) so invalidation can't shift indices/skip items. Progress bar "N of M". Done → **"Inbox zero."** / "Nothing left to decide. Go do something." with `Done →` (/do) and `Back to inbox` buttons.

## 4. Triage keymap (canonical: TRIAGE.md §7; impl: `useTriageKeyboard.ts`)

Step-aware; window-level keydown; no-op when complete or no item; **suppressed while a chip popover or picker sheet is open** (only Escape works then), while the title editor is focused, and for any `meta/ctrl/alt` chord.

### Classify (step = classify)
| Key | Action | Impl notes |
|---|---|---|
| `1` | Type = Task | Number keys mirror `TRIAGE_TYPES` visual order |
| `2` | Type = List item | opens the list `<select>` flow |
| `3` | Type = Resource | |
| `4` | Type = Project | blocked when a project destination is resolved |
| `5` | Type = Delete | Continue relabels "Delete" |
| `A` / `S` / `D` / `F` | Lens index 0 / 1 / 2 / 3 | legacy positional slots; doc'd as retired (pills are click-only) but still wired in `useTriageKeyboard` (`lensIndexByKey`); no-op when a project destination resolved |
| `Enter` | Continue to Spec; **dispatch immediately** when type is Delete (always) or List item (only when `canComplete`) | preventDefault |
| `Esc` | Leave triage → `/do/inbox` | |
| `/` | *(doc'd: full Lens picker at ≥4 lenses — not in impl)* | |

### Spec (step = spec; task type only for property keys)
| Key | Action | Cycles |
|---|---|---|
| `[` | size down | XL→L→M→S (`SIZE_ORDER`, wraps) |
| `]` | size up | S→M→L→XL |
| `-` | priority down | IMPORTANT→NORMAL→LOW |
| `=` / `+` | priority up | LOW→NORMAL→IMPORTANT |
| `H` / `h` | When cycle up | Today→Upcoming→Someday (wraps) |
| `Enter` | Ready (dispatch) when `canComplete` | |
| `Esc` | Back to Classify | |
| `←` / `→` | *(doc'd: prev/next inbox item — not in impl)* | |

Also doc'd but **unbuilt** (TRIAGE.md §8): `G` (assign Goal), `Q` (done triaging), `I` (enter triage from Normal mode), mode indicator `— TRIAGE —`, 4s undo toast.

### Global context that reaches triage
`useKeyboardShortcuts` (typing-guarded): `Shift+I` → `/do/inbox` (inbox), `Shift+G` → triage (`/do/inbox/review`), `Space` → home, `⌘K` → capture (works even inside triage). Esc ordering handled by the page (classify→inbox / spec→classify) before the shell's overlay Esc.

### Co-author UI behaviors to port (TRIAGE.md §4, code-verified)
- Spec rows are **inline-expanding** (tap a row → options expand beneath; no floating popover) EXCEPT Project/Goal/Parent which open **PickerSheet bottom sheets** (long lists, numbered rows). Value tinting: teal = When/Today, amber = Important/XL, violet = Project/Goal, gray = default.
- Chips: parsed-token chips render on the card (date `📅 <relative>`, "Snoozed", `[[lens]]`, `▣ project`, `★ Important` / `low`, size, tags) so the token-stripped stored text keeps its context visible. Hidden on the list-item path.
- Media: triage card shows the first image large (`clamp(144px, 26vh, 224px)`, `object-fit: contain`), multi-image as scroll-snap carousel with chevrons + dots; click → lightbox (~70% modal, Esc/backdrop dismiss, ←/→ cycling).
- TriageCard meta line: `captured <formatAgo>`.

## 5. Behaviors — statuses, attachments, conversion rules

- **`InboxItemStatus` enum: `UNPROCESSED | `ARCHIVED`.** The inbox list queries UNPROCESSED only. Triage deletes the row on every create-type decision; archive flips status + sets `archivedAt` (Logbook sorts on it); delete hard-removes. Nothing else mutates status except `restoreArchivedItem` (ARCHIVED → UNPROCESSED, archivedAt null).
- **Outcomes table** (TRIAGE.md §3): quick action → Task (standalone, dated); big outcome → Project (text becomes the name); step in existing work → Task in a Project; reference → Resource under a Project; supports a bigger goal → Project linked to a Goal; flat checklist → List Item in a Simple-list Project; captured by mistake → Delete (hard, unrecoverable); decline for now → Archive (lossless).
- **Attachments survive every dispatch decision** — task (`TaskAttachment`), project (`ProjectAttachment`), resource (`ResourceAttachment`), list-item (`ListItemAttachment`), all created atomically with the entity; the seed delete then cascades only the originals. Archive/delete drop nothing/keep nothing respectively (archive keeps them on the archived item).
- **Simple-list triage is one step**: no When/Size/Priority/Project/Goal/Resource rows; body text, source URL, and images move automatically. The destination select spans lenses. Enter commits with the same gate as the button.
- Promotion paths (product spec): Task→Project (XL nudge), Resource→Task, Task→Resource, Task→Someday — handled by re-running triage decisions, not special ops.
- Bare URLs in captured text render as real links everywhere the text shows (`Linkify.tsx`): `http(s)://` and `www.` tokens, `target="_blank" rel="noopener noreferrer"`, bare `www.` gets `https://`, trailing sentence punctuation stays text, only URL-constructor-valid matches linkify; query-heavy URLs display pre-`?` but href keeps the full URL.
- Inbox row display title: `title?.trim() || text`; body `content` shown only when normalized-different (legacy shares stored composed text in both).
- Source chip: `new URL(sourceUrl).hostname` minus `www.`; fallback `"Link attached"`.

## 6. Caps, entitlement gates, edge cases, invariants

- **FREE filing guard** (`assertLensAllowed`, 402): triage may not file into WORK/CUSTOM lenses on FREE — checked on `kind` (rename-safe), message `{feature: "the Work lens"…, reason}` from `WORK_LENS_MESSAGE`/`CUSTOM_LENSES_MESSAGE`. Archive/delete exempt (no filing). `getProjectsForResolver` still surfaces those projects (visible ≠ writable).
- **Project cap** (`assertUnderCap`, 402): FREE = 3 non-done projects per lens; triage's `project` decision checks before create: `{feature: "a 4th project", reason: "organize more than 3 projects with Pro"}`.
- Invariants: **never auto-Today** (default Upcoming; only an explicit today/tonight capture token pre-fills Today) — e2e-pinned. **Never auto-create a project from a hint** (typo → General). **Tasks never link to goals**; triage never creates goals. **Resources always need a project parent** (Ready gated). **Transformed entity IS the record** (seed deleted). Triage is desktop-surfaced only (mobile = capture-first; not a port blocker for web).
- Error surfaces: entitlement 402s show the feature/reason message in the triage error bar; plain business errors → 400 with message (`"Inbox item not found."`, `"List items require a Simple-list Project."`, `"A task cannot be filed into a Simple-list Project."`, `"Resources must be filed under a project."`, `"Lens not found."`, `"Project not found."`, `"Unknown triage decision: …"`).
- Concurrency: the UNPROCESSED-only `updateInboxItem` + fixed queue snapshot + awaited refetch after dispatch are deliberate race guards — port them.

## 7. Tests (what the specs assert)

`webapp/e2e/triage.spec.ts` (4 tests):
1. `"a #project capture token preselects the project link (type stays Task)"` — create project "Briefs" (Me lens), capture `Draft the brief #briefs` (Enter accepts autocomplete, Enter submits), triage keeps Task type, Ready files it under Briefs (visible on `/do/projects` → project detail) with no manual selection; item leaves triage.
2. `"becoming a Project uses the item text as the name"` — triage → Project type → text "Relaunch the podcast" appears on `/do/projects`; inbox shows "Inbox clear".
3. `"becoming a Resource (Note) requires a parent before Complete"` — Note type → Ready disabled until the parent chip opens the "File under…" sheet and "General" is picked → enabled → dispatch removes the item.
4. `"Archive keeps the note — it leaves the inbox but surfaces in the Logbook"` — archive → absent from Today/Someday/inbox ("Inbox clear"), present on `/do/logbook`, Restore returns it to the inbox.

`webapp/e2e/triage-dispatch.spec.ts` (2 tests, keyboard-first, nothing mocked):
1. `"...files into a Simple list and actually lands there"` — create list "Groceries", capture "Buy oat milk", `/do/inbox/review`, press `2` (List item), pick option in the "Add to list" combobox (label `Groceries · Me`), Enter commits → "Inbox zero." → checkbox "Check Buy oat milk" exists at `/do/projects/groceries`.
2. `"...becomes a Task on the Upcoming bench"` — capture "Email Sarah about the invoice", press `1` (Task) then Enter → Spec step ("2 · Specify"), Ready → "Inbox zero." → task visible on `/do/upcoming` (pins default-Upcoming, never Today).

`webapp/e2e/helpers.ts` contracts used above: `openCapture` (⌘K with FAB fallback; textarea = `textbox[name="Capture"]`), `commitTriage` (waits for `/operations/triage-inbox-item` response OK **and** item removal — the exit animation fires before the server resolves), `triageOneItem` (full wizard walk; When chip `.aa-prop-chip--when`; commit button `/^ready$|^complete$/i`), `createListProject`.

Unit suites to port: `operations.test.ts` (triage orchestrator: guards/auth/tenancy; task defaults NORMAL/M; tag resolve-or-create with legacy `@`/`#` prefixes stripped, no tags key when none; General fallback vs explicit projectId; no task→goal alignment; content trim/null; edited title drives description+permalink; attachment moves per branch incl. no-blob-fetch when none; project/resource/archive/delete branches; list-item preserve-context; decision/type mismatches rejected; updateInboxItem UNPROCESSED-only + blank reject; getInboxItems scoping; getInboxItem ownership; getProjectsForResolver recent-first + FREE visibility), `triageFlow.test.ts` (payload building, canComplete gating incl. list-item/list requirements, summary strings), `projectResolver.test.ts` (see S2), `TriagePage.test.tsx` / `InboxPage.test.tsx` (component behavior).
