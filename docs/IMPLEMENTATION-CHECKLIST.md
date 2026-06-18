# ActionAmp — UI Implementation Checklist

> Ordered by dependency and user impact. Each item is one focused pass.
> ✅ = done, 🔨 = in progress, ⬜ = todo.
>
> **⚠️ Rule: every new reusable component MUST be added to `/design-system`.**
> The design system page at `/design-system` is the living source of truth.
> If you build a component and it's not documented there, it doesn't exist.
> This keeps the system discoverable and prevents drift between code and docs.

## Phase 0 — Design System Foundation

> Reusable components & tokens that every subsequent phase depends on.
> Goal: extract all repeated patterns into shared components so pages compose them instead of reimplementing.

### 0.1 ✅ Shared component library
- [x] Create `src/components/` directory structure (`ui/` + `design/`)
- [x] **BrandMark** — teal checkmark SVG at 3 sizes (sm/md/lg). `src/components/ui/BrandMark.tsx`
- [x] **Button** — 4 variants (primary/secondary/ghost/danger), 3 sizes (sm/md/lg), icon + kbd hint support, bare mode. `src/components/ui/Button.tsx` + `Button.css`
- [x] **CompletionCircle** — empty→filled circle at 3 sizes (sm=20px, md=32px, lg=44px). Burst animation, pulse halo, disabled. `src/components/ui/CompletionCircle.tsx` + `CompletionCircle.css`
- [x] **Chip** — pill for tags/dates/priority/status. 6 variants (default/teal/amber/violet/rose/muted), clickable, removable. `src/components/ui/Chip.tsx` + `Chip.css`
- [x] **Card** — 4 variants (default/elevated/interactive/highlighted), 4 padding presets, header. `src/components/ui/Card.tsx` + `Card.css`
- [x] **ModeDial** — bottom-center persistent nav (Plan/Do/Review). Foundation of navigation. `src/components/ui/ModeDial.tsx` + `ModeDial.css`
- [x] **ZoomDock** — Task/Project/Goal zoom controls. `src/components/ui/ZoomDock.tsx` + `ZoomDock.css`
- [x] **Breadcrumb** — zoom orientation crumbs (Goal › Project › Task). `src/components/ui/Breadcrumb.tsx` + `Breadcrumb.css`
- [x] **LensSwitch** — segmented control (Work/Me) for sidebar top. `src/components/ui/LensSwitch.tsx` + `LensSwitch.css`
- [x] **NavItem** — sidebar nav item with icon + active bar + count badge. `src/components/ui/NavItem.tsx` + `NavItem.css`
- [x] **Icons** — 12 thin-stroke SVG icons (nav + actions). `src/components/ui/icons.tsx`
- [ ] **Icon** — thin wrapper for SVG icons with size/color props, ensures consistent sizing across the app.
- [ ] **Toggle/Switch** — teal accent when on, neutral when off.

### 0.2 ⬜ Layout primitives (pending)
- [ ] **PageContainer** — max-width + centered + responsive padding. Replaces the per-page `max-width: 680px` pattern.
- [ ] **Section** — vertical section with eyebrow label + heading + body spacing. Used in settings, billing, lists.

### 0.3 ⬜ Dark mode tokens (pending)
- [ ] Add `[data-theme="dark"]` overrides to `tokens.css` (already prototyped in mockups, just needs to land in the real tokens file).

### 0.4 ⬜ Global CSS cleanup (pending)
- [ ] Move body font/background from `App.css` to `tokens.css` as proper body tokens.
- [ ] Ensure every page imports tokens (many already do, some duplicate values).

---

## Phase 1 — App Shell

> The persistent chrome that frames every authenticated page.
> Goal: match the `app-shell-whatnow.html` prototype — sidebar with lens switch, icons, active indicator bar, topbar with capture button.

### 1.1 ✅ Sidebar upgrade
- [x] Add **Lens switch** (Work / Me toggle) below brand, matches prototype's `lens` component.
- [x] Add **nav item icons** — one SVG per nav item (star, inbox, clock, calendar, dashed-circle, folder, target, book). Use the icons from the prototype.
- [x] Add **active indicator bar** — the teal left-edge bar that animates in on the active nav item (prototype: `.nav-item.active::before`).
- [x] Add **count badges** — inbox count (amber urgent), today count, project count, goal count. (Hidden on `soon` items until pages exist.)
- [x] Add **nav sections** — subtle dividers: "⌡ What Now / Inbox / Today / Upcoming / Someday" then "Projects / Goals" then "Logbook".
- [x] Add **user avatar/initials** at sidebar bottom instead of text name.

### 1.2 ✅ Topbar
- [x] Add topbar to AppShell main area — right-aligned actions.
- [x] **Capture button** (`⌘K`) with kbd hint, matches prototype's `.kbd-btn`.
- [x] **Theme toggle** icon button (sun/moon) with `⌘D` shortcut. (Toggle works; ⌘D shortcut + dark tokens pending.)

### 1.3 ✅ Sidebar responsive
- [x] Collapse sidebar to topbar on mobile (< 768px). Horizontal scroll nav.
- [ ] Sidebar collapsible via keyboard shortcut or toggle button (desktop).

---

## Phase 2 — What Now Page (the wedge)

> The home screen. Not a list, a chooser.
> Goal: implement the full What Now view from the prototype.

### 2.1 🔨 Moment bar / context
- [x] "Right now · 30 min available · Work" context line above the card.
- [ ] Time available selector (15m / 30m / 1h / 2h+).
- [ ] Energy selector (low / medium / high).
- [ ] Defaults inferred from time-of-day (Phase 2 — skip for now).

### 2.2 ✅ Task card
- [x] **Completion circle** — 32px, interactive. Click → fill animation + burst → "Done ✓" → swap to next task.
- [x] **Task title** — large, bold, the thing to do.
- [x] **Meta line** — project name · due date · size (S/M/L/XL).
- [x] **"Why this" line** — amber-highlighted reason: "Because it's Important and due today."
- [x] **Action buttons** — "Do this" (primary), "Not now" (secondary). "Not now" opens snooze options (handler stubbed).
- [x] Card centered, max-width 520px, generous vertical padding.
- [x] Reusable component: `components/ui/WhatNowCard.tsx`

### 2.3 ✅ Empty state
- [x] Current empty state is good text. Add a subtle CTA: "Capture something with ⌘K" with a faded keyboard hint.

### 2.4 ⬜ Multiple tasks mode
- [ ] When >1 candidate, show up to 3 cards stacked (primary + 2 smaller below).
- [ ] Default: 1 card. Configurable or automatic based on moment.

### 2.5 ⬜ "Not now" flow
- [ ] "Not now" button opens: Snooze (1h / 3h / tomorrow / weekend), Someday, Skip once. (Handler stubbed in WhatNowCard — needs bottom sheet from modal-approach.md §03.)

---

## Phase 3 — Inbox

### 3.1 ✅ Inbox list page (`/app/inbox`)
- [x] List of untriaged items, newest first.
- [x] Each row: text + parsed-token chips (date / tag / priority).
- [x] Row actions: open, triage (→ review mode), delete.
- [x] Header with "Triage" button → opens review mode.
- [x] Empty state: "Inbox zero. Capture something with ⌘K."

### 3.2 ✅ Inbox Triage page (`/app/inbox/review`)
- [x] Tinder-style walkthrough, one item at a time. Based on `triage-tinder.html` prototype.
- [x] Card with item text + chips + "captured X ago" meta.
- [x] **Dispatch buttons**: Task·Today (1), Project (P), Resource (R), Upcoming (2), Someday (3), Trash (Del).
- [x] Exit animations (direction encodes decision — right/left/up/down).
- [x] Progress bar: "1 of 7" → advances on dispatch.
- [x] Keyboard shortcuts (1/2/3/P/R/Del + Esc to close).
- [ ] Swipe gestures on mobile (right=Today, left=Someday, up=Project, down=Trash).
- [x] Empty state: filled teal circle + "Inbox zero. Go do something."
- [x] Reusable components: `DispatchButton`, `TriageCard`

---

## Phase 4 — List Views

> Simpler list pages — grouped lists with completion circles.
>
> **Foundation done:** the data model (`docs/DATA-MODEL.md` v3) is implemented:
> Lens → Goal → Project → {Task, Resource}, plus InboxItem + TaskUpdate.
> Task has `content` (markdown body) + `updates[]` activity log. Tasks can exist
> without projects; projects without goals. Default Work/Me lenses are seeded
> via `ensureOnboarded` on every app load (idempotent). Migration:
> `20260617203913_add_lens_goals_projects_resources_inbox`.

### 4.1 ✅ Today page (`/app/today`)
- [x] Tasks with status=TODAY (not done), grouped by Goal.
- [x] Each row: completion circle + task text + meta chips + size indicator.
- [x] Inline completion (click circle → optimistic done + strike-through).
- [x] Enforces Today cap (5). Overflow UI banner + "Beyond the cap" section.
- [ ] "Done today" section collapsed at bottom (stubbed; needs completed-task query).
- [ ] Drag to reorder (Phase 2).

### 4.2 ✅ Upcoming page (`/app/upcoming`)
- [x] Tasks with status=UPCOMING, grouped by This week / Next week / Later.
- [x] Same TaskRow pattern as Today.

### 4.3 ✅ Someday page (`/app/someday`)
- [x] Flat list, muted (lighter visual weight).
- [ ] Promote to Today/Upcoming via action menu (needs row actions).

### 4.4 ✅ Projects page (`/app/projects`)
- [x] List of projects grouped by Goal (or "Standalone").
- [x] Each row: name, progress (X/Y done bar), due date, next-action preview.
- [x] "No next action" badge for projects without open tasks.

### 4.5 ✅ Goals page (`/app/goals`)
- [x] Grid of goals with aggregate progress %.
- [x] Linked projects + standalone tasks counts.
- [ ] Create/edit goal inline (needs forms).

### 4.6 ✅ Logbook page (`/app/logbook`)
- [x] Completed tasks + projects, grouped by completion day (Today/Yesterday/weekday/date).
- [x] Read-only. Restore/permanent-delete pending.

### 4.0 ✅ Shared components + data layer
- [x] `TaskRow` (reusable) — completion circle + title + meta chips + size.
- [x] `GroupedList` (reusable) — section heading + count + rows.
- [x] `ListHeader` / `ListEmpty` — shared page chrome.
- [x] `LensContext` — active lens shared from AppShell to every page.
- [x] Server ops: `getTasks`, `toggleTaskDone`, `updateTaskStatus`, `getProjects`, `getGoals`, `getLogbook` — all scoped by lensId.
- [x] All 6 nav items flipped from "soon" → live links with active state.

---

## Phase 5 — Settings & Billing Design Integration

> Re-skin existing scaffolded pages to match the design system.
> Goal: Settings and Billing look like they belong to the same app.

### 5.1 ✅ Settings layout
- [x] Upgrade SettingsLayout to use shared tokens + consistent back link with icon.
- [x] Tab navigation matches the teal-accent-bottom-border pattern from prototype.
- [x] Back link styling consistent.

### 5.2 ✅ Account settings page
- [x] Label/value pairs via shared `Field` component (email, name).
- [x] Logout button uses `Button` component (secondary variant).
- [x] "Coming soon" note for change email/password/delete account.

### 5.3 ✅ Preferences page
- [x] Theme toggle (light/dark) — wired to `[data-theme]` + localStorage, in sync with topbar.
- [x] Today cap setting (shown with "soon" chip until configurable).
- [x] Confirmation sounds toggle ("soon" chip).
- [x] Momentum toggle ("soon" chip).
- [x] All toggles use the shared `Toggle` component.

### 5.4 ✅ Billing page
- [x] Active plan state card — uses `Card` + `Chip` for plan name.
- [x] Plan picker grid — uses `Card` (interactive + highlighted variants) for each plan.
- [x] Payment history table — uses shared `Table` component with token styling.
- [x] Banners (success/muted) use `Card` variant.

### 5.5 ✅ New reusable: **Toggle/Switch** (also Phase 0.1)
- [x] Teal accent when on, neutral when off. Smooth thumb slide. role=switch + aria-checked.

### 5.6 ✅ New reusable: **Table**
- [x] Striped rows, header styling, responsive overflow. Column render fns + row[key] fallback.

### 5.7 ✅ New reusable: **Field** (settings row)
- [x] Label/value/toggle/custom variants. Used by Account + Preferences.

### 5.0 ✅ Topbar theme sync
- [x] AppShell theme state reads from localStorage on mount, respects prefers-color-scheme, persists on toggle — stays in sync with Preferences.

---

## Phase 6 — Dark Mode

### 6.1 ✅ Dark tokens
- [x] `[data-theme="dark"]` block in `tokens.css` covering all neutrals, surfaces, borders, text, shadows. Cool-tinted (hue 230) OKLCH, derived from mockup dark values. Accents unchanged; amber-text brightened for legibility.
- [x] `color-scheme` hints so native controls + scrollbars match.

### 6.2 ✅ Toggle wiring
- [x] Theme toggle in topbar sets `data-theme` on `<html>` (via useEffect on state change).
- [x] Persist preference to `localStorage` (key: `aa-theme`).
- [x] Respect `prefers-color-scheme: dark` as default on first visit (in useState initializer).
- [x] AppShell + Preferences page stay in sync (same localStorage key).
- [x] `App.css` body uses tokens (was hardcoded light) + imports tokens.css globally.

### 6.3 ✅ Page-by-page dark QA
- [x] Verified via CDP: body/nav/text/surfaces all flip correctly; accents (teal swatch) stay brand-consistent. Token-driven — every page that consumes `var(--aa-*)` flips automatically.

---

## Phase 7 — Polish & Responsive

### 7.1 ⬜ Keyboard shortcuts system
- [ ] Global shortcut handler: ⌘K (capture), Space (What Now), ? (cheatsheet), Esc (close).
- [ ] Shortcut hints on hover (tooltip or subtle kbd hint).

### 7.2 ⬜ Focus mode overlay
- [ ] Single-task full-screen overlay. Hide sidebar. Task + notes + nothing else.
- [ ] Enter via F key. Esc to exit.

### 7.3 ⬜ Mobile responsive pass
- [ ] Every page tested at 390px (iPhone), 768px (iPad), 1024px+ (desktop).
- [ ] Sidebar → topbar on mobile.
- [ ] What Now card adapts to narrow viewport.
- [ ] Plan picker stacks vertically on mobile.

---

## Done (already implemented)
- ✅ `tokens.css` — design tokens (colors, radii, spacing, shadows, motion)
- ✅ `App.css` — global reset + body defaults
- ✅ `AppShell.tsx` + `AppShell.css` — sidebar scaffold (brand, nav items, user/logout)
- ✅ `LandingPage.tsx` + `LandingPage.css` — full landing page matching prototype
- ✅ `OnboardingPage.tsx` + `OnboardingPage.css` — gesture walkthrough
- ✅ `AuthLayout.tsx` + `auth.css` — auth card with Wasp form retheme
- ✅ `appearance.ts` — Wasp auth color mapping to our tokens
- ✅ `SettingsLayout.css` — tabs + section styles
- ✅ `SettingsPage.css` — account settings styles
- ✅ `BillingPage.css` — full billing page styles (plan grid, table, banners)
- ✅ `PreferencesPage.css` — pref row styles
- ✅ `PublicLayout.css` + `MarkdownPage.tsx` — public pages (About/Privacy/Terms)
- ✅ `WhatNowPage.tsx` — empty state text
- ✅ `/design-system` — living style guide (19 sections covering all components + tokens)
