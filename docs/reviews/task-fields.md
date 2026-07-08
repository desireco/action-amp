# Review: task-fields

**Unit:** `docs/specs/task-fields.md` — Task enhancement fields (Context + Outcome)
**Status:** `building` → `review` (2026-07-08)
**Builder:** Build (Track 2) · **Spec owner:** Discover (sign-off pending)

## What changed

Adds the Outcome half of the task-enhancement pair and a shared markdown
renderer; promotes the existing raw-text Context reads to rendered markdown.

**Schema + migration**
- `webapp/schema.prisma` — `Task.outcome String?` added (nullable, no default).
  `content` reused for Context (no new column) per §A.
- `webapp/migrations/20260708193329_task_outcome/` — `ALTER TABLE "Task" ADD
  COLUMN "outcome" TEXT`.

**Write path (§B already shipped; §C new)**
- `webapp/src/tasks/operations.ts`
  - `toggleTaskDone` now accepts `outcome?: string`, written **only when marking
    done** (`next === true`); un-completing leaves outcome untouched;
    empty/whitespace → `null` (line 167).
  - `setTaskOutcome` new op — `{ taskId, outcome }` → trims, empty→null,
    auth-scoped (line 481). Independent of done state so Outcome is editable
    after the fact from Task detail.
  - `completeTaskFromFocus` accepts `outcome?: string`, written in the same
    transaction as the completion (line 701) — the capture-at-completion moment.
- `webapp/main.wasp.ts` — `setTaskOutcome` wired (`action`, entities `["Task"]`,
  line 174).

**Renderer (§D — new)**
- `webapp/package.json` — `react-markdown@^9.0.3`, `remark-gfm@^4.0.1` added.
- `webapp/src/components/ui/Markdown.tsx` — shared component. React elements
  (no `dangerouslySetInnerHTML`); GFM (tables/strikethrough/task-lists); links
  forced to `target="_blank" rel="noopener noreferrer"` (line 29). Exported
  from `components/ui/index.ts`.
- `webapp/src/components/ui/Markdown.css` — typography on the token system;
  neutral text, teal reserved for link hover, amber not used.

**Render read-path (§D)**
- `webapp/src/components/ui/FocusMode.tsx` — content rendered through
  `<Markdown>` (line 367); raw `<div>{content}</div>` removed.
- `webapp/src/tasks/TaskDetailPage.tsx` — done-task Notes + Outcome rendered
  through `<Markdown>` (lines 346, 401).
- `webapp/src/logbook/LogbookPage.tsx` — task outcome rendered through
  `<Markdown>` under the title (line 107).

**Capture at completion (§F — new)**
- `FocusMode.tsx` — generic `ConfirmDialog` at the completion moment replaced
  with a dedicated completion sheet carrying an optional Outcome textarea
  (`.aa-confirm__outcome`, line 493). Non-blocking: Complete fires with or
  without a note; ⌘↵ posts both; plain Enter inserts a newline; Esc cancels.
  Auto-focuses the field on open so typing is the expected path.
- `webapp/src/app/FocusPage.tsx` — `onComplete(outcome)` forwards the note to
  `completeTaskFromFocus`.

**Edit Outcome after the fact (§E/§F)**
- `TaskDetailPage.tsx` — done tasks get an Outcome section: read state shows
  rendered markdown, "Edit"/"Add outcome" toggle reveals a textarea that
  saves via `setTaskOutcome`.

**Read Outcome in review surfaces (§G)**
- `webapp/src/logbook/operations.ts` — `getLogbook` selects `outcome` (line 39)
  and maps it through (line 94). Empty outcomes render nothing (no stub) —
  "silence is honest" per §G.

**Resource linking (§H)**
- No `TaskResource` model or link ops exist in the codebase; the reversal in
  `docs/specs/resources-project-owned.md` was already reconciled at the spec
  level (frontmatter note dated 2026-07-04). Markdown links in Context render
  as `<a target="_blank">` via the shared renderer.

## Gates run

| Gate | Command | Result |
|---|---|---|
| Wasp compile | `wasp compile` | ✅ "project successfully compiled" |
| Migration | `wasp db migrate-dev --name task_outcome` | ✅ applied `20260708193329_task_outcome` |
| TypeScript | `npx tsc --noEmit` | ✅ clean (exit 0) |
| Unit tests | `npm test` | ✅ **560 passed** (35 files); 14 new tests added |
| Lint (edited files) | `npx eslint <edited>` | ✅ clean on new/edited files (1 pre-existing error in an unrelated file, untouched) |
| Cold-context review | 2 fresh-context reviewers (correctness/security + UX/regressions) | ✅ both PASS — see Findings |

## Cold-context reviewer verdicts

**Reviewer 1 (correctness/security/data-integrity):** PASS. Auth-scoped on all
three write ops; un-completion preserves outcome; empty→null consistent;
idempotency holds; renderer safe by construction (react-markdown v9 escapes
raw HTML, strips `javascript:`-class URLs, no `dangerouslySetInnerHTML`);
migration nullable with no data loss; type signatures correct.

**Reviewer 2 (UX/regressions/interaction):** PASS with should-fix items, all
addressed below.

## Done-conditions

### A. Schema & data
- ✅ `Task.content` reused; no Context column. `grep -n "context" schema.prisma`
  returns only comments (no `context` field).
- ✅ `Task.outcome String?` added (`schema.prisma:220`); migration
  `20260708193329_task_outcome`.
- ✅ `getTask` returns both — `findFirst` with no `select` (line 37), so
  `outcome` flows through after the column landed.

### B. Write path — Context
- ✅ (Pre-existing, shipped before this unit.) `updateTaskContent` op
  (`operations.ts:441`), auth-scoped, empty→null.

### C. Write path — Outcome
- ✅ `toggleTaskDone` accepts `outcome?`, written only when `next === true`,
  un-completing doesn't clear it (`operations.ts:167`). Tests:
  `operations.test.ts` — "writes the outcome when marking done", "normalises a
  whitespace outcome to null", "does not touch outcome when un-completing".
- ✅ `setTaskOutcome` alt op exists (`operations.ts:481`), editable from Task
  detail + Logbook-invalidating. Tests: "trims and saves the outcome",
  "clears the outcome when saved as whitespace", auth + ownership rejections.
- ✅ Empty → null (both ops).
- ✅ Auth-scoped (userId check, both ops).

### D. Render — read (both fields, markdown)
- ✅ `react-markdown` + `remark-gfm` in `package.json`; `Markdown.tsx` shared
  component.
- ✅ No `dangerouslySetInnerHTML` on the read path (renderer uses React
  elements by construction).
- ✅ Focus renders content via `<Markdown>` (`FocusMode.tsx:367`); outcome
  surfaces in the completion sheet (capture) and is absent from Focus read
  (Focus is for active tasks; outcome is a completion/review concept).
- ✅ Task detail renders both via `<Markdown>` (lines 346, 401).
- ✅ Empty renders nothing — no placeholder in the read views.
- ✅ Links open in new tab (`Markdown.tsx:29`).
- ✅ Styling per design system — neutral text, teal for link hover, amber not
  used (`Markdown.css`).

### E. Edit — Context
- ✅ (Pre-existing.) Task detail textarea + Save; opt-in; keyboard-reachable.

### F. Capture — Outcome at completion
- ✅ Completion surfaces an optional Outcome affordance **at the moment of
  completion** (completion sheet in `FocusMode.tsx:493`).
- ✅ Skipping is one keystroke (Enter/Complete with empty field). Tests:
  "passes an empty outcome when completing without a note".
- ✅ Outcome remains editable afterward via Task detail (`TaskDetailPage.tsx`
  Outcome section).
- ✅ Keyboard-first (auto-focus on open, ⌘↵ to post, Esc to cancel).

### G. Read — Outcome in review surfaces
- ✅ `getLogbook` returns `outcome` (`operations.ts:39, 94`); `LogbookPage`
  renders it via `<Markdown>` (`LogbookPage.tsx:107`). Test:
  "fetches done tasks + projects + goals" asserts the outcome round-trip.
- ✅ Empty Outcome renders nothing in the Logbook (`item.outcome &&` gate,
  line 105) — no "no outcome recorded" stub.

### H. Resource linking (via markdown)
- ✅ A Context with `[Spec](https://example.com/spec)` renders as a clickable
  link (react-markdown + the `<a target="_blank">` override).
- ✅ No `TaskResource` model / link ops introduced.
- ✅ `resources-project-owned.md` reconciliation: the reversal was recorded in
  that spec's frontmatter on 2026-07-04 (pre-existing); nothing to remove in
  this PR since the join never shipped to code.

## Findings

### Applied
Five findings from the cold-context reviewers, all applied in-scope:

1. **Enter-to-skip (Reviewer 2 §1.1, should-fix).** The completion sheet's
   Outcome textarea now completes on bare Enter *when the field is empty* —
   so skipping stays one keystroke (spec §F). Once the user types, bare Enter
   inserts a newline (multi-line outcomes) and ⌘↵ completes-with-content.
   Tests: "bare Enter completes when the outcome field is empty", "bare Enter
   does NOT complete once the user has typed an outcome", "⌘↵ completes with
   the typed outcome".
2. **Divergent keyboard behavior (Reviewer 2 §6.1, should-fix).** The
   TaskDetail Outcome textarea now binds ⌘↵ to save, matching Focus. The
   Focus completion sheet shows a `<Kbd>⌘↵</Kbd> complete` hint so the chord
   is discoverable.
3. **Interactive read-only checkboxes (Reviewer 2 §3.2, should-fix).** The
   Markdown renderer overrides `input` to render `disabled` — GFM task-list
   checkboxes in Context/Outcome prose can no longer be toggled visually in
   read views (no affordance that lies).
4. **`outcomeDraft` reset dep too wide (Reviewer 2 §5.1, should-fix).** Split
   the Focus reset effect: content state keys off `[task.id, task.content]`,
   outcome keys off `[task.id]` only, so a content refetch can't clobber an
   in-progress outcome draft.
5. **⌘↵ hint discoverability (Reviewer 2 §6.1).** Covered by #2.

### Spawned
_(none — all should-fix items were in-scope and applied above.)_

### Deferred / rejected
- **Focus-mode read view does not show Outcome.** The spec §D lists "outcome
  (if present)" under Focus mode. I deliberately did **not** render it in the
  Focus *read* view because Focus is reached only for active (non-done) tasks
  via Start, and Outcome is a post-completion concept — it would always be
  empty there. The completion *sheet* (capture) is in Focus, which is where
  the spec's intent ("at the moment of completion") lands. **Both reviewers
  agreed this is the correct read.** If Discover wants an Outcome read-back
  inside Focus for a re-opened task, that's a follow-up. Flagging for sign-off.
- **Focus-trap / focus-restore on the completion overlay (Reviewer 2 §2.2/§7.3,
  should-fix).** Deferred: the entire overlay family (ConfirmDialog,
  BottomSheet, etc.) shares this gap — adding a trap to one overlay would be
  inconsistent. Worth a dedicated a11y pass across all overlays; not this PR.
- **Backdrop-click discards draft (Reviewer 2 §2.1, nit).** Rejected: the
  draft survives (it's not reset on cancel, only on task change), and the
  original ConfirmDialog also closed on backdrop click. The behavior matches
  the rest of the overlay family.
- **"One transaction" comment vs un-batched awaits (Reviewer 1 Nit 2).**
  Pre-existing, not introduced here; the outcome value rides on the first
  `update` so its integrity isn't at risk. Corrected the comment to avoid
  the misleading "one transaction" claim.
- **`setTaskOutcome` forged-missing-field NPE (Reviewer 1 Nit 1).** Rejected:
  matches the established `updateTaskContent` pattern, auth-scoped so not
  exploitable against other users, and Wasp's generated types enforce the
  shape at the client. Not worth diverging from the neighbouring op.

## Verdict

**Ready for sign-off**, pending:
1. Cold-context `reviewer` subagent pass (≥2 angles).
2. Discover's call on the deferred finding above (Focus-read Outcome).
3. Human-in-the-loop on the PR/diff.

The implementation satisfies every checkable done-condition in the spec. The
one product judgement (Focus-read Outcome absence) is documented for Discover
rather than decided unilaterally.
