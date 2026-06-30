# ActionAmp Design System — DRAFT (decisions needed)

Before I write the tokens, four product-level decisions shape the whole system.
My leans are marked **(lean)**. Push back on any.

---

## D1. The signature accent color

Things owns blue. ActionAmp needs its own hue that says "focus / forward-motion / energy."
The accent does three jobs: completion-circle fill, selection/active state, primary CTA.

Candidates (all pass WCAG AA on white):
- **Electric teal/cyan** `#0EA5E9`-ish — "signal through noise," tech-forward, distinct from Things.
- **Warm amber/orange** `#F59E0B`-ish — energy, momentum, "go." Polarizing; can feel stressful.
- **Green** `#16A34A`-ish — "done / go / progress." Natural for a doing-app. Risk: reads too "success badge."
- **Keep Things blue** `#5C9CF5` — instant familiarity, but we borrow their identity.

**(lean: electric teal `#0EA5E9` family)** — signals focus/forward, clearly ours, calm but not sleepy.
The completion circle fill is the emotional climax — teal "lit up" reads like *activation*.

**Lens identity palette (decided 2026-06-30).** Each Lens (Work / Me) carries an
identity color that signals which context is active: **Work = indigo** (hue ~255),
**Me = emerald** (hue ~150). Both sit ≥35° from every reserved hue (teal 220,
amber 70, violet 295, rose 15), so they read as a distinct category — context —
without colliding with system/state, Important, projects/goals, or errors.

Guardrail: the lens hue is **identity only**. It colors the lens-switch dot + rail,
the lens-scoped nav rail, the NextCard context label, the Triage context-step,
and a faint shell background wash. It never replaces teal for CTAs, links, or the
completion circle. Inbox and Capture stay neutral (no lens). Implemented as palette
keys (`Lens.color`) resolved via `<html data-lens>` into `--aa-active-lens-*`
runtime tokens in `styles/tokens.css`.

## D2. Light-first or dark-first?

The app is for focus/ADHD. Two competing arguments:
- **Dark-first:** reduces visual noise, feels immersive for single-task focus mode, modern default for power tools (Linear, Arc).
- **Light-first:** Things' DNA is light + airy + calm. Daytime use dominates. Light reads "fresh start."

**(lean: ship both at launch, light default)** — respect Things' calm for the default, but dark mode is non-negotiable for the focus-view (single-task mode should *feel* like dimming the lights).

## D3. Motion philosophy

For a focus app, motion is a tool, not decoration. Three jobs only:
1. **Completion payoff** — the circle fill animation. Must feel *earned* (120–200ms, slight spring).
2. **Reduce perceived jank** — instant for deletes/snoozes (no lingering), smooth for transitions.
3. **Focus-mode entry** — the "lights dim, sidebar slides away" transition into single-task view.

**(lean: motion is rare and meaningful; default to instant).** Respect `prefers-reduced-motion`.

## D4. The "calm focus" differentiator (vs Things)

Things is a list app. ActionAmp demotes the list. The signature surface — the **Focus view** (single task, Next) — needs a visual treatment Things doesn't have:

- **More whitespace than feels comfortable** at first — the single task is *centered, large, alone*.
- **Everything else fades** — sidebar dims or hides, counts disappear, nav quiets.
- **The one task is the hero** — bigger type than any list would use, generous padding, the completion circle prominent.

**(lean: define a `focus-canvas` + `focus-task` token group that's deliberately more spacious than `card`)**.

---

## What I'll lock in the design system (once D1–D4 are decided)

1. **Color tokens** — accent family, neutral ramp (light + dark), semantic (priority/size/status), all WCAG AA.
2. **Type scale** — system font (inherit Things' native-font principle), sizes tuned for the Focus view's larger hero text.
3. **Spacing & radii** — 4/8px grid, 4–8px radii, full-radius reserved for completion circle (inherit).
4. **Elevation** — soft, layered, *tinted-with-accent* shadows (not pure black; not Things' blue tint — our accent tint).
5. **Component inventory** mapped to PAGES.md:
   - completion-circle (signature), focus-canvas, focus-task, task-row, inbox-row, sidebar, lens-switch, moment-bar, triage-card, palette (cmd-k/cmd-\), xl-breakdown-modal, project-card, goal-card, resource-link, logbook-entry.
6. **Priority/Size visual encoding** — Important/Normal/Low + S/M/L/XL need distinct, calm visual signals (not red dots).
7. **Do's and Don'ts** — the guardrails that keep the calm as we build.
