# ActionAmp — Work Backlog

> Single source of truth for what's left to do/decide. One item at a time.
> Check things off as we cover them. Add new items as they emerge.
> Last verified: **2026-06-27** (reconciled against shipped code; shipped items
> flipped to `[x]`, open items point at `docs/specs/`).
>
> **The live build queue is `docs/specs/*.md`** (statuses drive it). This file
> is the historical narrative + the non-spec'd odds-and-ends. When a spec ships,
> its item moves here to `[x]`.

---

## ☐ Workflow refactor — from `WORKFLOW.md` (2026-06-23)

Structural decisions are locked in `docs/WORKFLOW.md` §5. These are the code
items they imply — not built yet, listed here so they're not lost:

- [x] **Focus-switch nav (AppShell refactor).** DONE 2026-06-27 (commit
  `04c87b1`). Sidebar: Lens (Work/Me) switch on top, then a focus nav with
  three expanding sections — **Work** (Next, Today), **Plan** (Projects,
  Goals, Someday), **Review** (Logbook, reports). One section expanded at a
  time. Capture pinned outside both switches. Pure nav state, no routes.
- [x] **Add Upcoming to the Plan nav.** DONE 2026-07-05 (reverses the 2026-06-23
  "drop the route" item, which itself superseded the original "drop" call —
  see history below). `/app/upcoming` is now a top-level Planning route/nav
  item alongside Projects / Goals / Someday, with a count chip. The Today
  "See upcoming" swap toggle stays as a separate same-page surface. See
  `WORKFLOW.md` §5.1.
  - *History:* the 2026-06-23 call was "drop the Upcoming nav entry + route."
    That was reversed once at sign-off (2026-07-02, "let's keep upcoming"),
    which kept the route/page/query but didn't promote it into nav. The
    2026-07-05 reversal finishes the job: nav item + count + promote-on-row.
- [x] **Upcoming → Today toggle.** DONE 2026-06-23. Today page has a "See
  upcoming" / "Back to Today" toggle in the header; the Upcoming bench shows
  `status=UPCOMING` tasks (active-lens-scoped) with a per-row "Today" promote
  button; each Today row has a "Not today" demote button (→ bench, never
  vanishes). Header renders even when Today is empty so the bench is always
  reachable. No schema change — reuses `updateTaskStatus` to flip TODAY↔UPCOMING.
- [x] **Someday nav relocation.** DONE 2026-06-27 (with the focus-switch nav).
  Someday lives under the **Plan** expanding section; route `/app/someday`
  unchanged.
- [x] **`getTopTask` auto-resurface.** DONE 2026-06-25 (revised; was "optional,
  later"). `getTopTask` now selects `status ∈ {TODAY, UPCOMING}` with a
  `dueDate ≤ now` (or null) guard — a snoozed task auto-resurfaces when due, a
  freshly-triaged Upcoming task surfaces immediately. See `WORKFLOW.md` §5.2.
  *(Reversed from the 2026-06-23 "deliberate-swap only" lock — paired with the
  triage-default-to-Upcoming change.)*
- [ ] *(Phase 2 vision)* **Hard focus** — each mode (Work/Plan/Review) as a
  distinct full-screen layout, not just nav filtering. Design exploration;
  soft focus (above) ships first.
- [ ] **Merged Work Area (Next + Today on one page) + complete-only-from-
  focus + activity log.** Drafted 2026-06-27; spec at
  `docs/specs/work-area-merged.md`. Collapses `/app` + `/app/today` into one
  page (hero on top, Today | Done columns below, Lens-scoped). Three reshaping
  rules: (1) **no completion circle anywhere** — a task completes only from
  focus mode (Start → Complete), the list becomes a chooser not a tick-box;
  (2) a **timestamped activity log** per task — `Started / Paused / Completed /
  Not doing` events interleaved with user notes via a `kind` enum on
  `TaskUpdate` (which is surfaced nowhere today); (3) **`NOT_DOING` → archive**
  (lossless, recoverable) — "decided not to do it" recorded in history instead
  of silent delete. Reverses WORKFLOW.md §5.4's "two surfaces" → one. Interactive
  prototype at `docs/mockups/today-merged.html`.

---

## ☐ Design — interaction refinements

- [x] **Goal/project "Open →" navigation** — DECIDED 2026-06-16: when zoomed to a Project/Goal, an "Open →" affordance re-anchors the whole view at that scope. **Project view = Layout 1 (Overview/dashboard):** progress bar, next-action callout, full task list visible. List is OK here because you *chose* to navigate to the project (review/plan mode), unlike home where the list is demoted. Guard against: must feel like a project manifest, not a generic todo list. See `docs/mockups/project-anchor-layouts.html`.
  - **BUILD REQUIREMENT (2026-06-16):** breadcrumb crumbs are **navigation links**, not just zoom toggles. Clicking an ancestor crumb (Goal or Project) re-anchors the whole view at that scope — navigates INTO it (Goal/Project view becomes the new home, breadcrumb updates to mark it current). Lean rule: **(iii) crumbs always navigate** — universal web convention, simplest mental model. The "zoom to see in context" behavior stays the job of the `Z` key on desktop / two-finger swipe on mobile. Mockups don't implement this (intentional) — the real app must.
- [x] **Mobile prototype — pinch vs two-finger swipe for zoom.** DECIDED 2026-06-16: **two-finger horizontal swipe** (left = out / right = in). Avoids fighting the browser's native pinch-zoom. Signature mobile gesture retained. Prototype updated; INTERACTION.md gesture map updated.
- [x] **Mobile prototype — long-press threshold.** DECIDED 2026-06-16: **keep 500ms.** Added micro-interactions to compensate for snappiness: every tappable control (buttons, mode pills, zoom chips, FAB, feelings) now has press-down scale + haptic feedback (light 8ms tap; primary CTAs 12ms). Movement-cancel already in place.
- [x] **Mobile prototype — zoom chips (G/P/●) keep or kill?** DECIDED 2026-06-16: **kill — fold into breadcrumb.** Separate chip row was redundant (breadcrumb already encodes Task › Project › Goal). Crumbs are now tappable zoom targets; the crumb matching current scope highlights teal (scope-active), deeper crumbs dim (ancestor). One nav element, cleaner thumb zone, teaches the hierarchy. INTERACTION.md gesture map updated.
- [x] **Mobile prototype — FAB in working mode.** DECIDED 2026-06-16: **quiet ghost FAB.** Capture is the spec's 'one exception' (focus-protector), so it stays reachable — but shrinks (56px→40px), dims (32% opacity), drops its shadow. Brightens to full opacity on press/hover. Honors both sanctuary (calm) and focus-protector (always available). INTERACTION.md gesture map note added.
- [~] **Mobile prototype — gesture discoverability.** DECIDED 2026-06-16: **(a) first-launch coach + (c) just-in-time spotlights.** Opening line: *"We're special. Let's teach you the moves."* 4 lessons (long-press → work; two-finger swipe → zoom; one-finger swipe → mode; tap breadcrumb → jump). Just-in-time spotlights spec'd but not built (e.g. pulse the mode pill when first Review-relevant moment arises). **Prototype drafted at `docs/mockups/mobile-coach.html` but PARKED — not wiring into the app yet.** Revisit when we have a real first-launch flow.
- [ ] **Desktop — mode indicator at bottom-left** (VIM-style `-- WORKING --`). Spec'd in INTERACTION.md but not yet built into the prototype.
- [ ] **Desktop — `?` cheatsheet overlay** showing the current mode's keyset. Spec'd, not built.
- [ ] **Desktop — Switch during working mode.** Currently idle-only. Should mid-task Switch require the confirm modal? (Lean: yes.)
- [ ] **Desktop — soft no-op feedback** when an invalid key is pressed in a mode (flash the indicator).
- [ ] **Voice-not-chips pass** — kill remaining metadata chips across surfaces in favor of natural language ("Because it's Important and due today").

## ☐ Design — surfaces not yet built

- [x] **Inbox + triage surface.** DONE 2026-06-16; **co-author wizard 2026-06-25.** Two distinct surfaces: (1) **Inbox list** (`inbox/InboxPage.tsx`) = browse/scan/pick entry point; (2) **Triage** (`inbox/TriagePage.tsx`) = a deliberate **per-item specification wizard**. Next pass: merge Context + Type into **Classify** (`Classify → Spec → Complete`) per `docs/specs/triage-classify-step.md`; concrete Project resolution shows `Destination: Project · Lens` and skips standalone lens selection by default. The single-card one-key dispatch is gone; triage is co-authoring the spec, not speed-clearing. The spec list (When/Size/Priority/Project for Tasks; Goal/Due for Projects; Parent/Kind for Resources) is **inline-expanding** rows ported from the mockup (tap a row → options beneath; Project/Goal/Parent rows open the bottom-sheet picker). Priority & Size chosen in the spec step override any parsed capture token. Defaults: Size=M, Priority=Normal, When=Upcoming (never auto-Today; revised 2026-06-25 — was Someday), Project=General. **Goal is filed *into* by Project, never by Task, and never created at triage.** Confirm summary reads back the commitment in plain English; Complete is gated until destination + filing target are set. **Archive (was "Trash") is lossless** — it marks the InboxItem `ARCHIVED` instead of deleting, and surfaces in the Logbook's Archived section with a Restore action (2026-06-25). Still unbuilt: undo toast, inline title edit, property keys `[`/`]`/`-`/`=`. See `TRIAGE.md` §3/§4/§8, `docs/specs/triage-classify-step.md`.
- [x] **Today list view** (planning, cap, priority/size chips, done section). DONE 2026-06-16; **"Done today" section built 2026-07-02** (`friction-cleanup` — was a `TODO` stub). **Today IS the Plan mode card** (not a separate page). Same Mode×Scope position as Next — three renderings of one card position: Plan=Today list, Do=Next hero, Review=debrief. Card DNA preserved (border/shadow/radius), just list-shaped. Cap badge amber at 4/5, rose at full. Tasks grouped by Goal (violet dot), General (gray), Overdue (rose). Per-row Important/XL chips tinted. "Done today (N)" collapsed section at bottom — `getDoneToday` query (`completedAt >= local-midnight`), grouped by Goal, muted rows; gated on count > 0. Tap task to select → "Start doing" promotes to Do mode. See `docs/mockups/plan-today-card.html`.
- [x] **Upcoming + Someday views.** Someday page at `/app/someday`; **each row
  has a "Today" promote** (DONE 2026-07-02 via `friction-cleanup`, reuses
  `updateTaskStatus`). Upcoming at `/app/upcoming` is a top-level Planning
  page (promoted into Plan nav 2026-07-05; see `WORKFLOW.md` §5.1) —
  date-bucketed with a per-row "Today" promote; also reachable via the Today
  "see upcoming" same-page swap toggle.
- [x] **Projects list + Project detail.** DONE 2026-06-27. Projects list at
  `/app/projects`; **Project detail at `/app/projects/:id`** (`ProjectDetailPage.tsx`)
  — work a project's tasks, add + complete inline, progress roll-up. e2e at
  `e2e/project-detail.spec.ts`. *(Convert Task→Project / XL path still open.)*
- [x] **Goals list + Goal detail.** Goals list at `/app/goals`; **Goal detail
  at `/app/goals/:permalink`** (`GoalDetailPage.tsx`) — DONE 2026-07-02 via
  `friction-cleanup`, updated 2026-07-04 to project-only alignment. Header with
  aggregate project progress (matched to `getGoals`' rollup) and linked
  projects list. Goals do not create or own Tasks directly.
- [ ] **Breadcrumb navigation (crumbs navigate).** `Breadcrumb.tsx` works (crumbs
  are `<button>`s with `onSelect`) but is wired only into the design-system
  demo, not Project/Goal detail (both use a `← Back` Link). Per the BUILD
  REQUIREMENT below, crumbs should re-anchor the view at the clicked scope.
  Spun out of `friction-cleanup` at sign-off (2026-07-02). **Spec at
  `docs/specs/breadcrumb-nav.md` — `ready` 2026-07-03 (route model locked:
  crumbs navigate to the ancestor's existing route, no new view-state layer).**
  Tracked as `breadcrumb-nav` in ROADMAP.md.
- [ ] **Logbook / Review mode screen.** Logbook list shipped (`/app/logbook`,
  incl. the Archived section for lossless triage Archive); **Review/debrief
  screen unbuilt** — the least-built area (WORKFLOW §2.5). Tracked as
  `weekly-monthly-review` in ROADMAP.md §Then; spec at
  `docs/specs/weekly-monthly-review.md` (`draft`). v1 (range review:
  completions grouped by Goal/Project, prior-period delta, stuck/aging) builds
  on the current schema; v2 (activity timeline) is gated on `work-area-merged`'s
  `kind` enum on `TaskUpdate`. Entitlement lean: Pro-only.
- [x] **Capture palette (`⌘K`)** — DONE. Floating input, NL parsing, inline
  chips, rapid-fire. `components/ui/CapturePopover.tsx`.
- [ ] **Command palette (`⌘\`)** — fuzzy jump/run. **Unbuilt.** Spec'd at
  `docs/specs/command-palette-search.md`.
- [ ] **Tag management UI + reserved-tag seeding.** **Unbuilt.** Surfaced
  2026-07-03 as a *missing prerequisite* during the focus-engine-v2 review:
  the moment matcher reads energy/time tags users have no way to set (tags are
  only created via `@`-parsing at triage; never listed on Task detail; no
  reserved names). **Spec at `docs/specs/tag-management.md` — `ready`
  2026-07-03.** Minimum that unblocks the matcher: seed 7 reserved names in
  `ensureOnboarded`, chips + add/remove on Task detail, two ops. **Unblocks
  `focus-engine-v2`.**
- [x] **Marketing site home** — DONE. Landing page at `/` ("Easiest way to get
  into action"), full pitch, footer. `src/landing/LandingPage.tsx`. *(No
  waitlist/email capture by design — see PRODUCT.md "pure signpost"; the
  Founding 100 page at `/founding-100` has the live checkout.)*

## ☐ Build — foundation

- [x] **Prisma schema from DATA-MODEL.md.** DONE. Full model in `schema.prisma`
  (User, Lens, Goal, Project, Task, Resource, InboxItem, Tag, Payment,
  TaskUpdate). 10 migrations. `User.plan` + Stripe fields + `hasSeenOnboarding`.
- [x] **Resolve open data-model questions.** DONE. InboxItem: triaged items
  become the entity; Archive is lossless (`status=ARCHIVED`, `archivedAt`) not
  delete. Session/SessionEvent: not built (deferred — no focus-session feature).
- [ ] **Social auth** — add Google. **Unbuilt** (email-only). Spec'd at
  `docs/specs/social-auth-google.md` (`ready`); depends on `legal-pages-oauth`
  (`done`).
- [x] **PostgreSQL** — DONE. `provider = "postgresql"`; dev on Homebrew PG,
  prod on Railway.
- [x] **First `wasp db migrate-dev`** — DONE (10 migrations through 2026-06-27).
- [x] **Seed data** — DONE. `ensureOnboarded` seeds Work+Me lenses + a "General"
  project each, + one magic-moment TODAY task (guarded by `Task.count===0`).
  See `docs/specs/first-run-experience.md` (`done`).

## ☐ Build — bring prototypes into the webapp

- [x] **Design tokens → webapp.** DONE. `src/styles/tokens.css` (teal/amber,
  neutrals, dark mode via `[data-theme="dark"]`). Not Tailwind — hand-rolled
  CSS variables (the Tailwind export was abandoned for tighter control).
- [ ] **App shell + Next** as real React components (from `mode-zoom-unified.html`).
- [ ] **Working state** as real component (breathing halo, session timeline, feelings, notes).
- [ ] **Mode × Zoom navigation** as real React state + transitions.
- [ ] **Modal architecture** — implement the mode state machine (Normal/Working/Capture/Triage/Command/Zoom), keyset per mode, mode indicator, soft no-ops.
- [ ] **Touch gestures** — port mobile gestures (pinch/swipe/long-press) via a lib (react-use-gesture or similar).

## ☐ Polish & infra

- [ ] **Capture palette** — wire NL parsing (chrono for dates, simple tag grammar).
- [ ] **Command palette** — fuzzy search over items/projects/goals/views/actions.
- [ ] **Railway deploy** — first deploy of the Wasp app. Auth via `railway login`; skill + MCP already set up.
- [ ] **Email provider** for auth flows (Wasp "Dummy" sender → real provider: Resend/Postmark).
- [ ] **Analytics** — minimal, privacy-respecting (PostHog? none?).
- [ ] **Performance pass** — transitions on real React, not just CSS prototypes.

---

## ☐ CLI + orchestration skills (developer surface)

> A top-level `cli/` package (typed library + thin binary) talking to the HTTP
> API via **Personal Access Tokens**, plus four paired agent skills that shell
> out to `actionamp <cmd> --json`. This is a power-user / developer surface —
> **not** part of the validation gauntlet; `ready` for Build to pull
> opportunistically. Tracked as roadmap item 15 in `docs/ROADMAP.md`.
> **Effort split into 3 specs 2026-07-03** (the original single spec was too
> large for one `ready` unit):

- [ ] **`cli-pat-plumbing`** (`ready`, spec: `docs/specs/cli-pat-plumbing.md`)
      — `ApiKey` model + 3 PAT routes + Bearer middleware + Settings UI.
      Self-contained backend slice; the natural first pull.
- [ ] **`cli-package`** (`draft`, spec: `docs/specs/cli-package.md`) — the
      `cli/` package (~14 commands + `--json`). Draft because the op-refactor
      scope is unscoped (its Open Question 1).
- [ ] **`cli-skills`** (`draft`, spec: `docs/specs/cli-skills.md`) — four
      orchestration skills. Depends on `cli-package`; one skill blocked on
      `cli-comments-resources`.
- [ ] Umbrella + cross-cutting decisions: `docs/specs/cli.md`.
- [ ] **`cli-write-ops`** (`deferred`, spec: `docs/specs/cli-write-ops.md`) —
      the missing writes: edit task description/priority/size, edit/delete
      project + goal. Unblocks refinement flows.
- [ ] **`cli-comments-resources`** (`deferred`, spec:
      `docs/specs/cli-comments-resources.md`) — a Comment model + full Resource
      CRUD. Unblocks the `task-research` skill. **Inherits the
      `resources-project-owned` model** (project-owned, explicit `TaskResource`
      join) — must be updated to match before it leaves `deferred`. Reconciles with
      `resources-project-owned`.

---

## ✓ Done

- [x] Foundation commit (spec, design system ref, mockups, scaffold) — `e9c05c4`
- [x] Interaction approaches A/B/C — `04f95f9`
- [x] Mode × Zoom spine + working state + transitions — `5fe60d9`
- [x] Switch button fix + design system docs — `abc0b3c`
- [x] Modal architecture spec + mobile gesture-modal prototype — `0003485`
- [x] Mobile FAB positioning + hide-in-working — `da59725`, `212ac32`
