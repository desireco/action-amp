# S2 — Capture + NL parse (parity notes)

> P0 pre-study for the platform switch. Source of truth read: `webapp/src/components/ui/CapturePopover.tsx`,
> `webapp/src/app/AppShell.tsx` (capture wiring), `webapp/src/app/useKeyboardShortcuts.ts`,
> `webapp/src/inbox/parseCapture.ts` (+ `parseCapture.test.ts`), `webapp/src/inbox/projectResolver.ts`,
> `webapp/src/inbox/operations.ts` / `operationsCore.ts`, `webapp/main.wasp.ts`,
> `webapp/e2e/capture.spec.ts`, `docs/WORKFLOW.md` §2.1, `docs/features/capture.md`,
> `docs/specs/done/capture-grammar.md`. These notes are the checklist the port is verified against.

## 1. Routes / screens

Capture has **no route of its own** — it is a global overlay mounted by the authenticated shell.

| Surface | Where | Notes |
|---|---|---|
| Capture popover (`role="dialog"`, `aria-label="Quick capture"`) | `AppShell.tsx`, rendered when `captureOpen` | Pure-UI component `components/ui/CapturePopover.tsx`; all data (projects, lens names) arrives as props from AppShell (single query site, auth-gated — the popover itself does no queries). |
| Capture FAB | Lower-right floating button in AppShell | Visible label "Capture"; also a **drop target** — dropping files on the closed FAB opens the popover with the files preloaded (`initialFiles`, ref-guarded against StrictMode double-mount). |
| Inbox (the destination) | `/do/inbox` (route `InboxRoute`) | Covered in S3. |
| One-shot URL open | `/do?capture=1` | Manifest shortcut / notification action: AppShell sees `?capture=1`, opens capture, deletes the param from the URL (navigate replace). InboxPage's empty state links here. |
| Overlay precedence (Esc) | AppShell `onCloseOverlay` | Esc closes topmost: palette → capture → cheatsheet → confirmLogout → feedback → lensPopover → mobileLens. |

## 2. Operations (Wasp → oRPC endpoints)

All ops live in `webapp/src/inbox/operations.ts`; pure DB shapes in `inbox/operationsCore.ts`.
Wasp op ids (URL paths): `create-inbox-item`, `get-inbox-items`, `get-inbox-item`,
`triage-inbox-item`, `restore-archived-item`, `update-inbox-item`, `get-projects-for-resolver`.

| Op | Kind | Input | Output | Core |
|---|---|---|---|---|
| `createInboxItem` | action | `{ text: string; projectName?: string; projectId?: string; lensId?: string; title?: string; content?: string; sourceUrl?: string; timeZone?: string; attachments?: { filename: string; mimeType: string; dataBase64: string }[] }` | `{ id, text, createdAt }` | `createInboxItemCore` |
| `getInboxItems` | query | `never` | `InboxItem[]` (UNPROCESSED, newest-first, metadata select incl. `attachments {id, filename, mimeType}` + all `parsed*` fields) | `getInboxItemsCore` |
| `getProjectsForResolver` | query | `never` | `{ id, name, permalink, type: "STANDARD" \| "SIMPLE_LIST", lensId, lensName, lensColor }[]` — ALL lenses, non-done + non-archived projects, **most-recently-active first** (max child Task/ListItem/Resource createdAt, fallback project createdAt, name asc tiebreak) | inline in `operations.ts` |
| `updateInboxItem` | action | `{ inboxItemId: string; text: string }` | `{ id }` | inline (updateMany WHERE `status: "UNPROCESSED"`, so a late debounce flush after triage delete no-ops) |
| (`getInboxItem`, `triageInboxItem`, `restoreArchivedItem`) | — | — | — | S3 README |

Related non-Wasp endpoints that must exist in the port:

- `POST /api/cli/capture` (`auth/patRoutes.ts :: cliCapture`) — PAT-authed mirror of `createInboxItem`; body `{ text, projectName?, projectId?, listId?, attachments? }`; `projectId` XOR `listId` (400 if both); `listId` must be a SIMPLE_LIST project (404 unknown / 400 wrong type).
- `POST /api/share` (`share/shareCapture.ts`) — Android share target, same `createInboxItemCore` path with structured `title/content/sourceUrl` + attachments.

### `createInboxItemCore` behavior (the contract for the port)

1. `text` trimmed; empty → throw `"Capture text is required."` (400 via wrapper).
2. Fetches the user's **custom lens names** first so `[[studio]]` parses (seeded work/personal/me are always known; `createInboxItem` passes `timeZone = args.timeZone ?? context.user.timeZone ?? "UTC"` — AppShell sends `Intl.DateTimeFormat().resolvedOptions().timeZone`).
3. Runs `parseCapture(raw, new Date(), customLensNames, timeZone)` → persisted `parsed*` fields.
4. If `projectId` given: must be user's project (`"Project not found."`); its `lensId` wins over `lensId` arg; if both given and mismatched → `"Project and list must belong to the same area."`. `lensId` alone must exist (`"List or area not found."`).
5. Persists: `text = parsed.cleanText`, `title/content/sourceUrl` (trimmed or null), `attachments` via `prepareImageAttachments` (nested create), all `parsed*` values, `parsedProject = projectName?.trim().toLowerCase() || parsed.parsedProject` (explicit typeahead pick overrides parser), `parsedProjectId`/`parsedLensId` when a destination was selected by id.
6. Wasp wrapper side effects: advances `onboardingStage` `CAPTURE → TRIAGE` (updateMany, only if currently CAPTURE); fires analytics `CAPTURE_CREATED` (route `/do/inbox`), fire-and-forget.

### AppShell submit wiring (client contract)

- `onSubmit(text, files?)`: image-only captures need display text → `text: text || files?.[0]?.name || "Image"`. Files → `fileToImageAttachmentInput` (base64) → `attachments`.
- After submit: invalidate `getInboxItems`, `getAppData` (sidebar count), `auth/me` (onboarding stage).
- Capture is **universal** — InboxItem has no lensId column; no entitlement gate on create (FREE users capture freely; the gate is at triage filing).

## 3. NL parsing rules (`parseCapture.ts`, grammar v2, locked 2026-07-04)

Pure function: `parseCapture(raw, now = new Date(), knownLensNames = [], timeZone = systemTimeZone()) : ParsedCapture`.

```ts
interface ParsedCapture {
  cleanText: string;                   // token-stripped, whitespace-collapsed, trimmed
  parsedScheduledDate: Date | null;    // calendar date (@db.Date)
  parsedSnoozedUntil: Date | null;     // exact instant (tonight = today 20:00 local)
  parsedPriority: "LOW" | "NORMAL" | "IMPORTANT" | null;
  parsedSize: "S" | "M" | "L" | "XL" | null;
  parsedTags: string[];                // ["#tag"] — lowercased, prefix kept
  parsedProject: string | null;        // FIRST # token (name, lowercased, no prefix)
  parsedLens: string | null;           // [[token]], lowercased
}
```

Pass order (matter: `[[lens]]` → `@date` → `#project` → `#tags` → `!priority` → `~size` → bare date words → weekday → month-day → numeric M/D → whitespace collapse):

### `[[lens]]` — lens override
- Regex `/\[\[([a-zA-Z0-9_-]+)\]\]/`, **first occurrence only**, recognized if lowercased name ∈ `{work, personal, me}` ∪ `knownLensNames` (lowercased). Recognized → stripped + `parsedLens`; **unknown → stays literal** (no false positives on pasted Obsidian/Notion wiki-links). A second `[[ ]]` always stays literal. Test: `"[[work]] and [[personal]]"` → lens `work`, cleanText `"and [[personal]]"`; `"[[xyzzy]] thing"` → lens null, text unchanged; custom `"[[studio]]"` recognized only when `knownLensNames` includes it.
- Resolution to a real lens happens **at triage**, on `kind` for seeded (`work`→WORK, `personal`/`me`→PERSONAL — rename-safe) and exact case-insensitive name for custom.

### `@` — time ONLY (v2; `@phone`, `@errands` are NOT tags, stay literal)
- `@(tonight|today|tomorrow|tmrw|tmr)\b` (case-insensitive, all occurrences replaced but only first sets a value). Aliases: `tmrw`, `tmr` → tomorrow.
- `today` → `parsedScheduledDate = today`; `tomorrow/tmrw/tmr` → +1 day; `tonight` → `parsedSnoozedUntil = today 20:00` in the given timeZone (scheduledDate stays null).
- Bare forms (no `@`) also parse later in the pass (see dates).

### `#` — project first, tags after
- First `#token` OR `#[Bracketed Name]` (bracket form allows spaces/multi-word) → `parsedProject`, lowercased, stripped from text. Only the first; regex `/#\[([^\]\r\n]+)\]|#([a-zA-Z0-9_-]+)/` (single replace).
- Every later `#token`/`#[name]` → `parsedTags` as `"#name"` (lowercased, `#` kept). Tests: `"x #mvp #extra"` → project `mvp`, tags `["#extra"]`; `"Email Sarah #[Q3 Launch]"` → project `"q3 launch"`, cleanText `"Email Sarah"`.
- Tag chars allowed: `[a-zA-Z0-9_-]` (unbracketed).

### `!` — priority (three-level enum)
- Forms: `!1/!2/!3`, `!low/!normal/!important/!imp/!high/!h`, bang-runs `!` `!!` `!!!`.
- Map: `1|low|!` → LOW; `2|normal|!!` → NORMAL; `3|important|imp|high|h|!!!` → IMPORTANT. First match only; unknown `!word` stays literal. Regex splits `(!(\d+|[a-z]+)|!{1,3})` (specific pattern first so `!{1,3}` doesn't eat `!1`).
- Case-insensitive.

### `~` — size
- Time form `~(\d+\.?\d*)(m|h)\b` → minutes → S (<15m), M (>=15m <60m), L (>=60m <120m), XL (>=120m). Tests: `~10m`/`~14m`→S, `~15m`/`~45m`→M, `~1h`/`~1.5h`→L, `~2h`/`~3h`→XL.
- Word form `~(xs|s|m|l|xl)\b` → direct; `~xs` → S. Case-insensitive.

### Dates (multi-word first; first hit wins per stage; weekday/month/numeric only run when nothing set yet)
- `next week` → +1 week; `next month` → +1 month (on the PlainDate).
- Bare `tonight|today|tomorrow|tmrw|tmr` (word-boundary, global replace): same targets as `@` forms.
- Weekdays (`sunday|sun`, `monday|mon`, `tuesday|tue|tues`, `wednesday|wed`, `thursday|thu|thur|thurs`, `friday|fri`, `saturday|sat`) → **next occurrence**; same-day counts as *next week* (diff 0 → 7). Test: from Wed 2026-06-24 — `monday` → 06-29, `fri` → 06-26, `wed` → 07-01.
- `month day` (`jun 30`, `june 30`, `sept 5` …; month regex wrapped in a non-capturing group + `\s+(\d{1,2})`) → that date this year; **if past, rolls to next year** (`jan 5` from Jun 2026 → 2027-01-05).
- Numeric `M/D` (`\b(\d{1,2})\/(\d{1,2})\b`) → month/day this year, same past-rolls-to-next-year rule; invalid month/day stays literal.
- Only ONE date wins overall: once `scheduledDate`/`snoozedUntil` is set, later date stages skip.

### Whitespace + fallbacks
- Final `text.replace(/\s+/g, " ").trim()`; **if everything was a token, `cleanText` falls back to `raw.trim()`** (test: `"#mvp !3 ~XL"` → cleanText is the original string, tokens still parsed).
- Empty string → everything null/empty.

### Canonical combined example (from tests)
`"Email Sarah re: invoice tomorrow #mvp !3 ~20m"` → cleanText `"Email Sarah re: invoice"`, date tomorrow, priority IMPORTANT, size M (20m), project `mvp`, tags []. And `"[[work]] ship the launch deck tomorrow !2"` → lens work, text `"ship the launch deck"`, date tomorrow, priority NORMAL.

### Project resolver (`projectResolver.ts :: resolveProjectCandidate`) — runs at triage, not capture
1. If `parsedProject` hint: **exact case-insensitive name match** against candidate projects; no guess.
2. Else free-text: name must match at a whitespace/sentence boundary — regex `(^|\s)NAME(?=$|\s|[.,!?;:])` (punctuation inside names OK, e.g. `C++`); **no substring inside longer words** ("MVP2" ≠ "MVP").
3. Multiple matches → **longest name wins**. Zero → null (falls to General; never auto-creates).
4. `[[ ]]` beats project-inferred lens on disagreement (cross-lens mismatch → hint does not match).

### Capture `#` autocomplete (client-only)
- `detectMention(text, caretIndex)` (`components/ui/detectMention.ts`): caret inside chars after a `#` that sits at a token boundary (start of input or after whitespace). Closed by space/newline/another `#`. Inner `#` of a word ("C#") is literal.
- Dropdown: caret-anchored (`getCaretCoordinates`), dedup by lowercased name, `startsWith(query)`, **max 8** (`MENTION_LIMIT`). Shows `▣ name` + lensName when ≠ active lens. Keys: `↑/↓` cycle, `Enter`/`Tab` accept, `Esc` closes (mention intercepts Enter before submit — the e2e capture helper presses Enter twice for this). Accept inserts `#name ` or `#[name] ` (bracketed when the name has whitespace).
- Source: `getProjectsForResolver` filtered to `type !== "SIMPLE_LIST"` (lists are not capture targets) — passed from AppShell.

## 4. Keyboard map (capture surface)

From `useKeyboardShortcuts.ts` (global) + `CapturePopover.handleKeyDown`:

| Key | Action | Notes |
|---|---|---|
| `⌘K` / `Ctrl+K` | Open capture | Works **everywhere**, even in text fields; `preventDefault`. LOCKED 2026-06-30. |
| `Shift+C` | Open capture (typing-safe backup) | Only when not typing; `⌘K` stays the always-works one. |
| `Enter` | **Capture + close** | Reversed 2026-06-30 (was ⌘Enter-to-close). Skips when a mention dropdown is open (Enter accepts the mention instead). |
| `⌘Enter` / `Ctrl+Enter` | **Capture + keep open** (rapid-fire) | Clears input, keeps focus, stacks up to 3 `"✓ captured"` confirmations with compact parsed chips. |
| `Shift+Enter` | Literal newline | Never submits. |
| `Esc` | Close without saving | Always works; closes mention dropdown first if open. |
| `⌘\` | Command palette (separate overlay) | Also works in fields. |
| (while typing) | NL sigils `#` `@` `[[ ]]` `!` `~` + date words | Live chip preview under the textarea as you type (re-parses on every keystroke, client-side, same `parseCapture`). |
| Backdrop click | Close | The overlay div's onClick closes; card stops propagation. |

Foot hint bar: `⏎ save · ⌘⏎ add another · Esc close` (swaps to error text on failure). Save button disabled when text empty AND no pending images, or while submitting.

## 5. Behaviors — capture flow, images, edge cases

### Flow
1. `⌘K` (or FAB click, or `/do?capture=1`, or empty-inbox CTA) opens the dialog; textarea auto-focused; placeholder `What's on your mind?  (try: "Email Sarah tomorrow #mvp !3")`.
2. Textarea grows: starts 1 row, auto-grows to `MAX_HEIGHT_PX = 96` (~4 lines), then scrolls internally (TRIAGE.md §6 "grows, never scrolls sideways" — LOCKED 2026-06-22).
3. Live preview chips render whenever any token parsed: verbose variant — `[[lens]]` (teal), `📅 date`/`snoozed until …` (teal), `▣ project` (teal), `★ Important` (amber), `low` (muted), size chip (default), all tags (violet). Post-commit toast uses compact variant (no emoji, bare `★`, max 2 tags, `N images` chip).
4. Date chip label: `today` / `tomorrow` / `Mon D` via `calendarDayDifference`.
5. Submit → `createInboxItem` → lands in universal Inbox (UNPROCESSED). Capture never asks "where does this go?" — that's triage's job (WORKFLOW.md §2.1). Target: thought → inbox in under 2 seconds.
6. Rapid-fire: after each ⌘Enter commit the confirmation stack (max 3) shows cleanText (or `"Image"` fallback when image-only) + parsed chips.

### Image attachments (2026-08-16)
- Intake: `⌘V` paste (clipboard images only; plain-text paste untouched) and drag-drop onto the open popover (whole overlay is the target; `dragDepth` counter keeps highlight stable) or onto the closed FAB (opens with files preloaded; `initialFilesConsumed` ref-guard prevents double-attach in StrictMode).
- Caps (client mirrors server `prepareImageAttachments` exactly — same caps, same error copy; server re-validates): **up to 4 images** (`MAX_IMAGE_ATTACHMENTS`), **≤ 5 MB each** (`MAX_IMAGE_ATTACHMENT_BYTES`), `image/*` only.
- Error copy: `"Only images can be attached."`, `"Each image must be 5 MB or smaller."`, `"Attach up to 4 images at a time."`
- Pending images render as removable data-URL thumbnails before commit; duplicates (same File identity) silently skipped; non-image files in a drop rejected with error.
- An image **alone is submittable** (no text): display text falls back to first filename (then `"Image"`).
- Bytes are stored on `InboxAttachment {filename, mimeType, size, data: Bytes}` rows nested-created with the InboxItem; they move with the item through triage (S3).
- Serving: `GET /api/attachments/:id` (`attachments/serveAttachment.ts`) — session-cookie auth (`auth:false` + middleware, because `<img>` can't send Authorization), owner-gated, `Cache-Control: private, immutable`. This route is the single storage seam.

### Submit failure
- Error shown inline in the foot hint (`role="alert"`): the server message, or `"Could not save. Your text is kept — try again."`. Input stays populated; submitting flag resets.

### InboxItem storage shape (schema.prisma)
`text` (cleaned), `title/content/sourceUrl` (nullable, structured share fields), `status: InboxItemStatus` (`UNPROCESSED | ARCHIVED`), `archivedAt`, `createdAt`, `parsedScheduledDate (@db.Date)`, `parsedSnoozedUntil (Timestamptz)`, `parsedPriority (Priority)`, `parsedSize (Size)`, `parsedTags (String[])`, `parsedProject`, `parsedLens`, `parsedProjectId`, `parsedLensId`, `attachments InboxAttachment[]`.

## 6. Caps, entitlement gates, invariants

- **No entitlement gate on capture.** The Inbox is universal/unscoped (WORKFLOW.md §2.1); FREE users capture without limits. `createInboxItemCore` never calls `assertLensAllowed`/`assertUnderCap`.
- `getProjectsForResolver` is lens-agnostic **by design**: FREE users see WORK/CUSTOM-lens projects in autocomplete (visibility ≠ write access — filing still 402s at triage). Recent-first ordering is contract.
- FREE limits that touch this surface indirectly: `FREE_LIMITS = { projects: 3, goals: 1, workLens: false }`.
- Invariant: capture never auto-files into a lens/project — `parsedProjectId`/`parsedLensId` only *pre-fill* triage; every lens assignment is visibly ratified in Classify (WORKFLOW.md §5.5 "explicit ratification").
- Invariant: unknown tokens are never lost — unknown `[[ ]]`, unknown `!word`, unmatched text all stay literal in `cleanText`. Unknown `#token` still becomes project hint/tags (deterministic by position).
- Invariant: parse is idempotent-safe and deterministic given `(raw, now, knownLensNames, timeZone)` — it is a pure function; the same parser runs client-side (preview) and server-side (persist).
- Onboarding: first capture advances `onboardingStage` CAPTURE → TRIAGE (wrapper side effect, conditional updateMany).

## 7. Tests (what the e2e/unit suites pin)

`webapp/e2e/capture.spec.ts` (2 tests):
1. `"⌘K opens the capture popover from the home screen (F1)"` — signup → `/do`, click body (focus), `Meta+K` → dialog `[aria-label="Quick capture"]` visible within 5s.
2. `"⌘Enter keeps the popover open (rapid-fire); Enter commits and closes"` — after ⌘Enter: dialog still visible, textarea value `""`, focus retained; after Enter: dialog hidden within 5s.

(Dropped from e2e deliberately — covered by unit tests instead: NL chip parsing → `parseCapture.test.ts` + `projectResolver.test.ts`; inbox landing → `triage.spec.ts`.)

`webapp/src/inbox/parseCapture.test.ts` — table-driven, fixed NOW = Wed 2026-06-24 10:00 local; covers: project hint (`email #work`→work; `#MVP` lowercased; `#[Q3 Launch]` bracketed; first-#-wins with extras→tags), tags (`x #proj #errands #home`; `#WORK` lowercased), `@` time-only (`@phone`/`@errands`/`@home` stay literal; `@today` sets date not tag; `@tomorrow/@tmrw/@tmr`; `@tonight` → snooze 20:00), lens (`[[work]]` stripped; `[[personal]]`+`[[me]]` both resolve; lowercased; unknown literal; first-wins second literal; custom via knownLensNames only), priority (all 12 forms), size time tokens (8 boundary cases incl. `~1.5h`), size word tokens (`~S..~XL`, `~xs`), relative dates (today/tomorrow/tmrw/tmr/tonight/next week/next month), weekdays (next-occurrence incl. same-day→+7), month-day (`jun 30`, `june 30`, past→next year), numeric M/D (`6/30`, `12/25`), combined real strings, edge cases (all-tokens→original text; plain text untouched; empty string).

`webapp/src/inbox/operations.capture.test.ts` (unit, mocks entities): guards (unauthenticated throws; empty/whitespace text rejected), happy path (cleaned text + parsed-* persisted + userId), custom `[[lens]]` recognized via user's lens names, explicit `projectName` typeahead override persisted, destination-by-ID persisted, structured share fields stored, one shared image stored as Inbox attachment.

`webapp/src/inbox/projectResolver.test.ts`: exact hint match no guessing; punctuation names match; no match inside longer words; longest free-text match wins.
