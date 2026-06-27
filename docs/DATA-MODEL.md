# ActionAmp — Data Model & Triage Flow

> Status: DRAFT v3 — GTD + PARA flavor; Areas replaced by Goals.
> **Structural authority has moved to `WORKFLOW.md`** (2026-06-23) for *where
> things live* (the §4 list below). Confirmed against the locked decisions:
>
> - **`InboxItem` stays unscoped** (no `lensId`) — capture is universal; the
>   Lens is assigned at triage (inheriting the active lens).
> - **`Task.status` keeps `UPCOMING`** — used by the snooze flow. It's no longer
>   a top-level area (no dedicated page/nav), but the enum value stays; an
>   upcoming-list view is surfaced from Today.
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
> **Lens** (Work / Me by default) is the top-level scoping switch. See
> `METHODOLOGY.md` for the full GTD/PARA mapping.
> Naming: the Work/Me switch is called **Lens** (not "Context") to avoid
> colliding with GTD's "@context" (errands/phone — which we use Tags for).

---

## 1. The entity hierarchy

```
  Lens            ← the scoping switch: Work / Me (defaults)  [ActionAmp addition]
   └─ Goal        ← the organizing layer — replaces PARA's Areas
        └─ Project ← an outcome that needs >1 step  [PARA Project / GTD outcome]
             ├─ Task        ← an atomic action (THE focus candidate)
             └─ Resource    ← reference material, not an action  [PARA Resource]

  Tag             ← GTD "@context": @errands, @phone, ~15m, low-energy
                     (focus refinements — Phase 2 nuance)
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
  (bookmarks)**. **Every Resource is filed under exactly one Project or Goal** —
  there are no loose/top-level Resources. Never surfaced by the focus engine.
  (PARA "Resource".)
- **Goal** = the organizing layer — **replaces PARA's Areas.** Active &
  outcome-oriented ("Run a 10k", "Ship product v2") rather than passive buckets
  ("Health", "Work"). Projects and standalone Tasks link to a Goal to express
  *why* they matter.
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
- An inbox entry is an **InboxItem**: raw text + parsed metadata (dates/tags the NL parser found) + `status: unprocessed`.
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
| **"This supports a bigger goal"** | → **Task/Project** linked to a **Goal** | "Write blog post" → Goal: "Grow audience" |

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
- **Goals** — all Goals in the active Lens, with their linked Projects/Tasks rolled up.
- **Archive / Logbook** — completed/dead items (PARA "Archive").

The Inbox is the *only* queue. Everything else is a *view* derived from each item's attributes and relationships.

---

## 5. Implications for the focus engine ("What Now")

The matcher only ever considers **Tasks** (never Resources, never bare Projects):

- A **Task** inside a **Project** is a candidate.
- A **Project** with no Tasks is invisible to focus (it's a container, not an action) — though the UI can show "this Project has no next action" as a nudge.
- A **Goal** is never surfaced directly; it's shown as supporting detail ("Email Sarah · supports: Grow audience").

---

## 6. The Lens switch

- **Default Lenses: `Work` and `Me`.** Users can add/rename later (Phase 2).
- **Everything is scoped by the active Lens:** the Projects you see, the Goals
  you see, and — critically — **what the focus engine considers.**
- Switching Lens is one keystroke (e.g. `Tab` cycles Work → Me → …).
- **Cross-lens exceptions** (an overdue Work item surfacing while you're in Me)
  are Phase 2; MVP is strict — only the active Lens's items are candidates.

## 7. Focus ranking — MVP rule (simple, by priority)

The "What Now" engine, in its simplest form:

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
- ✅ **MVP Resources** = links + notes (bookmarks). File uploads = Phase 2.
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

## 9. Still open

- **InboxItem retention** — keep the original InboxItem after triage or delete on
  transform? *(Lean: delete — the transformed entity *is* the record.)*
