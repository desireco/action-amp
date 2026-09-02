# S18 — CLI `/api/cli/*` routes (P0 parity notes — conformance spec)

> Pre-study header for the platform-switch port. Sources read: `webapp/src/auth/patRoutes.ts`
> (in full), `webapp/src/auth/patMiddleware.ts`, `webapp/src/auth/pat.ts`,
> `webapp/src/auth/cliMint.ts`, `webapp/main.wasp.ts` (every `api()` registration),
> the pure cores reached by the routes (`tasks|inbox|projects|goals|lenses|logbook|reviews|
> resources|simpleLists|feedback|admin/analytics/operationsCore.ts`),
> `webapp/src/attachments/serveAttachment.ts`, and both unchanged clients:
> `cli/src/` (api.ts, config.ts, output.ts, types.ts, commands/*) and
> `admin-cli/src/` (api.ts, types.ts, commands/*). **The bar: `cli/` and `admin-cli/`
> run unmodified against the new API and their `--json` output matches Wasp's 100%.**
> This file is the conformance checklist the port is verified against.

## 0. Auth + transport contract (applies to every `/api/cli/*` route)

- **Registration invariant (main.wasp.ts):** every `/api/cli/*` route is
  `auth: false` + `middlewareConfigFn: patRouteMiddleware` + `entities: []`.
  `patRouteMiddleware` DELETES `sessionCookieAuth`/`sessionCookieWrite` (a browser
  session must never satisfy a CLI route) and injects `patAuth`. OPTIONS → 204.
- **Token format:** `aa_<base64url(32 random bytes)>` (~43 chars, 256-bit). Only the
  SHA-256 **hex** hash is stored (`ApiKey.hashedToken`, unique); lookup is
  `apiKey.findUnique({ where: { hashedToken } })` joining User → Auth → first
  `providerName:"email"` identity (for the email). Full-scope, non-expiring;
  revocation = row delete.
- **Middleware error bodies (exact):**
  - missing/malformed Bearer → 401 `{ error: "Missing or malformed bearer token." }`
  - wrong OR revoked token → 401 `{ error: "Invalid or revoked token." }` (identical on purpose)
  - lookup failure → 500 `{ error: "Token lookup failed." }`
  - FREE-plan token (CLI access is Pro) → 402 `{ error: "CLI and API access is a Pro
    feature.", feature: "CLI and API access", reason: "use ActionAmp from the terminal
    or with an agent" }` — checked on EVERY request, so a token dies the moment a plan ends.
- On success `req.patUser` = `{ id, plan, planRenewsAt, isAdmin, manualAccessGrant,
  email, fullName }`; `ApiKey.lastUsedAt` stamped fire-and-forget.
- **Client transport (both CLIs, fixed):** `Authorization: Bearer <token>`;
  `Content-Type: application/json` when a body is sent; responses parsed as JSON
  (`res.json().catch(() => ({}))`). Success < 400. The user CLI maps 402 bodies to
  `ApiError(402, { error: "<feature> is a Pro feature." })` (from `body.feature`) or
  `"Pro feature required (402)."` when no feature field; 401 → `"Token rejected (401).
  Run: actionamp login"`; other ≥400 → the server's `{ error }`. `--json` output =
  `JSON.stringify(<parsed body>)` + `\n` (key order = the server's JSON key order);
  errors print `{ error: "<message>" }` to **stdout** with exit code 1.
- **Shared response conventions:** defensive 401 `{ error: "Not authenticated." }`
  when `req.patUser` is absent; lens-gated routes 404 `{ error: "No such lens for
  this account." }` (not-owned indistinguishable from missing) and 402 via
  `sendViolation`: `{ error: "<feature> is a Pro feature.", feature, reason }`;
  unexpected failures → 500 `{ error: "Could not <verb> <noun>." }` per-route (exact
  strings in the table); boundary validation → 400 `{ error: "<message>" }`.
  `queryString()`/`bodyString()` treat non-string JSON values as absent.

## 1. Route tables

### 1.1 Token management (session-authed, NOT PAT) — `auth: true`, Wasp `context.user`

| Route | Method | Input | Success | Errors |
|---|---|---|---|---|
| `/api/pat/issue` | POST | body `{ label }` (trimmed, sliced to 80) | 201 `{ token, id, label, createdAt, notice: "This token won't be shown again. Copy it now." }` | 401 `{ error: "Not authenticated." }`; 402 CLI-access violation; 400 `{ error: "A label is required." }` |
| `/api/pat/revoke` | POST | body `{ id }` | 200 `{ revoked: true, id }` | 401; 400 `{ error: "An id is required." }`; 404 `{ error: "No such token for this account." }` (tenancy-checked first) |
| `/api/pat/list` | GET | — | 200 `{ keys: [{ id, label, createdAt, lastUsedAt }] }` ordered `createdAt desc` (never the hash) | 401 |

`mintCliToken` (Wasp **action**, used by the OAuth `/cli/login` page because actions
get CORS+credentials while `api()` routes don't handle OPTIONS): args `{ label }`
(default `"CLI"`), returns `{ token, label }`; 402 via `assertCliAccess`. The CLI login
flow: one-shot localhost HTTP server + `state` nonce → browser
`{webUrl}/cli/login?callback=http://localhost:<port>/callback&state=<nonce>` →
`mintCliToken` → redirect with `?token=&state=` → CLI validates state, verifies via
`GET /api/cli/whoami` (admin-cli additionally rejects `!isAdmin` and discards the
token). Configs: `~/.config/actionamp/config.json` (`{ token, apiUrl, lensId? }`,
mode 0600) and `~/.config/actionamp-admin/config.json` (separate). Origins:
prod `https://api.actionamp.com` + `https://app.actionamp.com`; dev
`http://localhost:3001` + `http://localhost:4000`; overridable via
`ACTIONAMP_API_URL` / `ACTIONAMP_WEB_URL`.

### 1.2 Identity + focus

| Route | Method | Input | Success (200) | Errors |
|---|---|---|---|---|
| `/api/cli/whoami` | GET | — | `{ user: { id, email, fullName, plan, isAdmin } }` (isAdmin surfaced for the admin-cli login gate) | 401 |
| `/api/cli/now` | GET | `?lensId=` optional | `{ task: Task|null, context: NowContext|null, reason?: "no-lens"\|"no-candidates" }`. Explicit lens → tenancy+FREE gate; no lensId → server picks the FIRST accessible lens. No accessible lens → 200 `{ task: null, context: null, reason: "no-lens" }`. Pool+ranking = `getTopTaskData` (snooze guard included); winner hydrated then `context` built server-side; vanished row → `no-candidates`. | 404 lens; 402 lens violation; 500 `{ error: "Could not resolve top task." }` |

`NowContext` = `{ project: {id,name,permalink?}|null, goal: {id,name,permalink?,description}|null, whyNow: string|null, whyItMatters: string|null }`. The CLI prefers `--lens-id`, else its config `lensId`, else sends nothing.

### 1.3 Capture + inbox

| Route | Method | Input | Success | Errors |
|---|---|---|---|---|
| `/api/cli/capture` | POST | body `{ text (required), title?, content?, sourceUrl?, projectName?, projectId?, listId?, attachments?: [{ filename, mimeType, dataBase64 }] }` | 201 `{ ok: true, kind: "inbox-item", id, text, createdAt }` (spread of `createInboxItemCore` select `{ id, text, createdAt }`); with `listId` → 201 `{ ok: true, kind: "list-item", …createListItemCore }` | 400 `{ error: "Capture text is required." }` / `"Choose either projectId or listId, not both."` / `"Attachments must include filename, mimeType, and dataBase64."`; listId → 404 `"No such list for this account."`, 400 `"listId must identify a Simple list."`, 402 lens gate (on the list project's lens); projectId → core 400 `"Project not found."`; any core Error → 400 with its message |
| `/api/cli/inbox/list` | GET | — | `{ items: InboxItem[] }` (UNPROCESSED, `createdAt desc`) | 401; 500 `{ error: "Could not load inbox." }` |
| `/api/cli/inbox/triage` | POST | body `{ inboxItemId, decision, lensId?, projectId?, goalId?, name?, priority?, size?, content? }`; `decision` ∈ `task-today, upcoming, someday, project, resource, list-item, archive, delete` | 200 `{ result: { kind, id } }` where kind ∈ `task, project, list-item, archive, delete` (resource triage currently reports `kind: "project"`, id = resource id) | 400 `"inboxItemId and decision are required."` / `"decision must be one of: task-today, upcoming, someday, project, resource, list-item, archive, delete."` / `'lensId is required for the "<decision>" decision.'` / `'projectId (a Simple list) is required for the "list-item" decision.'` / priority `"priority must be LOW, NORMAL, or IMPORTANT."` / size `"size must be S, M, L, or XL."`; 402 lens violation (WORK_LENS_MESSAGE) or project cap (`{ feature: "a 4th project", reason: "organize more than 3 projects with Pro" }`); 404 `"No such lens for this account."` / `"Inbox item not found."` / `"Project not found."`; 500 `{ error: "Could not triage inbox item." }` |
| `/api/cli/attachment/:id` | GET | path `:id` (uuid, validated by `isAttachmentId`) | 200 binary image with headers `Content-Type: <mimeType>`, `Content-Length`, `Cache-Control: private, max-age=31536000, immutable`, `Cross-Origin-Resource-Policy: cross-origin`, `Content-Disposition: inline; filename="<ascii>"; filename*=UTF-8''<encoded>` (CLI names files from this header; non-image mime → 404) | 404 `{ error: "Not found." }` (bad id, not owned, or non-image); 500 `{ error: "Could not load the image." }` |

InboxItem shape (from `getInboxItemsCore`): `{ id, text, title, content, sourceUrl, parsedScheduledDate, parsedSnoozedUntil, parsedPriority, parsedSize, parsedTags, parsedProject, parsedLens, createdAt, attachments: [{ id, filename, mimeType }] }`. `inbox download <id> [outPath]` and `attachment download` print `{ ok: true, path, bytes, mimeType, filename }` in --json (CLI-constructed, not a server body).

### 1.4 Tasks

| Route | Method | Input | Success (200) | Errors |
|---|---|---|---|---|
| `/api/cli/task/show` | GET | `?id=` (id OR permalink) | `{ task: Task }` (full detail: tags, updates, project `{id,permalink,name}`, goal `{id,permalink,name}`, attachments) | 400 `"An id is required."`; 404 `{ error: "Task not found." }`; 500 `"Could not load task."` — **no lens guard** (detail reads unguarded) |
| `/api/cli/task/start` | POST | `{ id }` | `{ id, startedAt }` (clears other tasks' startedAt + closes open sessions; opens a TaskSession with `plannedMinutes` 25 or 45 from `User.focusSessionMinutes`) | 400 `"An id is required."`; 404 `"Task not found."`; 500 `{ error: "Could not start task." }` |
| `/api/cli/task/pause` | POST | `{ id }` | `{ id, startedAt: null }` | 400; 404; 500 `"Could not pause task."` |
| `/api/cli/task/done` | POST | `{ id, outcome? }` | `{ task }` (toggles completion) | 400 `"An id is required."`; 404; 500 `"Could not toggle task."` |
| `/api/cli/task/snooze` | POST | `{ id, preset }`, preset ∈ `1h, 3h, tomorrow, weekend, someday` | `{ id, status, scheduledDate, snoozedUntil }` (uses `User.timeZone ?? "UTC"`) | 400 `"An id is required."` / `"Invalid snooze preset."`; 404; 500 `"Could not snooze task."` |
| `/api/cli/task/move` | POST | `{ id, status, scheduledDate? }`, status ∈ `TODAY, UPCOMING, SOMEDAY`, date `YYYY-MM-DD` | `{ task }` | 400 `"An id is required."` / `"Invalid status."` / `"scheduledDate must use YYYY-MM-DD."`; 404; 500 `"Could not move task."` |

Task write errors share `taskWriteError`: core `Error` matching `/not found/i` → 404 with the message; anything else → 500. Task JSON fields (CLI contract): `id, description, permalink, content, outcome, isDone, createdAt, completedAt, startedAt, priority (LOW|NORMAL|IMPORTANT), size (S|M|L|XL), status (SOMEDAY|UPCOMING|TODAY), scheduledDate, snoozedUntil, projectId, goalId, lensId, project {id,name}, goal {id,name}, attachments [{id,filename,mimeType}]`.

### 1.5 Today

| Route | Method | Input | Success (200) | Errors |
|---|---|---|---|---|
| `/api/cli/today` | GET | — | `{ tasks: Task[] }` — status TODAY, not done, **across the accessible-lens set** (`resolveAccessibleLenses`; empty set → `[]`), ordered `order asc, priority desc, createdAt asc`, rows include `lens {id,name,color}` | 500 `{ error: "Could not load today." }` |
| `/api/cli/today/done` | GET | — | `{ tasks: Task[] }` — status TODAY + done + `completedAt >= local midnight` (server TZ default), same lens-set filter, `completedAt desc` | 500 `{ error: "Could not load done-today." }` |

### 1.6 Projects

| Route | Method | Input | Success | Errors |
|---|---|---|---|---|
| `/api/cli/project/list` | GET | `?lensId=` (required) | 200 `{ projects: Project[] }` | 400 `"A lensId is required."`; 404 lens; 402 lens violation; 500 `"Could not load projects."` |
| `/api/cli/project/show` | GET | `?id=` (id or permalink) | 200 `{ project: Project }` (includes resources + `_count`, `openItems`/`checkedItems` for lists) | 400 `"An id is required."`; 404 `{ error: "Project not found." }`; 500 `"Could not load project."` — no lens guard |
| `/api/cli/project/create` | POST | `{ name, lensId, goalId?, description?, type? }`, type ∈ `STANDARD (default), SIMPLE_LIST` | 201 `{ project }` | 400 `"name and lensId are required."` / `"type must be STANDARD or SIMPLE_LIST."`; 404 lens; 402 lens violation + project cap ("a 4th project", counted on `isDone: false`); 500 `"Could not create project."` |
| `/api/cli/project/add-task` | POST | `{ description, lensId, projectId?, goalId? }` | 201 `{ task }` (core resolves the lens: projectId's → goalId's → passed lensId; `assertLens` gates the RESOLVED lens) | 400 `"description and lensId are required."`; 404 lens / `"Project not found."` / `"Goal not found."`; 402 lens violation; 500 `"Could not add task."` |

Project fields: `id, name, permalink, description, isDone, type ("STANDARD"|"SIMPLE_LIST"), goalId, lensId, _count { tasks, listItems? }, taskCount?, openItems?, checkedItems?, resources: Resource[], attachments`. Goal fields: `id, name, permalink, description, isDone, lensId, _count { projects, tasks }`.

### 1.7 Resources (project-owned links/notes)

| Route | Method | Input | Success | Errors |
|---|---|---|---|---|
| `/api/cli/resource/list` | GET | `?projectId=` (required; id or permalink) | 200 `{ projectId, resources: Resource[] }` | 400 `"A projectId is required."`; 404 "not found" message; 500 `"Could not load resources."` |
| `/api/cli/resource/create` | POST | `{ projectId, title, url?, notes? }` | 201 `{ resource }` | 400 `"projectId and title are required."` / `"A Simple list keeps only checklist items."` (SIMPLE_LIST project) / core message; 404 `"Project not found."`; 402 lens gate (owning project's lens) |
| `/api/cli/resource/update` | POST | `{ id, title?, url?, notes? }` (empty string clears) | 200 `{ resource }` | 400 `"An id is required."` / core message; 404; 402 lens gate |
| `/api/cli/resource/delete` | POST | `{ id }` | 200 `{ id }` | 400 `"An id is required."`; 404; 402 lens gate; 500 `"Could not delete resource."` |

Resource fields: `{ id, title, url: string|null, notes: string|null, projectId, createdAt, attachments: [{id,filename,mimeType}] }`.

### 1.8 Goals

| Route | Method | Input | Success | Errors |
|---|---|---|---|---|
| `/api/cli/goal/list` | GET | `?lensId=` (required) | 200 `{ goals: Goal[] }` | 400 `"A lensId is required."`; 404 lens; 402 lens violation; 500 `"Could not load goals."` |
| `/api/cli/goal/show` | GET | `?id=` (id or permalink) | 200 `{ goal: Goal }` | 400 `"An id is required."`; 404 `{ error: "Goal not found." }`; 500 `"Could not load goal."` — no lens guard |
| `/api/cli/goal/create` | POST | `{ name, lensId, description? }` | 201 `{ goal }` | 400 `"name and lensId are required."`; 404 lens; 402 lens violation + goal cap (`{ feature: "a 2nd goal", reason: "link work to more than one outcome with Pro" }`, counted on `isDone: false`); 500 `"Could not create goal."` |

### 1.9 Lenses

| Route | Method | Input | Success | Errors |
|---|---|---|---|---|
| `/api/cli/lens/list` | GET | — | 200 `{ lenses: Lens[] }` — ALL owned lenses with counts; **no entitlement gate** (gating fires on use, not listing) | 500 `{ error: "Could not load lenses." }` |
| `/api/cli/lens/show` | GET | `?idOrName=` (id OR name) | 200 `{ lens: Lens }` | 400 `"An idOrName is required."`; 404 `{ error: "Lens not found." }`; 500 `"Could not load lens."` — no lens guard (FREE may read an owned WORK lens) |

Lens fields: `{ id, name, isDefault, isIncluded, color: string|null, purpose: string|null, createdAt, counts: { goals, projects, tasks, openItems, checkedItems } }` (core also returns `hasAnyContent`/`blockingProjects`; the CLI's type is the printed contract). `lens switch` stores the id client-side — there is NO server-side active lens.

### 1.10 Logbook + review

| Route | Method | Input | Success (200) | Errors |
|---|---|---|---|---|
| `/api/cli/logbook` | GET | `?lensId=` optional | `{ tasks, wontDo, projects, goals, archived }` (LogbookItem[] each; see S8 notes). Explicit lens → gate; omitted → FIRST accessible lens; none → 200 `{ tasks: [], projects: [], goals: [], archived: [] }` (**no `wontDo` key on this empty path**) | 404 lens; 402; 500 `{ error: "Could not load logbook." }` |
| `/api/cli/review` | GET | `?cadence=WEEKLY|MONTHLY` (required, case-insensitive), `?timeZone=` (IANA, default UTC), `?for=YYYY-MM-DD` xor `?previous=true`, `?lensId=` optional (never defaults) | `{ report: ReviewReport }` (shape in `cli/src/types.ts`: cadence, state `in_progress|finished`, period {start,end,startDate,endDate,label,inProgress}, lensId, totals {actions,projects,goals,focusMinutes}, actionsByLens, highlights, tasks, projects, goals, weeklySlices, checkIn, reflection, emphasisGoal) | 400 `"Cadence must be WEEKLY or MONTHLY."` / `"Use either for or previous, not both."` / date or TZ validation messages (matched by `/Review date/` or `/Time zone/`); 404 lens; 402 lens violation; 500 `"Could not load review report."` |

### 1.11 Admin-gated (see S17 for shapes)

`requireAdmin`: 401 `{ error: "Not authenticated." }` / 403 `{ error: "Admin only." }` FIRST.

| Route | Method | Input | Success (200) | Errors |
|---|---|---|---|---|
| `/api/cli/feedback/list` | GET | `?status=`, `?limit=<n\|all>` | `{ feedback: FeedbackRow[] }` | 400 status / limit messages; 500 `"Could not list feedback."` |
| `/api/cli/feedback/show` | GET | `?id=` (shortId or UUID prefix, case-insensitive) | `{ feedback: FeedbackRow }` | 400 `"id is required."`; 404 `"Feedback not found."`; 500 |
| `/api/cli/feedback/status` | POST | `{ id, status }` | `{ feedback }` | 400 id/status; 404; 500 `"Could not update feedback status."` |
| `/api/cli/feedback/delete` | POST | `{ id }` | `{ feedback }` (soft delete) | 400; 404; 500 `"Could not delete feedback."` |
| `/api/cli/admin/stats` | GET | `?range=` | `{ stats: AdminStats }` | 500 `{ error: "Could not load admin stats." }` |
| `/api/cli/admin/growth` | GET | `?range=` | `FunnelStats` top-level | 500 `{ error: "Could not load growth funnel." }` |
| `/api/cli/admin/feedback` | GET | `?after=`, `?limit=` (default 10, clamp 1–50) | `{ items, hasNext }` top-level | 500 `{ error: "Could not load recent feedback." }` |

## 2. CLI command → route map (what each command calls + renders)

**User CLI (`cli/src/commands/`, config fallback `lensId` applies to every `--lens-id` flag):**
`now` → GET /api/cli/now (`?lensId`); `today [--done]` → /api/cli/today or /today/done;
`capture <text...> [--title --content --source-url --project-id --list-id --file×4]` →
POST /api/cli/capture (client validates ≤4 images, ≤5 MB each, mime by extension
jpg/jpeg/png/gif/webp/heic/heif, base64-encodes); `task show|start|pause|done [--outcome]|
snooze [--preset] | move --to today|upcoming|someday` → §1.4 routes; `inbox list|triage
--decision [--lens-id --project-id]|download`; `attachment download <id> [outPath]`;
`project list|show|create [--list]|add-task`; `resource list --project|add --project|
update|delete`; `goal list|show|create`; `lens list|show <idOrName>|switch <idOrName>
(writes config, prints CLI-built `{ ok, id, name }` in --json)|current`; `logbook
[--lens-id]`; `review week|month [--for --previous --lens-id --time-zone]`; `whoami`;
`login [--dev]`; `logout`; `llm` (fully offline — prints agent instructions; --json →
`{ instructions: <string> }`).

**Admin CLI (`admin-cli/src/commands/`):** `login [--dev]` (rejects non-admins via
whoami), `whoami` (fails loudly if `!isAdmin`), `feedback list [--status --limit n|all]`
(client defaults `limit=10`), `feedback show <id>`, `feedback status <id> <status>`
(status validated client-side first), `feedback delete <id>`, `stats [--json]` →
GET /api/cli/admin/stats, `growth [--range 7d|30d|all]` → GET /api/cli/admin/growth,
`logout`. Admin `request()` maps 403 bodies through (no special-casing beyond the
shared ≥400 handling).

Human-output empty states (parity for text mode): now → "Nothing on the table." /
"No lens yet. Complete onboarding in the app first."; today → "Nothing on Today." /
"Nothing done today."; inbox → "Inbox is empty."; projects/goals → "No projects." /
"No goals."; logbook → "Nothing in the logbook."; resources → "No resources.";
feedback list → "No feedback."

## 3. Edge cases + invariants to reproduce

- **401-first ordering:** every handler checks `req.patUser` before touching input.
- **Lens gate ordering:** resolve lens (tenancy) → not-found 404 → FREE violation 402
  → core. `not-found` and `not-owned` are the same 404 (no existence leak).
- **Accessible-lens defaulting:** `now`/`logbook` default to the FIRST accessible lens
  (FREE → included lenses only); `today`/`today/done` filter by the whole set; `review`
  never defaults a lens.
- Boundary validation is 400-at-the-edge: `priority`/`size` (triage), snooze preset,
  move status, `scheduledDate` format, capture attachments shape, project `type`,
  triage decision/lensId/projectId requirements, feedback status/limit, review
  cadence/for+previous exclusivity, pat label/id.
- Triage `lensId` is optional ONLY for `archive`, `delete`, `list-item`; `list-item`
  requires `projectId` (a SIMPLE_LIST project). `capture --list-id` requires the project
  to be a SIMPLE_LIST and gates on its lens.
- Resource create/update/delete resolve the owning project's lens for the gate;
  `resource/list` has no lens gate (detail-style read).
- `task/start` reads `focusSessionMinutes` (25 default; 45 honored) and enforces
  single-running-task; `snooze`/`move` read `timeZone` (default UTC).
- Non-string JSON values in string fields are treated as ABSENT (not errors) —
  `isJsonString` constructor check.
- `--json` byte parity: the CLIs `JSON.stringify` the server body verbatim, so the new
  API must emit the same field names, nesting, null-ness, and top-level envelope
  (`.task`, `.tasks`, `.items`, `.projects`, `.goals`, `.lenses`, `.feedback`,
  `.resource`, `.report`, `.user`, `.stats`, `.result`, …) with JSON-serializable
  values (Dates as ISO strings). The cli/ and admin-cli/ msw-style unit tests assert
  these exact shapes — they are the conformance oracle.

## 4. Tests (the verification surface)

- `cli/src/commands/*.test.ts` + `api.test.ts`, `config.test.ts` — assert exact request
  paths, bodies, and `--json` result shapes per command (now, today, task, lens,
  resource, review, attachment/inbox.download, management).
- `admin-cli/src/commands/{feedback,stats,whoami}.test.ts` — same for the admin
  surface (mocked fetch; exact `{ error }` handling and shapes).
- Webapp side: `webapp/src/auth/` PAT plumbing unit tests + the route handlers
  delegate to the `*Core.ts` files each covered by their own vitest suites
  (`tasks/inbox/projects/goals/lenses/logbook/reviews/resources/feedback/admin`).
- `docs/reviews/cli-pat-plumbing.md` documents the curl-without-token 401 sweep over
  every `/api/cli/*` route — re-run it against the new API (update when routes change).

## 5. Env vars / secrets (names only)

Server: `DATABASE_URL` (authEntities Prisma singleton), plus whatever the auth layer
needs (session secret etc.). CLI-side (client env, not server): `ACTIONAMP_API_URL`,
`ACTIONAMP_WEB_URL`. No Stripe involvement on `/api/cli/*` (billing enters only via
the plan fields on `patUser` → `cliAccessViolation` / lens + cap gates).
