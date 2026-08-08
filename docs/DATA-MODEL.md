# ActionAmp — Data Model & Triage Flow

> Status: DRAFT v6 — GTD + PARA flavor; Areas replaced by Goals. Code-verified
> against `webapp/schema.prisma` 2026-07-05.
> **Structural authority has moved to `WORKFLOW.md`** (2026-06-23) for *where
> things live* (the §4 list below). Confirmed against the locked decisions:
>
> - **`InboxItem` stays unscoped** (no `lensId`) — capture is universal; the
>   Lens is assigned at triage (inheriting the active lens).
> - **`Task.status` keeps `UPCOMING`** — used by the snooze flow. It surfaces as
>   the `/app/upcoming` top-level Planning nav item (date-bucketed). (Framing
>   flipped 2026-07-05; the Today bench was dropped — see `WORKFLOW.md` §5.1.)
> - **Someday moves under the Planning Area** in nav grouping (the `SOMEDAY`
>   status and `/app/someday` route are unchanged).
>
> The entity hierarchy (§1), triage transformations (§3), and focus ranking (§5–§7)
> below remain the data-model authority.
>
> Core idea: **the Inbox is universal; every item is a seed that becomes
> something during triage.** The triage step decides *what kind of thing* it is,
> not just what date it has.
>
> v3: **Goals replace PARA's Areas** as the organizing layer (Goals are active /
> outcome-oriented; Areas are passive buckets — this app is about action).
> **Lens** (Work / Me by default, plus user-defined on Pro) is the top-level
> scoping switch. See `METHODOLOGY.md` for the full GTD/PARA mapping.
> Naming: the Work/Me switch is called **Lens** (not "Context") to avoid
> colliding with GTD's "@context" (errands/phone — which we use Tags for).
>
> v4 (2026-07-03): **Lenses are user-defined on Pro.** A `LensKind` enum tags
> each lens — `PERSONAL`/`WORK` for the seeded two, `CUSTOM` for user-defined.
> The kind (not the name) is the stable handle the entitlement guard branches
> on, so renaming a seeded lens can't escape FREE gating. `Lens.purpose` adds
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
> completion-log.md` and `docs/specs/done/goal-planning.md`.
>
> v7 (2026-08-07): **Recorded focus sessions.** `User.focusSessionMinutes`
> stores the 25/45-minute preference. `TaskSession.plannedMinutes` records the
> selected duration at session start, while `TaskSession.completed` distinguishes
> a full countdown from a manual pause. Timer completion closes the session but
> leaves the Task in focus; Task completion remains a separate action.

---

## 1. The entity hierarchy

```
  Lens            ← the scoping switch: Work/Me (defaults) + user-defined on Pro
                   carries a stable kind (PERSONAL/WORK/CUSTOM) + identity color + purpose
   └─ Goal        ← the organizing layer — replaces PARA's Areas
        └─ Project ← an outcome that needs >1 step  [PARA Project / GTD outcome]
                   (Projects under a Goal sort by `Project.order` then name)
             ├─ Task        ← an atomic action (THE focus candidate)
             │    ├─ TaskUpdate   ← append-only notes/activity log (kind = NOTE | COMPLETED)
             │    └─ TaskSession  ← recorded focus session (start/end, planned minutes, completed)
             └─ Resource    ← reference material, not an action  [PARA Resource]

  Tag             ← GTD "@context": #errands, #phone, ~15m, low-energy
                     (focus refinements — Phase 2 nuance; `#`-prefixed at capture per grammar v2)
  Archive         ← PARa's A: completed/dead items  [Logbook]
  Inbox           ← GTD's Inbox: universal, single queue
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
  ("Health", "Work"). Projects link to a Goal to express *why* they matter;
  Tasks do not align directly to Goals.
- **Lens** = the scoping switch (Work / Me). **Every Goal, Project, and
  standalone Task belongs to exactly one Lens.** Switching Lens re-scopes the
  whole UI and the focus engine.
- **Archive** = where completed/dead items go. (PARA "Archive" / our Logbook.)
- **Tag** = GTD "@context" — cross-cutting labels for focus refinement.

**Priority** (Low / Normal / Important) is the primary sort key for focus.
**Size** (S / M / L / XL) is the secondary signal and a built-in nudge:
setting a Task to **XL prompts you to break it down** (convert it to a Project,
 or add subtasks) — XL work shouldn't sit as a single Task. Time/energy tags are
 a refinement layer we'll add later, on top of priority + size.

---

## 2. The universal Inbox

- **Exactly one** Inbox. All capture (quick-add, email-in, etc.) lands here.
- An inbox entry is an **InboxItem**: raw text + parsed metadata — `parsedDate`,
  `parsedPriority`, `parsedSize`, `parsedTags`, `parsedProject` (legacy, unused
  by the server — see v5 below), `parsedLens` (the `[[lens]]` token, or null) —
  + `status: unprocessed`. The InboxItem itself is still **unscoped** (no
  `lensId`); `parsedLens` is a *hint* that pre-fills the triage Context step,
  not an assignment. Capture is universal; the lens is confirmed at triage.
- Nothing leaves the Inbox by aging or by being dated — it only leaves through **triage**.

---

## 3. Triage — what an InboxItem can *become*

This is the heart of the model. During triage, each InboxItem is transformed into one of:

| Triage decision | Result | Example |
|---|---|---|
| **"This is a quick action"** | → **Task** (standalone, dated) | "Email Sarah re: invoice" → Today |
| **"This is actually a big outcome"** | → **Project** (the text becomes the Project name) | "Plan Q3 launch" → new Project |
| **"This is a step in something I'm already doing"** | → **Task** inside an existing **Project** | "Draft press release" → "Q3 launch" project |
| **"This is reference, not an action"** | → **Resource** filed under a **Project** | "Competitor pricing PDF" → "Q3 launch" resources |
| **"This supports a bigger goal"** | → **Project** linked to a **Goal** | "Launch newsletter" → Goal: "Grow audience" |

So the InboxItem is **polymorphic at rest, concrete after triage.** One input shape, five possible output shapes.

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

Once triaged, items live in views defined by their attributes — *not* by folders:

- **Today** — Tasks with `due <= today` or manually flagged Today. *(Capped — see FEATURES §12.)*
- **Upcoming** — Tasks/Projects with a future date.
- **Someday** — Tasks with no date and no Project (GTD "Someday/Maybe").
- **Projects** — all Projects, grouped by Goal.
- **Goals** — all Goals in the active Lens, with their linked Projects rolled up.
- **Archive / Logbook** — completed/dead items (PARA "Archive").

The Inbox is the *only* queue. Everything else is a *view* derived from each item's attributes and relationships.

---

## 5. Implications for the focus engine ("Next")

The matcher only ever considers **Tasks** (never Resources, never bare Projects):

- A **Task** inside a **Project** is a candidate.
- A **Project** with no Tasks is invisible to focus (it's a container, not an action) — though the UI can show "this Project has no next action" as a nudge.
- A **Goal** is never surfaced directly; it's shown as supporting detail through
  a Project ("Email Sarah · DOL Hunt · supports: Grow audience").

---

## 6. The Lens switch

- **Default Lenses: `Work` and `Me`.** **User-defined lenses ship on Pro**
  (shipped 2026-07-03; was Phase 2): create / rename / recolor / edit-purpose /
  delete at `/app/settings/lenses`. FREE gets the seeded two — Me usable, Work
  visible-but-locked.
- **Everything is scoped by the active Lens:** the Projects you see, the Goals
  you see, and — critically — **what the focus engine considers.**
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
  (→ convert to Project, or add subtasks). *(InboxItem retention still open —
  see below.)*

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
  entity *is* the record; Archive is the lossless path for "not now"). This has
  been the shipped behavior since the triage wizard landed.
- **Goal/Project lifecycle** — **DECIDED + SHIPPED 2026-07-05**: complete /
  reopen / edit / delete (lossless) / re-link all exist as server ops + UI on
  the Goal + Project detail pages and the Logbook; `Project.order` drives an
  explicit sequence under each Goal. See `goal-planning.md`.
