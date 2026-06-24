# ActionAmp — Work Backlog

> Single source of truth for what's left to do/decide. One item at a time.
> Check things off as we cover them. Add new items as they emerge.
> Last updated: 2026-06-23

---

## ☐ Workflow refactor — from `WORKFLOW.md` (2026-06-23)

Structural decisions are locked in `docs/WORKFLOW.md` §5. These are the code
items they imply — not built yet, listed here so they're not lost:

- [ ] **Focus-switch nav (AppShell refactor).** Sidebar: Lens (Work/Me) switch
  on top, then a focus nav with three expanding sections — **Work** (What Now,
  Today), **Plan** (Projects, Goals, Someday), **Review** (Logbook, reports).
  One section expanded at a time (expanding one collapses the others). Capture
  stays pinned outside both switches. No route changes — pure nav state.
- [ ] **Drop the Upcoming top-level route + nav entry.** Remove `/app/upcoming`
  from `main.wasp.ts` and the sidebar. Keep `getTasks` able to query
  2  `UPCOMING` (the Today toggle needs it); just no dedicated page/area.
- [ ] **Upcoming → Today toggle.** Add a "see upcoming" affordance on the Today
  page that surfaces `status=UPCOMING` tasks (active-lens-scoped) for promotion
  onto today. This is the replacement for the dedicated Upcoming page.
- [ ] **Someday nav relocation.** Move the Someday nav entry under the Plan
  section of the new focus-switch nav (route `/app/someday` stays).
- [ ] *(Optional, later)* **`getTopTask` auto-resurface.** If we ever want
  snoozed (`UPCOMING`) tasks to re-enter What Now automatically when due, widen
  the filter from `status=TODAY` to include due-soon `UPCOMING`. One-line
  change; deliberately deferred — current behavior is deliberate-swap only.
- [ ] *(Phase 2 vision)* **Hard focus** — each mode (Work/Plan/Review) as a
  distinct full-screen layout, not just nav filtering. Design exploration;
  soft focus (above) ships first.

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

- [x] **Inbox + triage surface.** DONE 2026-06-16. Two distinct surfaces: (1) **Inbox list** = browse/scan/pick entry point; (2) **Triage** = the act, **Layout A (Tinder-style one-card flow)** with card-replace exit animations. Critical reframing: triage is **co-authoring the spec**, not just dispatching — the card shows raw text + NL-parsed editable properties, the user confirms/edits what the thing becomes. **Layout: vertical property list with inline expansion** (each row = one property, tap to expand options in place, no floating popover). **Title is editable inline** (contenteditable, persists on blur). Defaults: Size=M, Priority=Normal, When=Someday (never auto-Today), Project=General (null = lives in Lens context). Confirm summary at bottom reads back the commitment in plain English. Undo toast for 4s after dispatch. See `docs/mockups/triage-coauthor.html` (canonical), `triage-tinder.html` (early), `triage-a-vs-c.html` (A/C comparison).
- [x] **Today list view** (planning, cap, priority/size chips, done section). DONE 2026-06-16. **Today IS the Plan mode card** (not a separate page). Same Mode×Scope position as What Now — three renderings of one card position: Plan=Today list, Do=What Now hero, Review=debrief. Card DNA preserved (border/shadow/radius), just list-shaped. Cap badge amber at 4/5, rose at full. Tasks grouped by Goal (violet dot), General (gray), Overdue (rose). Per-row Important/XL chips tinted. Done section collapsed at bottom. Tap task to select → "Start doing" promotes to Do mode. See `docs/mockups/plan-today-card.html`.
- [ ] **Upcoming + Someday views.**
- [ ] **Projects list + Project detail.** Roll-up, next-action, convert Task→Project (XL path).
- [ ] **Goals list + Goal detail.** Roll-up across projects, the "why".
- [ ] **Logbook / Review mode screen.** End-of-day debrief, weekly GTD review as guided flow. Goal-centric, conversational.
- [ ] **Capture palette (`⌘K`)** — floating input, NL parsing, inline chips.
- [ ] **Command palette (`⌘\`)** — fuzzy jump/run.
- [ ] **Marketing site home** — "Easiest way to get into action", waitlist, sections, footer.

## ☐ Build — foundation

- [ ] **Prisma schema from DATA-MODEL.md.** Replace scaffold's User/Task/Tag with our model (User, Lens, Goal, Project, Task, Resource, InboxItem, Tag, Session, SessionEvent). Forces resolution of: InboxItem retention, Task status enum, Session/SessionEvent shape, soft-delete vs hard-delete for Archive.
- [ ] **Resolve open data-model questions** before schema: InboxItem retention (delete on transform?); Session model (does each work session persist?); Archive = status or separate entity.
- [ ] **Social auth** — add Google (and one other?) to Wasp scaffold alongside existing email auth.
- [ ] **Switch SQLite → PostgreSQL** for dev (Wasp-managed Docker DB).
- [ ] **First `wasp db migrate-dev`** — get the real DB booting with our model.
- [ ] **Seed data** — sample Lens (Work/Me), Goal, Project, Tasks so the app isn't empty on first run.

## ☐ Build — bring prototypes into the webapp

- [ ] **Design tokens → webapp.** Export `design.md` → Tailwind theme (`npx @google/design.md export --format css-tailwind`). Wire teal/amber + dark mode into the Wasp app.
- [ ] **App shell + What Now** as real React components (from `mode-zoom-unified.html`).
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

## ✓ Done

- [x] Foundation commit (spec, design system ref, mockups, scaffold) — `e9c05c4`
- [x] Interaction approaches A/B/C — `04f95f9`
- [x] Mode × Zoom spine + working state + transitions — `5fe60d9`
- [x] Switch button fix + design system docs — `abc0b3c`
- [x] Modal architecture spec + mobile gesture-modal prototype — `0003485`
- [x] Mobile FAB positioning + hide-in-working — `da59725`, `212ac32`
