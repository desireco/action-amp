# Visual drift — port vs webapp reference (2026-09-02 audit)

Surface-by-surface comparison of the OLD app (`webapp/`, Wasp — the design
prototype, the reference) against the NEW port (`web/`, SvelteKit SPA), light +
dark at 1280×800, same database, logged in as zeljko@dakic.com (FOUNDER, Work
lens). Screenshots: `/tmp/sweep/webapp/*.png` + `/tmp/sweep/new/*.png`
(re-shoots in `/tmp/sweep/reshoot/` + `/tmp/sweep/new2/`). Home `/`
composition is audited separately (another agent) and excluded here.

Ranked P1 (structural/broken) → P2 (spacing/scale) → P3 (cosmetic).
The webapp is the reference but not sacred — items marked **[decision]** are
places where the port deviates from what the reference renders, but the
reference rendering itself looks like an accident; confirm with Jake before
"fixing" the port to match.

> **Redo pass (2026-09-02, later):** every light+dark pair re-checked against
> the actual PNGs (Read tool, no shell image handling) and every file/line
> reference re-verified in the tree. All findings below are image-verified;
> three corrections from the earlier draft are folded in (Today card height
> matches, palette offset direction, counts).

## Systemic

### P1 — Page columns shrink-wrap to content (someday, week, settings)
- **What webapp does:** every list/settings page fills a fixed column:
  someday 680px, week 840px, settings hub 760px (`width: min(100%, X)`).
- **What the port does:** someday and week render ~400px wide, the settings
  hub ~590px (the Account tab; Preferences/Lenses happen to reach ~728px via
  their own max-content). The Account helper text ("Used for your account and
  avatar initials.") wraps to two lines as a result.
- **Root cause:** `web/src/routes/+layout.svelte:100-104` wraps every app page
  in `.screen-container { display: flex; flex-direction: column }`. Page roots
  using `max-width + margin: 0 auto` become flex items with auto cross-axis
  margins → shrink-to-fit + center instead of filling:
  - `web/src/routes/do/someday/+page.svelte:89-90` (`max-width: 44rem` — also
    the wrong target: webapp is 680px)
  - `web/src/routes/do/week/+page.svelte:93-94` (`max-width: 44rem` — webapp
    is 840px)
  - `web/src/lib/styles/settings.css:17-21` (`.aa-settings-hub`, 760px)
- **Fix:** switch these page roots to the `width: min(100%, X); margin-inline:
  auto` pattern already used by inbox/logbook/projects and by the freshly
  fixed upcoming page (`width: min(100%, 840px)`), or stop making
  `.screen-container` a flex column.

## Per surface

### Today
No structural drift. Hero card, pills, dashes, empty state, Capture FAB and
dark tokens all match. Empty-state card height matches too (the earlier
draft's "slightly taller" claim did not survive re-measurement — both cards
are ~355–360px tall).

### Upcoming
The 840px column + lens-tinted hero card + surface group cards landed in the
working tree today (uncommitted `web/src/routes/do/upcoming/+page.svelte`
change; verified live). Remaining row-level drift:

- **P2 — Radio dot hangs below the title line.** Webapp aligns the status dot
  with the title's first line (`align-items: flex-start` + `margin-top: 7px`,
  `webapp/src/components/ui/TaskRow.css`); the port centers it on the whole
  row, so it floats between title and chips. `web/src/lib/components/TaskRow.svelte:118-124`.
- **P2 — Upcoming dot color.** Webapp: 8px `var(--aa-border-strong)` gray
  ring; port: teal ring (`TaskRow.svelte:162-164`). Color should be neutral —
  teal is the system accent, not a status signal here.
- **P2 — Missing row separators.** Webapp list rows carry a `border-bottom`
  hairline with `space-md/space-sm` padding; the port uses bare flex gaps, no
  dividers, slightly larger row spacing.

### Someday
- **P1 — Column width** (see systemic item above).
- **P3 — Eyebrow style.** Port uses its own `.aa-eyebrow` (text-xs, muted);
  webapp someday inherits ListShell's `.aa-list-header__eyebrow` (text-sm
  semibold, text-4). Align while doing the width fix (`someday/+page.svelte:95`).

### Week
- **P1 — Hero card missing.** Webapp wraps the header in a lens-tinted surface
  card (`linear-gradient(--aa-active-lens-soft …) + surface, border,
  radius-xl, shadow-sm, padding space-xl`, `webapp/src/lists/WeekPage.css`) —
  mirrors Today/Upcoming. Port renders a plain header (`week/+page.svelte:105-116`).
- **P1 — Group cards missing.** Webapp renders each weekday group as a surface
  card (same file); port renders a bare list.
- **P2 — Title scale.** Port `--aa-text-xl` semibold; webapp hero `--aa-text-2xl`.
- **P1 — Column width** (systemic; webapp target 840px).

### Projects
- **P2 — [decision] Header treatment.** Rendered reference: sentence-case
  "Planning" at base size, huge (~32px browser-default) bold "Projects", and
  the New project pill dropping below the subtitle on the left. That is an
  unstyled accident — `webapp/src/projects/ProjectsPage.tsx:21` imports only
  `ProjectsPage.css`, never ListShell.css, so `.aa-list-header*` has no styles
  there. The port implements the ListShell spec (uppercase text-sm eyebrow,
  `--aa-text-xl` bold title, button right — `web/src/lib/styles/projects.css:23-56`).
  Recommend: fix the webapp reference (import ListShell.css) rather than
  degrade the port; confirm the port's version is the intended look.
- Grid, ProgressCard (hero-shadow bloom is reference behavior — both stacks
  use `--aa-hero-shadow`), chips, progress bars, Focus chip, 980px width: match.

### Goals
Same header [decision] as Projects (reference `GoalListView.css` also never
imports ListShell.css). 760px column, cards, progress, Focus chips: match.

### Inbox
No drift beyond systemic items. 760px column, empty state, CTA verified
pixel-identical (card edges 370–1129 on both).

### Logbook
No drift. Day groups, chips, 760px column match.

### Settings (Account)
- **P1 — Hub shrink-wrap** (systemic; worst-hit surface: 590px vs 760px,
  wrapped helper text).
- Everything else matches: tabs, Profile/Sign-in sections, 320px inputs,
  disabled Save changes.

### Settings — Preferences
- **P3 — Hub at max-content (~728px) instead of 760px** (systemic; barely
  visible here). Toggle, focus-session segmented control, Today-cap stepper,
  section rhythm: match.

### Settings — Lenses
- **P3 — Same hub width nit.** Lens dots, counts, Edit links, + New lens: match.

### Admin — Overview
- **P1 — Double-sidebar composition.** Webapp *replaces* the app shell on
  `/do/admin`: a dedicated admin sidebar (brand + ADMIN: Overview, Activity,
  Users, Funnel, Feedback) spans the left edge, and there is no app nav, no
  search/speaker cluster, no Capture FAB. The port keeps the full app sidebar
  *and* nests a second teal admin panel inside the content area, plus the app
  chrome (search, speaker, Capture FAB) on top. `web/src/routes/do/admin/+layout.svelte`
  composes inside `Shell`; it should swap the sidebar instead (an AdminShell
  equivalent to webapp's admin layout).
- **P3 — Stat-card labels are teal in the port** ("Total signups", "New
  signups · 30d", "Active users · 30d"); webapp renders them plain text-3
  gray. Color without meaning — drop the link tint (the "Weekly signups →
  Activity" link is the only teal element in the reference).
- **P2 — [decision] Dark mode.** The webapp admin area is light-only —
  navigating to `/do/admin` clears `data-theme` (verified by re-shoot: the
  attribute is gone after nav). The port renders the admin page in proper
  dark tokens. Decide which is canonical: port the light-only clamp, or keep
  the port's dark support as a deliberate improvement (and note the webapp
  behavior as the thing it improves on).

## Sidebar (affects every surface)
- **P1 — Inbox badge missing entirely.** Webapp shows the lens-scoped inbox
  count, or a teal ✓ chip ("Inbox zero") when empty
  (`webapp/src/app/AppShell.tsx:570-596`). Port passes no count at all
  (`web/src/lib/components/Shell.svelte:444`); the counts payload
  (`Shell.svelte:74-76`) carries only today/upcoming/someday.
- **P1 — Projects/Goals count pills missing.** Webapp shows 5 / 2; the port
  defers ("badges land when those counts join the payload",
  `Shell.svelte:74-76`, nav items at `:464-465`).
- **P1 — "?" shortcuts button missing.** Webapp utility cluster is search +
  ? + speaker; the port replaced ? with the feedback loudspeaker and deferred
  the cheatsheet (`Shell.svelte:415-416`). Needs a shortcuts surface first —
  dependency noted in the port comment.
- **P1 — Review cadence links missing.** Webapp's REVIEW group lists
  Today/Week/Month reviews (gated by reviewPreferences) above Logbook; the
  port renders Logbook only (`Shell.svelte:455-458, 470-475`) — the review
  routes don't exist in the port yet. Deliberate deferral; listed for
  completeness.

## Overlays (state shots)
Capture popover and command palette match (same commands, kbd hints,
selection tint, scrim). Cosmetic only:
- **P3 —** Capture popover ~512px wide vs 480px; palette sits ~4px higher.
  `web/src/lib/components/CapturePopover.svelte`, `search/CommandPalette.svelte`.

## Re-shot pairs
- `webapp dark-admin-overview` — re-shot veil-free (`/tmp/sweep/reshoot/`);
  confirmed the light-only admin is real behavior, not a capture artifact.
- `new today / upcoming / projects / goals` (light + dark) — the source for
  these changed *during* the first sweep (20:00–20:11); re-shot at 20:3x
  (`/tmp/sweep/new2/`) so the findings above reflect the current tree.

## Summary

| Priority | Count | Items |
| --- | --- | --- |
| P1 (structural/broken) | 8 | shrink-wrapped columns (someday/week/settings), week hero card, week group cards, admin double-sidebar, Inbox badge, Projects/Goals pills, "?" button, Review cadence links |
| P2 (spacing/scale) | 6 | TaskRow radio alignment, TaskRow dot color, TaskRow separators, week title scale, projects/goals header [decision], admin dark mode [decision] |
| P3 (cosmetic) | 5 | admin stat-label tint, someday eyebrow, preferences hub width, lenses hub width, capture/palette dims |

Biggest wins first: the `.screen-container` shrink-wrap fix (one wrapper,
three surfaces), the week hero/group cards port, and the sidebar counts +
admin shell swap.
