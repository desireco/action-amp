---
feature: command-palette-search
status: done
spec_owner: discover
build_owner: build
priority: P3
kind: spec

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsXU # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:45:22Z
---

# Feature: Command palette + sitewide search

## Summary

Add one Pro-tier command popover that does two related jobs: fuzzy jump/run over
ActionAmp's structure, and text search across user-owned Tasks, Projects,
Goals, Resources, and live/archived Inbox records. It is the power-user escape
hatch for a product whose home screen deliberately refuses to become a master
list.

This replaces the old split between “command palette” and a possible Logbook
search box. Search lives in the palette. `⌘K` stays Capture; `⌘\` becomes
Command mode. `entitlement-enforcement` is already shipped, so this feature
must reuse its `isEntitled`/`<ProGate>` boundary rather than add plan logic.

### Current implementation checkpoint — 2026-08-08

Implementation now covers both paid queries, bounded relevance-safe retrieval,
the compact entity/Lens index, Fuse label matching, shared ProGate, full safe
command registry, stale-query handling, accessibility behavior, exact result
destinations, and the specified test matrix. `wasp compile`, the targeted
command-palette slice, and the full 900-test Vitest suite pass. Four targeted
Playwright journeys pass against the local app: paid Command-to-Task, paid
Search-to-Inbox, Free ProGate, and Working-mode suppression with `⌘K` Capture
preserved. Desktop and touch browser inspection also pass.

## Product decisions

1. **One component, two entry intents, no Search page.** `/` opens Search with
   search-first empty copy. `⌘\` opens Command with common destinations and
   safe commands. Both intents use one popover; typing searches command/entity
   labels and user-authored record text.
2. **Global across Lenses.** Command mode is an orientation tool, not a scoped
   list. Paid users search all their Lenses; results show Lens identity.
3. **All lifecycle states.** Open, completed, and `WONT_DO` Tasks; active and
   completed Projects/Goals; current Resources; and `UNPROCESSED`/`ARCHIVED`
   Inbox records are searchable. Results open the exact record or its anchored
   owning section, never a generic page with no location cue.
4. **User-authored prose counts.** Search covers Task title/Context/Outcome/
   updates, Project and Goal name/description, Resource title/URL/notes, and
   Inbox text/title/content/source URL. Attachment binaries are not searched.
5. **Matching is explicit.** Fuse.js fuzzy-matches command/entity labels.
   Long-form record fields use case-insensitive substring matching in v1.
   Every normalized query token must match somewhere within one record, though
   tokens may match different fields or notes on that record.
   “Sitewide search” describes field coverage, not PostgreSQL linguistic
   ranking.
6. **Safe command set.** V1 can navigate, switch Lens, open Capture, and toggle
   theme. It cannot complete/delete/move records or run any action requiring a
   confirmation.
7. **Command is a Normal-mode accelerator.** It works from authenticated
   Normal-mode surfaces, including when an input has focus. It does not open
   over Capture, Triage, Confirm, another blocking overlay, or Working mode.

## Done-conditions

### A. Entry, overlay, and accessibility

- [x] **Global command chord.** `useKeyboardShortcuts.ts` accepts
      `Meta+Backslash` and `Ctrl+Backslash`. Prefer `e.code === "Backslash"`,
      with a tested `e.key === "\\"` fallback. Wire both through a new
      `onCommandPalette` handler. It calls `preventDefault()`, works when an
      input/textarea/contenteditable has focus, and never changes `⌘K` Capture.
      Working mode and an already-open blocking overlay suppress it.
- [x] **Search entry + typing guard.** Bare `/` opens the same component in
      Search intent only from Normal mode and never steals `/` from an input,
      textarea, select, or contenteditable. A visible AppShell search control
      is its pointer/touch equivalent and exposes the Pro state before click.
- [x] **Shared popover behavior.** `CommandPalette` reuses the non-blocking
      capture-popover shell: dim backdrop, max-width 480px, focus moves to the
      input, focus trap, scroll lock, backdrop/Esc dismissal, and focus return
      to the opener. Opening it closes any non-blocking Lens popover first.
- [x] **Combobox semantics.** Input uses the ARIA combobox pattern with an
      owned listbox; options expose stable ids, type text, and
      `aria-selected`. `↑`/`↓` move selection, `Enter` runs it, `Esc` closes,
      and `Tab` stays within the popover. Pointer and
      touch selection work with ≥44px touch targets. Screen readers receive a
      polite result-count update. Reduced-motion mode has no scale animation.

### B. Empty state and fixed commands

- [x] **Complete typed registry, restrained intent-aware empty state.** Searchable static
      destinations use current product language: Next (`/do`), Inbox, Triage,
      Today, Upcoming, Someday, Projects, Goals, Logbook, Review, and Settings.
      Billing and Shortcut help are valid utility destinations. Command's empty
      input shows at most six common destinations/actions plus “Type to find
      anything”; Search's empty input shows only search-first guidance. Neither
      dumps the whole registry. No invented Search route.
- [x] **Non-destructive actions.** “Capture a thought” closes Command then opens
      the existing Capture popover. “Toggle theme” and “Shortcut help” call the
      same handlers used by AppShell/Preferences. None duplicates business
      logic.
- [x] **No dead targets.** Static target definitions live in one typed registry
      used for rendering and execution. Every route matches `main.wasp.ts`.

### C. Fuzzy jump index

- [x] **Paid entity-index query.** Add `getCommandPaletteIndex` returning only
      the authenticated user's compact jump data. No long-form prose or
      attachment data rides in this index.

| Record       | Compact index fields                                             |
| ------------ | ---------------------------------------------------------------- |
| Task         | `id`, `permalink`, `description`, `isDone`, `status`, Lens label |
| Project      | `id`, `permalink`, `name`, `isDone`, Lens label                  |
| Goal         | `id`, `permalink`, `name`, `isDone`, Lens label                  |
| Resource     | `id`, `title`, parent Project name + permalink, Lens label       |
| Inbox record | `id`, display title, `status`, created/archive date              |
| Lens         | `id`, `name`, `color`, `kind`                                    |

- [x] **Fuzzy matching uses Fuse.js.** Search labels plus useful aliases
      (parent Project, Lens, command synonyms) without hand-rolled edit
      distance. Exact label, prefix, then Fuse score determines order. Type is
      a tiebreaker only; result kind is never used as a hidden search filter.
- [x] **Destinations preserve identity.** Task → `/do/tasks/:permalink` for
      every state; Project → `/do/projects/:permalink`; Goal →
      `/do/goals/:permalink`; Resource → parent Project plus a stable
      `#resource-<id>` anchor on its Resources section; `UNPROCESSED` Inbox →
      `/do/inbox?item=<id>`; `ARCHIVED` Inbox →
      `/do/logbook?item=<id>`; Lens → existing active-Lens setter while
      remaining on the current route, matching today's Lens switcher.
      Destination pages add stable row ids plus scroll/highlight handling.
      Navigation closes the palette before route/Lens change.

### D. Sitewide-text query

- [x] **Tenancy-safe sitewide search.** Complete the existing
      `searchSite({ query })` operation.
      Every top-level model predicate and nested `TaskUpdate` predicate is
      independently scoped by `userId`. Case-insensitive substring search
      covers the fields below. Include every lifecycle state named in Product
      decision 3; do not filter by active Lens, Logbook date, or current view.

| Record    | Search fields                                                          |
| --------- | ---------------------------------------------------------------------- |
| Task      | `description`, `content`, `outcome`, user-owned `NOTE` updates' `body` |
| Project   | `name`, `description`                                                  |
| Goal      | `name`, `description`                                                  |
| Resource  | `title`, `url`, `notes`                                                |
| InboxItem | `text`, `title`, `content`, `sourceUrl`                                |

- [x] **Bounded input/output.** Trim whitespace; fewer than 2 characters yields
      no server search; reject over 100 characters; return at most 30 records
      total and at most 10 per record kind after cross-entity ranking.
      Client debounces 200ms, ignores stale responses, and keeps fixed/fuzzy
      results usable while text results load or fail.
- [x] **Bounded presentation and load timing.** Fetch the compact entity index
      only after an entitled user opens Command, cache it through React Query,
      and invalidate it after relevant record mutations. Typed results may
      contain 30 rows, but the popover viewport shows at most eight before
      scrolling. A fixture with 5,000 compact index records is included in a
      serialization/render benchmark so accidental full-prose payloads fail
      review.
- [x] **Useful, safe discriminated result shape.** Return record kind, `id`,
      destination/route data, display title, lifecycle state, optional Lens
      label/color, matched-field kind, and a plain-text excerpt capped at 140
      characters around the first match. Never return another user's data, raw
      HTML, attachment bytes, entire note history, or internal ranking/debug
      data. Coalesce one record matching multiple fields. Field precedence is
      label/title → primary body/description → outcome/notes → newest Task
      update; document it in one shared matcher helper.
- [x] **Deterministic merge.** Server order is exact title → title prefix → all
      query tokens in title → long-form match; ties use record-kind order,
      active-before-closed, recency, then stable id. Client Fuse results merge
      without duplicating server records and preserve the stronger match
      explanation. Selection stays attached to a stable result id between
      renders.
- [x] **Bounded retrieval without relevance loss.** Do not materialize every
      matching row from every model before applying the 30-result cap. Use
      indexed/database relevance ordering or a documented two-pass query that
      preserves older exact/prefix-title matches while bounding long-form
      candidates. Probe one row beyond every internal/final cap so `truncated`
      is truthful. Truncated UI says “More matches—refine your search.” Add a
      fixture proving both bounded delegate results and retrieval of an older
      exact title among many body matches.
- [x] **Result context.** Rows show record type, relevant lifecycle state, and
      Lens/parent context when one exists; long-form matches show a short
      excerpt capped at 140 characters with escaped highlight markup.
      Inbox rows distinguish Inbox vs Archived; other rows show parent context
      where useful. Empty results say “No matches” and leave Capture available
      as a separate command—not as an automatic fallback that could create
      accidental work.

### E. Entitlement boundary

- [x] **One shared access decision.** Client uses `useEntitled`; both server
      queries use `isEntitled` (including Founder and admin behavior) through a
      shared command-palette violation/helper. Do not call `isPlanActive`
      directly in feature code or duplicate plan enum checks.
- [x] **Free invocation is a paywall moment.** Cheatsheet keeps the `⌘\`
      binding visible with a quiet “Pro” note. Invoking it as FREE/expired PRO
      opens the normal palette shell containing existing `<ProGate>` copy:
      feature “Command palette and search”; reason “find and move through all
      your ActionAmp work from one place.” It is dismissible; there is no raw
      error, silent no-op, urgency copy, or separate hard-paywall modal.
- [x] **Server remains authoritative.** Direct calls by FREE/expired PRO receive
      `HttpError(402)` with the same structured entitlement message. No entity
      index or search result leaks before that check.

### F. Tests and documentation

- [x] **Server tests.** Cover every searched field on every model; all named
      lifecycle states; two-character and 100-character boundaries; global
      result cap; duplicate coalescing; deterministic cross-entity ranking;
      bounded delegate results; exact older records among many body matches;
      truthful truncation at database and final-merge caps;
      cross-user isolation on every top-level query and the nested TaskUpdate
      predicate; FREE, expired PRO, active PRO, Founder, and admin access.
- [x] **Component/hook tests.** Cover open from input focus, overlay precedence,
      fuzzy typo match, restrained empty state, async loading/error/empty states,
      stable selection across merged results, every result destination,
      Resource/Inbox anchors, archived-result destination, Lens switch,
      ProGate, focus restoration, and keyboard + pointer execution.
- [x] **E2E.** Active-paid `⌘\` opens Command and a Task result reaches its
      permalink; FREE invocation shows the calm gate; `⌘K` still opens Capture;
      Command remains suppressed in Working mode.
- [x] **Docs + build.** Update `ShortcutCheatsheet`, `FEATURES.md` F20/F22,
      `PAGES.md` overlays, feature catalog entry, and any public/pricing copy
      that claims narrower Logbook-only coverage. `wasp compile`, targeted
      Vitest, and targeted Playwright pass serially via `wasp-safe.sh`.
- [x] **Cold-context reviewer passes.** Review verifies product wording against
      actual query fields and routes—not only that an overlay appears.

## Non-goals

- Separate Search route or Logbook header search.
- Attachment filename, OCR, image, or binary-content search.
- Saved searches, filters, search operators, or command arguments.
- AI/semantic search, embeddings, typo correction for long-form prose, or
  PostgreSQL linguistic ranking.
- Destructive or state-mutating task/project/goal/resource commands.
- Command customization or shortcut rebinding.
- Search-query analytics, server logging, or recently-used sync.

## Follow-up triggers

- If users fail to find known words because substring matching is insufficient,
  write a separate indexed PostgreSQL-search spec with measured query corpus and
  latency targets; do not silently grow this build into search infrastructure.
- If attachment search is repeatedly requested, write a separate ingestion/OCR
  spec with privacy, storage, indexing, and deletion behavior.
- If palette use shows repeated multi-step mutations, promote only measured,
  reversible actions into a new command-actions spec.

## Prototypes

None required. Reuse the decided capture-popover shell and design-system rows;
implementation review must include narrow desktop and touch-width screenshots.
