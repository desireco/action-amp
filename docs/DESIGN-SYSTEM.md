# ActionAmp Design System — Decided

> **Status: Decided.** Source of truth is `webapp/src/styles/tokens.css` — this
> doc is the human-readable mirror, not a separate spec. Every value below maps
> to a `--aa-*` token (see §6). If the two disagree, `tokens.css` wins; fix this
> doc.
>
> **Lineage.** This replaces the earlier `DESIGN-SYSTEM-DRAFT.md`, which framed
> the system as four open questions (D1–D4, "decisions before tokens"). Those
> questions are all answered and shipped. `DESIGN.md` (root) stays as the
> *Things* DNA reference this system inherits from.

---

## §1. The accent system — two accents, each with a job

Color carries meaning, never decoration. Four semantic accents, one per job:

| Accent | Job | Where you see it |
|---|---|---|
| **Teal** | system / state | completion-circle fill, selection/active state, primary CTA, links. Carries **~30% of any given surface** — it is the primary accent. |
| **Amber** | rare human emphasis | Important priority, the "why this matters" nudge. Pulled toward warm so it reads as emphasis, never alarm. |
| **Violet** | projects / goals | Project and Goal accents — the multi-step / outcome nouns. |
| **Rose** | errors / overdue | Errors and overdue states only. Rare. |

Everything else is a **cool-tinted neutral ramp** (hue 230 in OKLCH). Pure
`#000` and `#fff` are banned — neutrals are near-white/near-black with a faint
cool tint so they read calm and premium rather than clinical.

All colors are defined in **OKLCH** for perceptual uniformity (consistent
visual weight across hues) and wide-gamut display.

> *Inherited from `DESIGN.md` (Things DNA):* the calm-neutral-with-one-hero-
> accent structure, soft blue-tinted shadows, subtle radii, hairline borders,
> generous whitespace. ActionAmp's adaptation: **teal replaces Things blue as
> the hero accent**, amber is added as the human-emphasis layer Things doesn't
> have.

## §2. Lens identity colors

Each Lens (context) carries an **identity color** that signals which context is
active — separate from the system accents above.

- **Seeded lenses:** Work = **indigo** (hue 275), Me = **emerald** (hue 165).
- **User-defined hues (Pro):** slate, cyan, coral, honey, lime, magenta — a
  curated key set, no free-form hex. Reserved hues (teal≈220, amber≈75,
  violet≈295, rose≈15) are deliberately **absent** from the picker so a lens
  can never be mistaken for a system/state, Important, project/goal, or error.

**Guardrail: identity only.** The lens hue colors the lens-switch dot + rail,
the lens-scoped nav, the NextCard context label, the Triage context-step, and a
faint shell background wash. **It never replaces teal** for CTAs, links, or the
completion circle. Inbox and Capture stay neutral (no lens).

Each lens ships a five-step ramp per hue: `base` (dot/rail) · `-text` (legible
colored text) · `-soft` (atmosphere) · `-soft-strong` (tinted fills) · `-mid`
(clear fills that actually read as the hue). The active lens is resolved at
runtime via `<html data-lens="…">` re-pointing the `--aa-active-lens-*` tokens
— see `lensContext.ts` and the `specs/custom-lenses.md` for the full system.

## §3. Light + dark, light default

- **Light is the default.** Respects the Things-calm DNA: airy, fresh start.
- **Dark is non-negotiable for focus.** Single-task view should *feel* like
  dimming the lights. Triggered by `<html data-theme="dark">`, set in
  **Settings → Preferences**.
- The dark theme **overrides neutrals + shadows only.** Accents (teal/amber/
  violet/rose) stay identical to light — they pop against the dark surface and
  keep the brand consistent. Lens `-soft`/`-mid`/`-text` ramps are re-tuned
  per-theme (deeper soft fills, brighter text) for legibility.
- `color-scheme` is set on `<html>` so native form controls and scrollbars
  match.

## §4. Motion — rare and meaningful

Motion is a tool, not decoration. Three jobs only:

1. **Completion payoff** — the circle fill. Feels earned (spring ease, base
   duration).
2. **Reduce perceived jank** — instant for deletes/snoozes (no lingering),
   smooth for transitions.
3. **Focus-mode entry** — the "lights dim, sidebar slides away" transition.

**Default to instant.** Tokens:
`--aa-ease-out`, `--aa-ease-out-quart`, `--aa-ease-spring` (the spring is
reserved for the completion payoff); `--aa-dur-fast` 0.12s, `--aa-dur-base`
0.2s, `--aa-dur-slow` 0.4s. **Respect `prefers-reduced-motion`.**

## §5. The calm-focus layer — ActionAmp's differentiator

Things is a list app; ActionAmp **demotes the list.** The home screen (`/app`,
What Now) is a *chooser* — one task, the next thing that matters — not a list.

- **More whitespace than feels comfortable** at first: the single task is
  centered, large, alone.
- **Everything else fades:** sidebar quiets, counts disappear, nav calms.
- **The one task is the hero:** bigger type than any list would use, the
  completion circle prominent.
- **Lens background wash:** a faint `--aa-active-lens-soft` atmosphere so the
  active context is felt, not shouted.

This is the visual layer Things doesn't have, layered on top of the shared DNA.

---

## §6. Token map

Every decision above resolves to a `--aa-*` token group in
`webapp/src/styles/tokens.css`. Line numbers are approximate; treat
`tokens.css` as authoritative.

| Decision | Token group | `tokens.css` |
|---|---|---|
| Type family (native, no web font) | `--aa-font`, `--aa-font-mono` | L8–11 |
| Teal — system/state | `--aa-teal*` | L14–20 |
| Amber — human emphasis | `--aa-amber*` | L23–26 |
| Violet — projects/goals | `--aa-violet*` | L29–31 |
| Rose — errors/overdue | `--aa-rose*` | L34–36 |
| Lens identity (seeded) | `--aa-lens-indigo*`, `--aa-lens-emerald*` | L44–56 |
| Lens identity (user hues) | `--aa-lens-{slate,cyan,coral,honey,lime,magenta}*` | L63–96 |
| Active-lens runtime | `--aa-active-lens*`, `[data-lens="…"]` blocks | L99–106, L276–334 |
| Neutral ramp (light) | `--aa-bg*`, `--aa-surface*`, `--aa-border*`, `--aa-text*` | L120–132 |
| Radii (4/8 grid) | `--aa-radius-*` | L135–142 |
| Spacing (4/8 grid) | `--aa-space-*` | L145–153 |
| Shadows (blue-tinted, layered) | `--aa-shadow-*`, `--aa-hero-shadow` | L156–161 |
| Motion | `--aa-ease-*`, `--aa-dur-*` | L164–149 |
| Dark-theme overrides | `[data-theme="dark"]` block | L178–230 |

When adding a new lens color: add a `--aa-lens-<k>*` ramp in `:root`, mirror it
in the `[data-theme="dark"]` block, and add a `[data-lens="<k>"]` block. The
`Lens.color` value in `schema.prisma` must match `<k>`.

---

## §7. Component inventory

The design-system components live in `webapp/src/components/ui/`. One role
each; full props in their `.tsx`:

| Component | Role |
|---|---|
| `CompletionCircle` | *The signature.* Empty circle → teal-filled with check. The product's emotional payoff. |
| `NextCard` | The What Now hero — the one next task, large and alone. |
| `TriageCard` | Per-item triage surface (Context → Type → Spec → Complete). |
| `ModeDial` | Work / Plan / Review mode switcher. |
| `LensSwitch` | Adaptive lens picker (segmented control ≤3 lenses, chip+popover ≥4). |
| `ZoomDock` | Mode × Zoom spine control. |
| `Breadcrumb` | "Where am I" anchor trail (mode → area → item). |
| `Button` | Primary / secondary tiers. Secondary carries visible `border-strong` + subtle shadow. |
| `Card` / `GroupedList` | Surface containers (8px radius, hairline border, optional elevation). |
| `Chip` | Compact label (date / priority / tag), tinted by accent. |
| `DispatchButton` | Action button whose `tone` picks the accent: teal / amber / violet / rose / muted. |
| `TaskRow` | One task in a list context (used sparingly — the list is demoted). |
| `NavItem` | Sidebar / source-list item, fills `surface-muted` when active. |
| `Toggle` | On/off switch. |
| `Table` | Rare — only for dense reference data. |
| `BottomSheet` / `ConfirmDialog` / `CapturePopover` / `LensPopover` / `SnoozeSheet` / `ResourcePickerSheet` | Overlays (see `docs/modal-approach.md`). |
| `BrandMark` | Logo / wordmark. |
| `ProGate` | Entitlement upsell surface (replaces locked controls for FREE). |
| `AuthLayout` | Auth-page shell. |
| `icons.tsx` | The icon set (inline SVG, icon-leading in buttons). |

The gallery route `/design-system` (`DesignSystemPage.tsx`) showcases these
live — open it to see every component against the real tokens.

---

## §8. Do's and Don'ts

**Do**
- Use the system font. Always. It is the brand.
- Let teal carry selection, completion, and the primary CTA. It is the hero accent.
- Reserve amber for genuine human emphasis (Important, "why this matters").
- Layer two soft, blue-tinted shadows for elevation; add a 1px hairline border for definition.
- Leave generous whitespace. If a section feels crowded, remove something.
- Keep radii in the 4–8px range for UI; `radius-full` only for the completion circle.
- Make secondary/tertiary buttons look tappable: visible `border-strong` + subtle shadow, never a faint outline alone.
- Lay out buttons `inline-flex` with icon *leading*, never stacked above the label.
- Set `<html data-theme>` and `<html data-lens>` so the runtime tokens resolve.

**Don't**
- Don't introduce a custom display/web font. It breaks the native trust.
- Don't use color decoratively. Every hue must mean something.
- Don't use pure `#000` or `#fff`. Use the cool-tinted neutral ramp.
- Don't use `radius-full` (pill) shapes on buttons or cards — it dilutes the completion circle.
- Don't use gradients as decoration. Flat color + physical depth, not chromatic.
- Don't add badges, red-dot counts, streaks, or guilt-trip UI. The calm is the point.
- Don't use neumorphism, glassmorphism, or aurora blobs. The depth is physical and restrained.
- Don't let a lens identity color replace teal for CTAs, links, or the completion circle. Lens color is identity only.
- Don't ship motion that lingers — deletes/snoozes are instant; reserve animation for the completion payoff, transitions, and focus-mode entry.
