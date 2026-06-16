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

Things is a list app. ActionAmp demotes the list. The signature surface — the **Focus view** (single task, What Now) — needs a visual treatment Things doesn't have:

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
