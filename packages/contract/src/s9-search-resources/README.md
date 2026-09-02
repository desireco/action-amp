# S9 — Search + Resources (P0 parity notes)

> Pre-study header for the platform-switch port. Sources read: `webapp/src/search/`
> (`CommandPalette.tsx`, `operations.ts`, `operationsCore.ts`, `paletteRegistry.ts`,
> `paletteMatching.ts`, `paletteAvailability.ts` + tests), `webapp/src/resources/`
> (`operations.ts`, `operationsCore.ts` + tests), `webapp/src/projects/`
> (`ProjectDetailPage.tsx`, `operationsCore.ts`), `webapp/src/app/` (`AppShell.tsx`,
> `useKeyboardShortcuts.ts`, `components/ui/ShortcutCheatsheet.tsx`),
> `webapp/e2e/search.spec.ts`, `webapp/main.wasp.ts`, `webapp/schema.prisma`
> (`Resource`, `ResourceAttachment`), `webapp/src/auth/patRoutes.ts`
> (`cliResource*`), `webapp/src/billing/entitlements.ts` + `entitlementHttp.ts`,
> `docs/features/command-palette.md`, `docs/features/resources-project-owned.md`,
> `docs/INTERACTION.md` §COMMAND/SEARCH modes. This file is the checklist the
> port is verified against.

## 1. Routes / screens

**Search has no dedicated route** — one overlay component
(`webapp/src/search/CommandPalette.tsx`) mounted globally by `AppShell` with two
entry intents (`CommandPaletteMode = "search" | "command"`). Result navigation
targets (exact hrefs):

| Result kind | Destination |
|---|---|
| task (any state incl. done/won't-do) | `/do/tasks/<encodeURIComponent(permalink)>` |
| project | `/do/projects/<encodeURIComponent(permalink)>` |
| goal | `/do/goals/<encodeURIComponent(permalink)>` |
| resource | `/do/projects/<encodeURIComponent(project.permalink)>#resource-<encodeURIComponent(id)>` |
| inbox (live) | `/do/inbox?item=<encodeURIComponent(id)>` |
| inbox (ARCHIVED) | `/do/logbook?item=<encodeURIComponent(id)>` |
| lens | no route — switches the active lens |

**Resources UI** lives on `ProjectDetailRoute` → `/do/projects/:permalink`
(`webapp/src/projects/ProjectDetailPage.tsx`, "Resources" section + `#resource-`
anchor support). Entry points: project page directly, triage Classify step `3`
(Resource), PWA share-to-project (calls `createResource` directly, skips
triage), CLI `actionamp resource …`.

CLI mirrors (same pure cores): `GET /api/cli/resource/list?projectId=`,
`POST /api/cli/resource/create`, `POST /api/cli/resource/update`,
`POST /api/cli/resource/delete`.

## 2. Operations (→ oRPC endpoints)

| Wasp op | Kind | Input | Output | Core (`operationsCore.ts`) |
|---|---|---|---|---|
| `searchSite` (`search/operations.ts`) | query | `{ query: string }` | `SearchSiteResponse = { query, results: SearchSiteResult[], truncated }` | `searchSiteData` in `search/operationsCore.ts` |
| `getCommandPaletteIndex` | query | `void` | `{ items: CommandIndexItem[] }` | `getCommandPaletteIndexData` |
| `createResource` (`resources/operations.ts`) | action | `{ projectId, title, url?, notes?, attachments?: { filename, mimeType, dataBase64 }[] }` | `{ id, title }` (+ more; op returns `result.resource`) | `createResourceCore` in `resources/operationsCore.ts` |
| `updateResource` | action | `{ id, title?, url?, notes? }` | `{ id, title }` | `updateResourceCore` |
| `deleteResource` | action | `{ id }` | `{ id }` | `deleteResourceCore` |
| (read, CLI-only) | — | `{ userId, projectId }` | project with `resources` (createdAt desc, with attachment meta) | `getProjectResourcesData` |

Web reads resources via the existing `getProject` query (resources ordered
`createdAt` desc, select `id/title/url/notes/createdAt/attachments`).

Wasp registration: `searchSite` entities `["Task","TaskUpdate","Project","Goal",
"Resource","InboxItem"]`; `getCommandPaletteIndex` adds `"Lens"`; resource
actions entities `["Resource","Project","Lens"]` (Lens required by
`assertLensAllowed`). All `auth: true`.

`SearchSiteResult = { id, kind, title, subtitle, snippet, matchedField, href,
lens: {id,name,color}|null, state }` with
`kind: "task"|"project"|"goal"|"resource"|"inbox"`,
`matchedField: "title"|"body"|"outcome"|"note"|"url"`,
`state: "active"|"today"|"upcoming"|"someday"|"done"|"wont-do"|"inbox"|"archived"`.
`CommandIndexItem = { id, kind (+ "lens"), title, subtitle, href|null, aliases[],
lensColor?, occurredAt? }`.

## 3. Behaviors

### Search — what's searchable (the words users wrote)

- **Task:** `description` (title), `content` (Context body), `outcome`, and
  `TaskUpdate` bodies where `kind: "NOTE"` (system `COMPLETED` events excluded).
- **Project / Goal:** `name` (title) + `description`.
- **Resource:** `title` + `notes` + `url`.
- **InboxItem (live or ARCHIVED):** `title` (from Android share) + `text` +
  `content` + `sourceUrl`.
- All matching is case-insensitive substring (Prisma `mode: "insensitive"`),
  token-AND (`containsEvery` for title; every token must appear). Lens-wide
  (cross-lens results carry their lens chip). List Items are NOT searchable
  (deferred).

### Search — server ranking + caps (exact constants)

- `TOTAL_LIMIT = 30`, `KIND_LIMIT = 10`, `PASS_LIMIT = 11`, `SNIPPET_LIMIT = 140`.
- Per kind, 3 bounded passes (exact title equals → title startsWith → broad
  all-field AND), each `take: 11`, `orderBy createdAt desc`; deduped by id;
  `truncated` = any pass hit 11 OR post-cap overflow.
- `titleScore`: 0 exact (normalized), 1 prefix, 2 all tokens in title, 3 title
  contains query, 4 body-only. Sort order: score → `KIND_ORDER` (task 0,
  project 1, goal 2, resource 3, inbox 4) → state penalty (done/wont-do/archived
  +1) → `sortDate` (createdAt) desc → id localeCompare (deterministic).
- Task lifecycle mapping: `isDone` → done; `WONT_DO` → wont-do; `TODAY` → today;
  `UPCOMING` → upcoming; else someday. Project/Goal: `isDone` ? done : active.
  Resource inherits its project's done/active and project's lens. Inbox:
  ARCHIVED ? archived : inbox.
- Snippets: window starts 48 chars before the earliest token hit, 140 chars,
  ellipsized both sides. Task matches collapse up to 10 latest matching NOTEs
  into one parent-task result. Inbox display title = `title?.trim() || text`,
  capped at 100 chars with `…`.
- Task rows: subtitle = project name; snippet for a title match comes from
  `content`. Project subtitle = goal name; goal/inbox subtitle = null;
  resource subtitle = project name.

### Search — client (CommandPalette)

- **Debounce 200 ms**; `canSearch = entitled && 2 ≤ len ≤ 100`; input hard-caps
  at 100 chars. Server mirrors validation: < 2 or > 100 normalized chars →
  400 `"Search query must be at least 2 characters."` /
  `"…at most 100 characters."`.
- Stale-response guard: results render only when `data.query === normalized &&
  debouncedQuery === normalized`.
- **Command mode, empty input:** six `common: true` commands (Next, Capture a
  thought, Inbox, Today, Projects, Goals) + guidance "Type to find anything.".
  One character still fuzzy-matches local commands/index (no server call).
- Local matching (`paletteMatching.ts`, Fuse.js): exact title → prefix title →
  Fuse fuzzy (`threshold: 0.38`, `ignoreLocation: true`, keys title 0.7 /
  aliases 0.2 / subtitle 0.1) → server body matches appended; cap 30. Server
  results merge with indexed entities by stable id
  `entity-<kind>-<id>` / `command-<id>`.
- `PALETTE_COMMANDS` registry (15 entries; safe commands only — no destructive
  ops): next, capture (action), inbox, today, projects, goals, triage
  (`/do/inbox/review`), upcoming, someday, logbook, review, settings, billing
  (`/do/settings/billing`), theme (action), shortcuts (action). Aliases
  lowercase, e.g. logbook → `archive, done, history`.
- Index aliases: task → `[status lowercase, isDone ? "done" : "task", project
  name, lens name]`; resource → `["resource","reference", project name, lens
  name]`; inbox → `[archived ? "archived" : "inbox", "note"]`, subtitle
  "Logbook"/"Inbox", `occurredAt = archivedAt | createdAt`; lens → subtitle
  "Switch lens", aliases `["lens","switch context"]`, `href: null`.
- Rows: kind label ("Task/Project/Goal/Resource/Inbox record/Lens") · lens ·
  subtitle · state label ("Active/Today/Upcoming/Someday/Done/Won't do/Inbox/
  Archived"); matched-field tag on the right (title/notes/outcome/update/link);
  query tokens `<mark>`-highlighted.
- Footer: `↑↓ move` · `↵ open` · `esc close` · count — truncated →
  "More matches—refine your search", else "N results"; `aria-live="polite"`
  mirror. Empty copy (search mode): "Search tasks, projects, goals, resources,
  and inbox."; 1-char: "Type one more character to search."; loading
  "Searching…"; none: `No matches for "q".`; error: offline → "Search
  unavailable while offline." else "Search unavailable. Try again.".
- Placeholders: search mode "Search anything…", command mode "Find anything or
  run a command…".
- Overlay blocked while (`paletteAvailability.ts`, `isPaletteBlocked`):
  working (`/do/focus`), triage (`/do/inbox/review`), capture, cheatsheet,
  logout confirmation, feedback, mobile-lens popover, palette already open.
  ⌘K capture is intentionally NOT blocked in focus mode (the "focus-protector").

### Resources — what + CRUD + linking

- A **Resource is project-owned reference material** (a link + notes + optional
  image attachments), "NOT an action": `title` (required, trimmed, non-empty),
  `url` (optional; normalized — trim, empty → null, must parse as `http:`/
  `https:` else error "Use a full http:// or https:// link."), `notes`
  (optional, trimmed, empty → null). `projectId` required + NOT NULL,
  cascade-delete with the project. **No loose resources, no dual parent (goal
  dropped), no `TaskResource` join** (tasks reference material as markdown
  links in the Context field), no delete-with-impact flow.
- Create/Edit: `BottomSheet` "Add resource" / "Edit resource" — Title input
  (autoFocus, placeholder "What is this?"), Link input (`type="url"`,
  placeholder "https://…", optional), Notes textarea (rows 4, placeholder "Why
  keep this?", optional); Save/Cancel; server errors surface inline. Delete:
  `ConfirmDialog` "Remove this resource?" — "“{title}” will be removed from
  this project. Tasks and their Context links stay unchanged.", confirm label
  "Remove resource" (danger).
- Project page rows: external link (`↗ title`, opens url) or plain title,
  notes text, display-only attachment thumbs; per-row `Edit` / `Remove` ghost
  buttons; section copy "Links, notes, and reference material for this
  project."; empty "Nothing saved here yet."; heading id
  `project-resources-heading`, row id `resource-<id>`.
- Attachments: `createResource` accepts `attachments` (filename, mimeType,
  dataBase64) through `prepareImageAttachments` (image-only, size-capped) →
  `ResourceAttachment` rows (bytes in `data`, served by owner-gated
  `/api/attachments/:id`). Carried from triage of image captures and from the
  PWA share-to-project flow.
- Update invariant: at least one of title/url/notes required else error
  "Provide a title, url, or notes to update.".

## 4. Keyboard

Global (`useKeyboardShortcuts.ts`, wired in `AppShell`):
- `/` → **Search mode** (plain `/` only — no meta/ctrl/alt; typing-guarded so
  it never steals text from inputs/editors).
- `⌘\` / `Ctrl+\` (`e.code === "Backslash"`) → **Command mode** — works even
  in text fields. Cheatsheet labels: `/` "Search"; `⌘\` "Command palette"
  (note "Pro · works in text fields").
- Visible pointer/touch equivalents: header search button (`openPalette("search")`,
  shows a "Pro" badge when not entitled, disabled while blocked) per
  INTERACTION.md ("the visible search control opens the same touch-usable
  component in Search intent").

Inside the palette:
- `↑` / `↓` — move selection, **wrapping** (`(selected ± 1) mod length`).
- `Enter` — open result / run command (closes palette first).
- `Escape` — close (`preventDefault` + `stopPropagation`).
- `Tab` / `Shift+Tab` — focus-trapped inside the card (input ↔ close button).
- Hover (`onPointerMove`) — selects the row. Focus auto-lands in the input on
  open; focus returns to the invoking control on close.
- a11y contract: overlay `role="dialog"` `aria-modal`, input `role="combobox"`
  (`aria-label="Search ActionAmp"`, `aria-activedescendant`, `aria-controls`,
  `aria-autocomplete="list"`), list `role="listbox"`, rows `role="option"` +
  `aria-selected`; body scroll locked while open.

Resources UI: no dedicated shortcuts (sheet/modal + buttons only).

## 5. Edge cases + invariants

- **Entitlement gate:** sitewide search + palette index are **whole-account Pro
  capabilities** (active PRO / FOUNDER / admin / `manualAccessGrant`; mirror of
  `resolveEffectiveAccess`). Server: `assertSitewideSearchAccess` →
  `HttpError(402, "<feature> is a Pro feature.", {feature, reason})` with
  feature "Command palette and search", reason "find and move through all your
  ActionAmp work from one place". Client: FREE users see the shared `<ProGate>`
  (calm gate, no raw 402); queries never fire (`entitled` flag + `enabled`).
  Both ops must reject **before** touching entities (tested).
- **Tenancy:** every read is `userId`-scoped, including nested task-note
  matching (`updates: { some: { userId, kind: "NOTE", … } }`).
- **Resource entitlement:** writes gated by `assertLensAllowed` (FREE users
  cannot file into the Work lens) and by product type — `SIMPLE_LIST` project →
  400 (web: "A Simple-list Project keeps only checklist items."; CLI: "A Simple
  list keeps only checklist items." — slight wording difference). Ownership:
  unknown project/resource → 404.
- **Command suppression:** palette stays closed while Working (focus mode) and
  during any blocking overlay; ⌘K capture still works there (e2e-asserted).
- **Bounded reads:** max 3×11 rows per kind per query (relevance-safe passes);
  `truncated` must stay truthful (footer + aria-live). Palette index is one
  unbounded snapshot (benchmark: 5,000-item index < 2 MB; 5k match within
  interactive budget) fetched only in command mode when entitled.
- **Selection stability:** selection tracks stable ids (`entity-<kind>-<id>`)
  while server results merge in or reorder; first item auto-selected.
- Inbox rows: `lens: null` always. Archived inbox search hits route to the
  Logbook anchor; live ones to the Inbox anchor.
- URL validation happens server-side in the core (normalizeUrl) — a bad url
  rejects the whole create/update with the exact message above; title
  whitespace-only → "Resource title cannot be empty.".
- Search is **not** available offline (explicit error copy), no caching of
  results; the command index is a query cache like any other.

## 6. Tests

**e2e — `webapp/e2e/search.spec.ts` (4 tests):**
- "active-paid command search reaches a Task permalink": admin signup → triage
  task to today → `⌘\` opens "Command palette" dialog → fill combobox →
  `/operations/search-site` responds ok → click option → URL `/do/tasks/…`,
  title visible.
- "active-paid slash search reaches the exact Inbox item": capture → inbox →
  `/` opens "Search ActionAmp" dialog → search ok → click option → URL
  `/do/inbox?item=…`, `.aa-inbox__item.is-search-target` visible.
- "Free invocation shows the calm shared Pro gate": free signup → `⌘\` →
  dialog contains "Command palette and search is a Pro feature." + "find and
  move through all your ActionAmp work from one place".
- "Command stays suppressed while Working and Capture keeps Cmd+K": start
  focus → `⌘\` opens nothing → `⌘K` still opens quick capture.

**Unit — search:**
- `operations.test.ts` (7): searchSite rejects unauthenticated before data;
  entitled PRO user searches tenant-scoped entities; 400 for invalid query
  length; FREE plan rejected without entity reads; index op rejects
  unauthenticated; same entitlement before index read; FREE rejected without
  index entity reads.
- `operationsCore.test.ts` (11): normalization trims/collapses whitespace;
  2–100 boundary; per-entity user scoping incl. nested task notes; every task
  lifecycle state + inbox/archived mapping; all result kinds' shapes/states/
  destinations; ranking exact > prefix > title-token > body; deterministic
  kind order on ties; older exact match not hidden by newer body matches;
  matching task notes collapse into one parent result; caps 10/kind, 30/total +
  truncation flag; compact index covers every kind tenant-scoped; 5k index <
  2 MB.
- `CommandPalette.test.tsx` (19): Pro gate for Free; command mode + Enter run;
  arrow-key movement; workflow commands lens-independent; debounce + grouped
  results + destination open; waits for 2 chars before server search; 1-char
  local matching still works; Escape closes; empty command state = 6 common +
  guidance; Fuse typo matching while server unavailable; lens switch by
  pointer; loading/empty/error/truthful-truncation states; lens fuzzy-match
  switches without navigating; stale server response ignored; selection by
  stable id through reorder; Tab trap; focus restore; selection stable when
  server results merge.
- `paletteMatching.test.ts` (3): exact → prefix → Fuse order; server body
  matches kept + cap; 5k index within interactive budget.
- `paletteRegistry.test.ts` (1): registry owns every required destination and
  shared action. `paletteAvailability.test.ts` (1): palette opens only when no
  blocking mode/overlay.

**Unit — resources (`resources/operationsCore.test.ts`, 5):** create requires
owned project + trims title; rejects empty title / unknown project; stores
image attachments on create; rejects non-image + oversized images; normalizes
http(s) urls, rejects other schemes.
