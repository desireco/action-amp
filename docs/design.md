---
name: Things (reference)
description: Design DNA extracted from Cultured Code's Things (culturedcode.com/things) — captured 2026-06-15. Foundation reference for ActionAmp's design system, not the final ActionAmp identity.
colors:
  # ---- Brand blue (signature accent) ----
  blue-accent: "#5C9CF5"      # the iconic Things blue — selection, completion, links
  blue-accent-bright: "#649FFF"
  blue-accent-soft: "#92BBFE"
  blue-cta: "#2576EB"         # deeper blue for buttons / strong CTAs
  blue-cta-hover: "#3C84F3"
  # ---- Neutral surfaces (light) ----
  white: "#FFFFFF"
  surface: "#FCFCFD"
  surface-raised: "#F8F9FB"
  surface-muted: "#F2F5F7"
  surface-muted-2: "#ECEEF0"
  border: "#E6E8EC"
  border-strong: "#D5D9DE"
  # ---- Text (light theme) ----
  text-primary: "#212224"
  text-secondary: "#44474B"
  text-tertiary: "#55606E"
  # ---- Deep navy (dark sections / footers) ----
  navy-deep: "#26344A"
  navy-darker: "#303336"
  # ---- Accents ----
  highlight-yellow: "#FCF9CF"  # soft highlight, used sparingly
  accent-red: "#FA1955"        # rare — error / urgent
typography:
  # Native system font — Things uses NO custom web font. SF Pro on Apple, Roboto on Android.
  # This "native feel" is core to the brand: the app looks like it belongs to the OS.
  body-md:
    fontFamily: ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.4
  body-lg:
    fontFamily: ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.4
  label-md:
    fontFamily: ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1.3
  headline-md:
    fontFamily: ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.2
  headline-lg:
    fontFamily: ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.2
  headline-display:
    fontFamily: ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif
    fontSize: 3.5rem
    fontWeight: 700
    lineHeight: 1.1
rounded:
  none: 0px
  xs: 4px
  sm: 6px       # default UI elements (chips, small buttons, inputs)
  md: 8px       # cards, raised surfaces
  lg: 1em       # large feature blocks
  full: 9999px  # circular completion checkmarks (signature)
spacing:
  # Things uses an em-based rhythm, but a clean 8px grid maps cleanly onto it.
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  4xl: 96px
components:
  # ---- The signature completion circle (Things' most iconic element) ----
  completion-circle:
    size: 20px
    rounded: "{rounded.full}"
    backgroundColor: "{colors.blue-accent}"
    textColor: "{colors.white}"
  completion-circle-empty:
    backgroundColor: transparent
    rounded: "{rounded.full}"
    size: 20px
  # ---- Primary CTA button ----
  button-primary:
    backgroundColor: "{colors.blue-cta}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: 12px
    typography: "{typography.label-md}"
  button-primary-hover:
    backgroundColor: "{colors.blue-cta-hover}"
  # ---- Surfaces / cards ----
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 24px
  card-elevated:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    padding: 24px
  # ---- Source list / sidebar item ----
  sidebar-item:
    rounded: "{rounded.sm}"
    padding: 8px
    typography: "{typography.body-md}"
  sidebar-item-active:
    backgroundColor: "{colors.surface-muted}"
---

## Overview

Things is the gold standard for calm, refined productivity UI. The design philosophy, distilled:

- **Native, not custom.** The app uses the operating system's own font (SF Pro on Apple, Roboto elsewhere) and defers to OS conventions wherever possible. It looks like it *belongs* — never shows off.
- **Calm by restraint.** A near-neutral palette with a single signature accent (the Things blue). Color is meaning, never decoration. Whitespace is generous; the page breathes.
- **Depth is physical, not flashy.** Shadows are soft, layered, and subtle — objects feel placed on a surface, not floating in a void. No neumorphism, no glassmorphism, no gradients-as-decoration.
- **The blue is sacred.** `#5C9CF5` is selection, completion, and affirmation. When you finish a task, the circle fills with this blue — it's the emotional payoff of the whole product. Use the blue sparingly so it keeps that weight.
- **Circular completion is the icon.** The empty circle → filled blue circle transition is Things' most recognizable element. It is never replaced, never restyled.

> Source: extracted from `culturedcode.com/things` HTML + CSS (`things.css`, `shared.css`), validated 2026-06-15. The marketing site reflects the brand; the app amplifies these principles with native macOS/iOS chrome.

## Colors

**A near-monochrome palette with one hero accent.**

- **`blue-accent` (#5C9CF5)** — *the Things blue.* Completion circles, selection, active states, links. Used sparingly so it retains emotional weight. This is the single most important color in the system.
- **`blue-cta` (#2576EB)** — deeper blue for buttons and strong calls-to-action. More saturated for contrast against white.
- **Neutrals (`white` → `border-strong`)** — a cool, slightly-blue gray ramp (`#FFFFFF`, `#FCFCFD`, `#F8F9FB`, `#F2F5F7`, `#ECEEF0`, `#E6E8EC`, `#D5D9DE`). The cool tint is what makes the neutrals feel "premium" rather than clinical. Pure gray reads sterile; these read calm.
- **Text (`text-primary` #212224 → `text-tertiary` #55606E)** — near-black with a hint of warmth/depth, three levels for hierarchy. Never pure `#000`.
- **`navy-deep` (#26344A)** — for dark sections and footers. A desaturated navy, not zinc or slate. Pairs with the blue family.
- **`highlight-yellow` (#FCF9CF)** — a soft, pale yellow for subtle emphasis (like a highlighter). Used *very* sparingly.
- **`accent-red` (#FA1955)** — errors and urgency only. Rare.

**Color rule:** if a color doesn't carry meaning (status, selection, hierarchy, error), it shouldn't be there. No decorative color.

## Typography

**One family: the system font. No web font, no display face.**

- **Family:** `ui-sans-serif, -apple-system, BlinkMacSystemFont, Roboto, sans-serif` — resolves to **SF Pro** on macOS/iOS, **Roboto** on Android, **Segoe UI** on Windows. The app always looks native.
- **Hierarchy by weight + size, not family.** Weights 400 (body) → 600 (labels/medium) → 700 (headlines) → 800 (display, sparingly). No italics for hierarchy; no all-caps shouts.
- **Line heights are tight on display (1.1–1.2), relaxed on body (1.4).** Headlines feel structured; body copy feels readable.
- **No letter-spacing tricks.** Things does not track out labels or uppercase eyebrows. The type is confident at its natural spacing.

**Type rule:** the system font is the brand. Don't introduce a "designer" display face — it would break the native feel that makes Things trustworthy.

## Layout

**Generous whitespace, em-based rhythm, an 8px-friendly grid.**

- Things writes spacing in `em` (relative), but the values map cleanly to a **4/8px base grid** (`4, 8, 16, 24, 32, 48, 64, 96`). Use the 8px grid in code; the em rhythm was a web-rendering convenience.
- **Section padding is large** — the page breathes. Vertical rhythm between major sections is 64–96px.
- **Content max-width is narrow** (~972px breakpoint suggests a focused reading column). Things does not stretch content edge-to-edge.
- **Breakpoints:** `420px` / `734px` / `972px` — mobile-first, Apple-device-aligned (734px ≈ iPad portrait width).

## Elevation & Depth

**Soft, layered, physical. Never harsh, never flat.**

Shadows extracted from the live CSS — note the patterns:

- **Card / surface lift:** `0 2px 4px rgba(0,28,70,.12), 0 2px 16px rgba(0,28,70,.12)` — a tight close shadow + a soft ambient shadow. Two-layer, blue-tinted (not pure black).
- **Hero / device mockups:** `0 2px 4px rgba(0,0,0,.1), 0 4px 16px rgba(0,0,0,.1), 0 8px 32px rgba(0,0,0,.1)` — three layers escalating in blur. This is how Things gets that "floating hardware" look for device frames.
- **Deep elevation:** `0 2px 4px -2px rgba(0,0,0,.06), 0 4px 8px -2px ..., 0 8px 16px -2px ..., 0 16px 32px -2px ..., 0 0 0 1px rgba(0,0,0,.08)` — four shadow layers + a 1px ring. Reserved for the most prominent surfaces.
- **Hairline borders everywhere instead of shadows where possible.** `1px solid #E6E8EC` does more work than a shadow in most cases.

**Elevation rules:**
1. Shadows are **blue-tinted, not pure black** — `rgba(0,28,70,.x)` or `rgba(0,20,49,.x)`, never `rgba(0,0,0,.x)` alone. This is the secret to "premium" shadow.
2. Use **2–4 layers**, not one. Close shadow for definition + ambient shadow for depth.
3. **A 1px border often beats a shadow.** Default to hairline borders; reserve shadows for things that should feel lifted (cards on hover, modals, device frames).
4. **Dark theme** flips to `rgba(255,255,255,.x)` lifts and `rgba(0,0,0,.x)` ambient.

## Shapes

**Subtle radii. Never pillowy, never sharp.**

- **4–8px is the working range** for almost everything — chips, inputs, small buttons (5–6px), cards (8px). Generous enough to feel modern, restrained enough to feel precise.
- **`rounded.full` (9999px)** is reserved for one thing: **the completion circle.** That's its job. Don't use full-radius on buttons or cards — it would dilute the completion circle's specialness.
- **Device mockups** use percentage radii (e.g. `13% 13% 0 0` for iPhone frames) — that's hardware mimicry, not a system token.

## Components

- **`completion-circle`** — *the signature.* 20px, full-radius. Empty state = transparent with a thin border. Filled state = `blue-accent` with a white check. The fill animation is the product's emotional climax — make it feel earned.
- **Buttons (general pattern)** — every `.btn` uses `display: inline-flex; align-items: center; gap: 6px;` so an icon + label always lay out horizontally (icon *leading*, never stacked above the text). The global `svg { display: block }` rule would otherwise stack the icon — `inline-flex` on the button overrides it.
- **`button-primary`** — solid `blue-cta`, white text, 8px radius, 10–12px padding, semibold. No border, no shadow by default. Hover lightens to `blue-cta-hover`. Calm, not loud.
- **`button-secondary` (the Switch / Cancel tier)** — `surface` background, `text-2` label, **visible `border-strong` border + subtle `shadow-sm`** so it reads clearly as a tappable button (not a text link). Hover darkens background + border. Never use a faint `border`-tier outline on its own — a secondary button must look like a button, not hover ambiguously between text and control.
- **Icon-leading buttons** — when a button carries an icon, the icon comes *before* the text (e.g. `[ ⌘ Switch ]`, `[ + Capture ]`), 13–14px, same color as the label. Never icon-above-text.
- **`card`** — `surface` background, 8px radius, 24px padding, optional 1px border. `card-elevated` adds the two-layer blue-tinted shadow.
- **`sidebar-item`** — 6px radius, 8px padding, transparent by default, fills with `surface-muted` when active. Source-list pattern, à la macOS Finder/Preferences.

## Do's and Don'ts

**Do**
- Use the system font. Always. It is the brand.
- Treat `#5C9CF5` as the only accent. Completion and selection are its job.
- Layer two soft, blue-tinted shadows for elevation. Add a 1px border for definition.
- Leave generous whitespace. If a section feels crowded, remove something.
- Keep radii in the 4–8px range for UI; full-radius only for completion circles.
- Respect `prefers-color-scheme: dark` — Things ships a beautiful dark mode.

**Don't**
- Don't introduce a custom display/web font. It breaks the native trust.
- Don't use color decoratively. Every hue must mean something.
- Don't use pure black (`#000`) for text or shadows. Use the warm/cool-tinted near-blacks.
- Don't use full-radius (pill) shapes on buttons or cards. It dilutes the completion circle.
- Don't use gradients as decoration. Things is flat color + depth, not chromatic.
- Don't add badges, red-dot counts, or guilt-trip UI. Things' calm is the point.
- Don't use neumorphism, glassmorphism, or aurora blobs. The depth is physical and restrained.
- Don't stack a button icon above its label. Buttons are `inline-flex` with icon leading.
- Don't ship a secondary/tertiary button with only a faint border. If it's tappable, it must *look* tappable — visible `border-strong` + subtle shadow.

## How to use this for ActionAmp

This is the **reference**, not the final identity. When we build ActionAmp's design system:

1. **Inherit:** native font, the calm-neutral-with-one-accent structure, soft blue-tinted shadows, subtle radii, hairline borders, generous whitespace.
2. **Adapt the accent.** ActionAmp's signature color may be the Things blue, or it may be its own hue — but the *role* (one hero accent for selection/completion/affirmation) stays. The "completion payoff" must remain emotionally central.
3. **Keep the completion circle** as a first-class component. ActionAmp is about *doing the next thing* — the moment you complete it should feel as good as it does in Things.
4. **Add the "calm focus" layer.** Things is a list app; ActionAmp demotes the list. The design system should support a *single-item focus view* (even more whitespace, even less chrome) that Things doesn't have. That's ActionAmp's visual differentiator on top of the Things DNA.
