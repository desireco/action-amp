# ActionAmp — Work Backlog

> Single source of truth for what's left to do/decide. One item at a time.
> Check things off as we cover them. Add new items as they emerge.
> Last updated: 2026-06-16

---

## ☐ Design — interaction refinements

- [x] **Goal/project "Open →" navigation** — DECIDED 2026-06-16: when zoomed to a Project/Goal, an "Open →" affordance re-anchors the whole view at that scope. **Project view = Layout 1 (Overview/dashboard):** progress bar, next-action callout, full task list visible. List is OK here because you *chose* to navigate to the project (review/plan mode), unlike home where the list is demoted. Guard against: must feel like a project manifest, not a generic todo list. See `docs/mockups/project-anchor-layouts.html`.
- [x] **Mobile prototype — pinch vs two-finger swipe for zoom.** DECIDED 2026-06-16: **two-finger horizontal swipe** (left = out / right = in). Avoids fighting the browser's native pinch-zoom. Signature mobile gesture retained. Prototype updated; INTERACTION.md gesture map updated.
- [x] **Mobile prototype — long-press threshold.** DECIDED 2026-06-16: **keep 500ms.** Added micro-interactions to compensate for snappiness: every tappable control (buttons, mode pills, zoom chips, FAB, feelings) now has press-down scale + haptic feedback (light 8ms tap; primary CTAs 12ms). Movement-cancel already in place.
- [ ] **Mobile prototype — zoom chips (G/P/●) keep or kill?** They're a pinch fallback but add visual noise. Decide once pinch is proven.
- [ ] **Mobile prototype — FAB in working mode.** Currently hides (per sanctuary rule). Confirm this is right or bring it back as a quieter affordance.
- [ ] **Mobile prototype — gesture discoverability.** First-time users won't know pinch/swipe/long-press. Consider a one-time coach overlay.
- [ ] **Desktop — mode indicator at bottom-left** (VIM-style `-- WORKING --`). Spec'd in INTERACTION.md but not yet built into the prototype.
- [ ] **Desktop — `?` cheatsheet overlay** showing the current mode's keyset. Spec'd, not built.
- [ ] **Desktop — Switch during working mode.** Currently idle-only. Should mid-task Switch require the confirm modal? (Lean: yes.)
- [ ] **Desktop — soft no-op feedback** when an invalid key is pressed in a mode (flash the indicator).
- [ ] **Voice-not-chips pass** — kill remaining metadata chips across surfaces in favor of natural language ("Because it's Important and due today").

## ☐ Design — surfaces not yet built

- [ ] **Inbox + triage surface.** Universal inbox list + the one-item-at-a-time triage walkthrough. The GTD clarify ritual. Big new surface — gesture for dispatch, bulk triage, how parsed-token chips render.
- [ ] **Today list view** (planning mode, priority/size chips, Today cap enforcement, done section).
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
