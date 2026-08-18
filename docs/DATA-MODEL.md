# ActionAmp — Data Model & Triage Flow

> Status: DRAFT v6 — GTD + PARA flavor; Areas replaced by Goals. Code-verified
> against `webapp/schema.prisma` 2026-07-05.
> **Structural authority has moved to `WORKFLOW.md`** (2026-06-23) for _where
> things live_ (the §4 list below). Confirmed against the locked decisions:
>
> - **`InboxItem` stays unscoped** (no `lensId`) — capture is universal; the
>   Lens is assigned at triage (inheriting the active lens).
> - **`Task.status` keeps `UPCOMING`** — used by the snooze flow. It surfaces as
>   the `/do/upcoming` top-level Planning nav item (date-bucketed). (Framing
>   flipped 2026-07-05; the Today bench was dropped — see `WORKFLOW.md` §5.1.)
> - **Someday moves under the Planning Area** in nav grouping (the `SOMEDAY`
>   status and `/do/someday` route are unchanged).
>
> The entity hierarchy (§1), triage transformations (§3), and focus ranking (§5–§7)
> below remain the data-model authority.
>
> Core idea: **the Inbox is universal; every item is a seed that becomes
> something during triage.** The triage step decides _what kind of thing_ it is,
> not just what date it has.
>
> v3: **Goals replace PARA's Areas** as the organizing layer (Goals are active /
> outcome-oriented; Areas are passive buckets — this app is about action).
> **Lens** (Work / Me by default, plus user-defined on Pro) is the top-level
> scoping switch. See `METHODOLOGY.md` for the full GTD/PARA mapping.
> Naming: the Work/Me switch is called **Lens** (not "Context") to avoid
> colliding with GTD's "@context" (errands/phone — which we use Tags for).
>
> **Lenses are user-defined on Pro.** A Lens name expresses its meaning; there
> is no Personal/Work/Custom category layered above its behavioral type.
> Neutral default/included flags protect seeded and Free-plan behavior.
> `Lens.purpose` adds
> one short line ("what this lens is for"). Lens configuration (create/rename/
> recolor/edit-purpose/delete) is Pro-only; FREE gets the seeded two (Me usable,
> Work visible-but-locked). See `docs/specs/done/custom-lenses.md`.
>
> v5 (2026-07-04): **Capture grammar v2.** The NL sigils are reorganized: `#`
> is tags (was: project + tags), `@` is time only (was: tags + time), `[[lens]]`
> is the new explicit lens override, `!`/`~` unchanged. Projects are matched
> from free text by a resolver (no sigil). `InboxItem.parsedLens` stores the
> `[[ ]]` token (null when absent or unknown). The legacy `parsedProject` field
> stays on the model but is no longer populated by the v2 parser — the resolver
> works off the cleaned text directly. The InboxItem remains unscoped; the lens
> is confirmed at triage. See `docs/specs/done/capture-grammar.md`.
>
> v6 (2026-07-05): **Task lifecycle logging.** `TaskUpdate` gained a `kind`
> discriminator (`TaskUpdateKind = NOTE | COMPLETED`); completing a task now
> appends a typed `COMPLETED` row alongside the existing `Task.completedAt`.
> `TaskSession` (startedAt/endedAt) was added for focus-segment accounting —
> start/pause/complete maintain rows so the focus clock's "total" is honest
> across interruptions. **`Project.order`** (Int) added for goal-scoped
> sequencing — projects under a goal sort by `order` then name; the first
> non-done project surfaces as "Next: <name>". See `docs/specs/task-notes-
completion-log.md` and `docs/specs/done/goal-planning.md`.
>
> v7 (2026-08-07): **Recorded focus sessions.** `User.focusSessionMinutes`
> stores the 25/45-minute preference. `TaskSession.plannedMinutes` records the
> selected duration at session start, while `TaskSession.completed` distinguishes
> a full countdown from a manual pause. Timer completion closes the session but
> leaves the Task in focus; Task completion remains a separate action.
>
> v8 (2026-08-08): **Saved Review rhythms.** `Review` stores a user's
> DAILY/WEEKLY/MONTHLY reflection by normalized period, with optional autosaved
> answers and a stable accomplishment snapshot when Today is closed. Three `User` booleans independently
> enable Today, Week, and Month reviews. Cadence review reads are deliberately
> cross-Lens; ownership remains strictly keyed by `userId`.
>
> v9 (2026-08-08): **Check-in vs. review.** `Review.answers` keeps separate
> runtime-validated keys for observations made during an active period and
> retrospective answers written after it ends. Transitioning a period never
> replaces its earlier check-in.
>
> v10 (2026-08-10, superseded 2026-08-18): **Typed Lenses and direct
> checklists.** Originally shipped as `Lens.type`
> (`LIFE_AREA` | `SIMPLE_LIST`); a `ListItem` belonged to one Simple-list Lens.
> v13 below supersedes this — simple lists are a Project type now.
>
> v13 (2026-08-18): **Simple lists are a Project type.** `LensType` is
> removed — every Lens is a life area. `Project.type`
> (`STANDARD` | `SIMPLE_LIST`) owns the checklist behavior: a Simple-list
> Project contains ListItems (re-homed `lensId` → `projectId`) and nothing
> else. It lives in a Lens, sits on the Projects page, opens at its project
> URL, and never participates in Today, focus, Review, or Logbook.
>
> v11 (2026-08-16): **Attachment carry across triage.** `TaskAttachment`,
> `ProjectAttachment`, and `ResourceAttachment` (all the same shape as
> `InboxAttachment`/`ListItemAttachment`) hold captured images that triage
> moves onto the created entity — the seed `InboxItem` delete no longer
> cascades the blobs away on any dispatch decision (task today/upcoming/
> someday, project, resource, or list-item). Served by the same owner-gated
> `/api/attachments/:id` (and the CLI twin), and displayed on the task detail
> page, the project detail header, and resource rows.

---

## 1. The entity hierarchy

```
  Lens              ← Work/Me (defaults) + user-defined on Pro
                   carries identity color + purpose (a life area — no type since 2026-08-18)
   └─ Goal        ← the organizing layer — replaces PARA's Areas
        └─ Project ← an outcome that needs >1 step  [PARA Project / GTD outcome]
                   (Projects under a Goal sort by `Project.order` then name;
                    type: STANDARD | SIMPLE_LIST)
             ├─ ProjectAttachment ← captured image carried onto the project by triage
             ├─ Task        ← an atomic action (THE focus candidate; STANDARD only)
             │    ├─ TaskUpdate   ← append-only notes/activity log (kind = NOTE | COMPLETED)
             │    ├─ TaskSession  ← recorded focus session (start/end, planned minutes, completed)
             │    └─ TaskAttachment ← captured image carried onto the task by triage
             ├─ Resource    ← reference material, not an action  [PARA Resource] (STANDARD only)
             │    └─ ResourceAttachment ← captured image carried onto the resource by triage
             └─ ListItem    ← checklist row (SIMPLE_LIST only: title, order, completedAt)
                              + ListItemAttachment

  Tag             ← GTD "@context": #errands, #phone, ~15m, low-energy
                     (focus refinements — Phase 2 nuance; `#`-prefixed at capture per grammar v2)
  Archive         ← PARa's A: completed/dead items  [Logbook]
  Inbox           ← GTD's Inbox: universal, single queue
  Review          ← saved daily/weekly/monthly reflection + stable evidence snapshot
```

**Atomic vs. container:**

- **Task** = an action. Has due date, **priority** (Low / Normal / Important),
  **size** (S / M / L / XL — see below), and status. This is what the focus
  engine surfaces. (GTD "next action".)
- **Project** = an outcome. A container for Tasks + Resources. Can itself be dated.
  **Projects are never nested** (a Project contains Tasks + Resources only — no
  sub-Projects). (PARA "Project".)
- **Resource** = non-actionable material. In the MVP this means **links + notes
  (bookmarks)**. **Every Resource is filed under exactly one Project** —
  there are no loose/top-level Resources. Never surfaced by the focus engine.
  (PARA "Resource".)
- **Goal** = the organizing layer — **replaces PARA's Areas.** Active &
  outcome-oriented ("Run a 10k", "Ship product v2") rather than passive buckets
  ("Health", "Work"). Projects link to a Goal to express _why_ they matter;
  Tasks do not align directly to Goals.
- **Lens** = the top-level switch — a life area. Every Goal, Project,
  standalone Task, and Resource belongs to exactly one Lens.
- **ListItem** = one directly managed checklist row inside a Simple-list
  Project. It has a title, stable order, completion timestamp, ownership
  through its Project, and optional image attachments. It has no Task
  scheduling, hierarchy, priority, size, focus, triage, or review semantics.
- **Archive** = where completed/dead items go. (PARA "Archive" / our Logbook.)
- **Tag** = GTD "@context" — cross-cutting labels for focus refinement.
- **Review** = one user-owned cadence/period record. `answers` and `snapshot`
  are JSON; `snapshot` preserves names, Outcomes, hierarchy/Lens labels, and
  completion timestamps as they appeared when the review was recorded.

**Priority** (Low / Normal / Important) is the primary sort key for focus.
**Size** (S / M / L / XL) is the secondary signal and a built-in nudge:
setting a Task to **XL prompts you to break it down** (convert it to a Project,
or add subtasks) — XL work shouldn't sit as a single Task. Time/energy tags are
a refinement layer we'll add later, on top of priority + size.

---

## 2. The universal Life-area Inbox

- **Exactly one** Inbox across all Lenses. Universal capture lands here;
  direct Simple-list creation bypasses it.
- An inbox entry is an **InboxItem**: raw text + parsed metadata — `parsedDate`,
  `parsedPriority`, `parsedSize`, `parsedTags`, `parsedProject` (legacy, unused
  by the server — see v5 below), `parsedLens` (the `[[lens]]` token, or null),
  and optional explicit `parsedProjectId` / `parsedLensId` pre-triage destination
  hints —
  - `status: unprocessed`. The InboxItem itself is still **unscoped** (no
    `lensId`); `parsedLens` is a _hint_ that pre-fills the triage Context step,
    not an assignment. Capture is universal across eligible Lenses; destination
    and compatible output type are confirmed at triage.
- Nothing leaves the Inbox by aging or by being dated — it only leaves through **triage**.

---

## 3. Triage — what an InboxItem can _become_

During triage, each InboxItem is transformed into one of the following. Lens
type controls which outcomes are eligible:

| Triage decision                                     | Result                                            | Example                                          |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| **"This is a quick action"**                        | → **Task** (standalone, dated)                    | "Email Sarah re: invoice" → Today                |
| **"This is actually a big outcome"**                | → **Project** (the text becomes the Project name) | "Plan Q3 launch" → new Project                   |
| **"This is a step in something I'm already doing"** | → **Task** inside an existing **Project**         | "Draft press release" → "Q3 launch" project      |
| **"This is reference, not an action"**              | → **Resource** filed under a **Project**          | "Competitor pricing PDF" → "Q3 launch" resources |
| **"This supports a bigger goal"**                   | → **Project** linked to a **Goal**                | "Launch newsletter" → Goal: "Grow audience"      |
| **"This belongs on a simple checklist"**           | → **ListItem** in a **Simple-list Project**      | "Buy oat milk" → Shopping list                   |

So the InboxItem is **polymorphic at rest, concrete after triage.** A Life-area
destination uses structured outcomes; a Simple-list destination uses only
ListItem. Direct add remains a second ListItem creation path.

### Promotion paths (items leveling up)

An item isn't locked into its first decision:

- **Task → Project:** "Huh, this is actually big" → promote the Task into a
  Project (its subtasks become the Project's Tasks). **This is exactly the path
  the XL-size nudge encourages.**
- **Resource → Task:** "Actually I need to act on this" → promote into a Task.
- **Task → Resource:** "Not doing this, but keeping the link" → demote.

### Demotion / filing

- **Task → Someday:** keep it, stop nagging, no date.
- **Anything → Archive (lossless):** the InboxItem is marked `ARCHIVED`
  (stamps `archivedAt`), not deleted. It leaves the inbox (which filters
  `UNPROCESSED`) and surfaces in the Logbook's Archived section, restorable to
  the inbox. Capture should never be punishing.

---

## 4. Where things live after triage (the "lists")

Once triaged, items live in views defined by their attributes — _not_ by folders:

- **Today** — Tasks with `due <= today` or manually flagged Today. _(Capped — see FEATURES §12.)_
- **Upcoming** — Tasks/Projects with a future date.
- **Someday** — Tasks with no date and no Project (GTD "Someday/Maybe").
- **Projects** — all Projects, grouped by Goal.
- **Goals** — all Goals in the active Lens, with their linked Projects rolled up.
- **Archive / Logbook** — completed/dead items (PARA "Archive").

The Inbox is the only intake queue. A Simple-list Project is an explicit
exception: its List Items form a directly managed checklist, not a derived view.

---

## 5. Implications for the focus engine ("Next")

The matcher only ever considers **Tasks** (never List Items, Resources, or
bare Projects):

- A **Task** inside a **Project** is a candidate.
- A **Project** with no Tasks is invisible to focus (it's a container, not an action) — though the UI can show "this Project has no next action" as a nudge.
- A **Goal** is never surfaced directly; it's shown as supporting detail through
  a Project ("Email Sarah · DOL Hunt · supports: Grow audience").

---

## 6. The Lens switch

- **Default Lenses: `Work` and `Me`.** **User-defined lenses ship on Pro**
  (shipped 2026-07-03; was Phase 2): create / rename / recolor / edit-purpose /
  delete at `/do/settings/lenses`. FREE gets the seeded two — Me usable, Work
  visible-but-locked.
- In the active Lens, Projects, Goals, Tasks, Resources, and the
  focus engine are scoped normally. A Simple-list Project is just a Project
  page — there is no checklist shell mode (removed 2026-08-18).
- Switching Lens is one keystroke — **`⌘L`** (or chip+popover at ≥4 lenses).
  Active-lens state keys on `Lens.id` (not name) since 2026-07-03.
- **Cross-lens exceptions** (an overdue Work item surfacing while you're in Me)
  are Phase 2; MVP is strict — only the active Lens's items are candidates.
- **`Lens.color`** (nullable string, added 2026-06-30) — an identity palette key
  (`"indigo"` for Work, `"emerald"` for Me). Seeded in `ensureOnboarded` and
  backfilled onto existing lenses on next load. Surfaces the active context via
  `<html data-lens>` → `--aa-active-lens-*` CSS tokens (see `WORKFLOW.md` §3 and
  `styles/tokens.css`). Identity only; never system/state.

## 7. Focus ranking — MVP rule (simple, by priority)

The "Next" engine, in its simplest form:

1. Candidates = **Tasks** in the **active Lens** that are Today/overdue.
2. Sort by **priority** (highest first).
3. Surface the top 1 (max 3). Done.

That's it for MVP. No energy/time/tag filtering yet — **priority is the signal.**
We'll add refinement layers (time-available, energy, effort) on top once the
basic loop works.

---

## 8. Decisions locked (2026-06-15)

- ✅ **Goals are first-class in MVP** (create / triage-to / roll-up view).
- ✅ **No loose Resources** — every Resource is filed under exactly one Project
  or Goal.
- ✅ **No nested Projects** — a Project contains Tasks + Resources only.
- ✅ **MVP Resources** = links + notes (bookmarks). General file uploads remain
  Phase 2; a single image shared from Android/Chrome is retained as an
  `InboxAttachment` until it is triaged.
- ✅ **Priority scale** = **Low / Normal / Important** (3 levels).
- ✅ **Size scale** = **S / M / L / XL**, with **XL prompting a break-down**
  (→ convert to Project, or add subtasks). _(InboxItem retention still open —
  see below.)_

### Added 2026-06-16 (triage design)

- ✅ **Task defaults:** Size=M, Priority=Normal, **When=Upcoming** (revised
  2026-06-25: triaging lands on the actionable bench, not buried in Someday;
  triaging never auto-clutters Today — promoting to Today is explicit). The
  `status` column default stays `SOMEDAY` as a DB safety net; triage always
  sets status explicitly.
- ✅ **Project is optional; "General" = no projectId.** A Task with no Project
  is a "General" task in its Lens context (Work general, Me general). Every Task
  requires a Lens; Project is optional. There is no global "General" bucket —
  Generals are scoped per Lens.
- ✅ **Triage = co-authoring the spec.** An InboxItem is raw text with parser
  guesses (date/priority/size/project/tags). Triage is the act of committing
  to those properties (or editing them), then confirming what it becomes.
  Properties are not pre-known; they are assigned during triage.

### Added 2026-06-30 (daily rollover)

- ✅ **Today rolls to Upcoming daily.** `User.lastTodayRolloverAt` (nullable
  `DateTime`) tracks the last calendar day the rollover ran. `getAppData`
  checks it on every load: if it's a new day (or null), every incomplete
  `status=TODAY, isDone=false` task bulk-flips to `UPCOMING` and the timestamp
  is stamped. Lazy (no cron), idempotent within a day. See `WORKFLOW.md` §5.7
  for the full decision.

## 9. Still open

- **InboxItem retention** — **DECIDED: delete on transform** (the transformed
  entity _is_ the record; Archive is the lossless path for "not now"). This has
  been the shipped behavior since the triage wizard landed.
- **Goal/Project lifecycle** — **DECIDED + SHIPPED 2026-07-05**: complete /
  reopen / edit / delete (lossless) / re-link all exist as server ops + UI on
  the Goal + Project detail pages and the Logbook; `Project.order` drives an
  explicit sequence under each Goal. See `goal-planning.md`.
