# ActionAmp — Overlay & Modal Approach

The app uses **four overlay patterns**. Each has a specific job. Don't mix them.

| # | Pattern | When | Dismissal |
|---|---|---|---|
| 01 | **Full-screen overlay** | Immersive flows that own the screen | Esc / explicit close |
| 02 | **Capture popover** | Quick input, never blocks flow | Esc / backdrop click / submit |
| 03 | **Bottom sheet** | Mobile-first actions, thumb zone | Esc / swipe down / backdrop |
| 04 | **Confirm dialog** | Destructive / irreversible (rare) | Explicit choice only |

All four share the same **shell mechanics** (backdrop, focus, scroll-lock, motion) — see below.

---

## 01 — Full-screen overlay

Takes over the entire viewport. No app chrome visible behind it.
Used when the user has committed to a focused flow.

**Used by:**
- **Triage** — the Tinder-style inbox walkthrough (`triage-tinder.html` prototype)
- **Focus mode** — single-task full-screen do-only view (Phase 7.2)
- **Onboarding coach** — gesture walkthrough (`mobile-coach.html`)

**Anatomy:**
- Top row: close button (Esc) + progress (when sequential)
- Center: the primary content (card, task, walkthrough)
- Bottom: action cluster (ModeDial + ZoomDock + Capture) when applicable

**Dismissal:** Esc key or explicit "Done" button. Backdrop is opaque (no peek-through) because the underlying app state is irrelevant to the flow.

**Motion:** content rises in (`translateY(10px) → 0`, 500ms, `--aa-ease-out-quart`). Exit reverses at ~60% duration.

---

## 02 — Capture popover

Centered card over a dimmed backdrop. Lightweight — the user hasn't left their context.
Used for quick capture and inline edits.

**Used by:**
- **⌘K Capture** — the universal quick-add (triggered from the topbar kbd button)
- **Quick edit** — inline field edits that need room
- **Search / ⌘P** — command palette

**Anatomy:**
- Centered card, max-width 480px
- Auto-focuses the input
- Footer with submit hint (`⏎ to save`)

**Dismissal:** Esc, backdrop click, or submit. The backdrop click is intentional — capture should never trap the user.

**Motion:** backdrop fades in 150ms, card scales from 0.96 → 1 with `--aa-ease-spring` for a confident arrival.

---

## 03 — Bottom sheet

Mobile-first. Slides up from the bottom edge, anchored in the thumb zone.
Used for action menus and the "Not now" snooze flow.

**Used by:**
- **"Not now" snooze** — 1h / 3h / tomorrow / weekend / Someday (from What Now card)
- **Action menus** — row-level actions on tasks/projects
- **Filter / sort** — list controls

**Anatomy:**
- Anchored to bottom, full-width on mobile, max-width 480px centered on desktop
- Top edge: grabber handle (visual affordance for swipe-down)
- Content: list of options as large tap targets (≥44px)
- Backdrop dimmed above

**Dismissal:** Esc, swipe down (drag handle past 25% height), or backdrop click.

**Motion:** slides up `translateY(100%) → 0`, 300ms, `--aa-ease-out-quart`. Drag tracks finger 1:1 during gesture; release commits or cancels based on threshold.

---

## 04 — Confirm dialog

Small centered card. **Rare** — only for irreversible destruction.
The user must make an explicit choice; backdrop click does NOT dismiss.

**Used by:**
- **Delete account** (Settings)
- **Discard unsaved changes**
- **Permanently delete** (from Logbook trash)

**Anatomy:**
- Small card, max-width 400px
- Clear title stating the action ("Delete account?")
- Body explaining the consequence
- Two buttons: destructive (rose `Button variant="danger"`), cancel (`Button variant="secondary"`)

**Dismissal:** only via the buttons. Backdrop click is inert. Esc maps to Cancel.

**Motion:** same as capture popover but without the spring — a flat fade + slight scale, so it feels serious, not playful.

---

## Shared shell mechanics

All four overlays share these behaviors. When we build a `<Modal>`/`<Overlay>` component (Phase 0), it will encode these once.

### Backdrop
- Color: `oklch(0.2 0.02 230 / 0.4)` — cool-tinted dim, never pure black.
- Click dismisses **non-blocking** overlays (capture, bottom sheet). Inert for **blocking** overlays (confirm).

### Focus management
- On open: focus moves to the overlay's first interactive element.
- While open: focus is **trapped** inside (Tab cycles within the overlay).
- On close: focus returns to the element that opened it.

### Scroll lock
- `body { overflow: hidden }` while any overlay is open. Prevents background scroll bleed-through.

### Keyboard
- **Esc** closes every overlay (maps to Cancel for confirm dialogs).
- **Tab / Shift+Tab** cycle focus within the overlay.
- Overlay-specific shortcuts (e.g. `1/2/3` in triage) are scoped — only active while that overlay is open.

### Motion
| Phase | Property | Duration | Easing |
|---|---|---|---|
| Backdrop enter | opacity 0 → 1 | 150ms | `--aa-ease-out` |
| Content enter | translateY/scale | 250–500ms | `--aa-ease-out-quart` (or spring for capture) |
| Exit (both) | reverse | ~60% of enter | `--aa-ease-out` |

All motion respects `prefers-reduced-motion: reduce` (snaps to final state, ~0ms).

### z-index scale
| Layer | z-index |
|---|---|
| App content | 0 |
| Topbar / sidebar | 10 |
| Capture popover | 40 |
| Bottom sheet | 40 |
| Confirm dialog | 100 |
| Full-screen overlay | 100 |
| Toast / coach mark | 1000 |

Higher = more blocking. Confirm and full-screen share the top app layer; toasts and coach marks float above everything.

---

## Decision guide

> "I need to show the user something over the current view."

1. **Is it a destructive/irreversible action?** → Confirm dialog (04)
2. **Is it an immersive flow they've committed to?** → Full-screen overlay (01)
3. **Is it quick input that shouldn't block?** → Capture popover (02)
4. **Is it a mobile action menu?** → Bottom sheet (03)

If none of these fit, it probably isn't an overlay — it's a page, a row expansion, or inline UI. Default to inline; reach for an overlay only when the content genuinely needs to take focus.
