# Roast: is the ActionAmp wedge defensible in 2026? (2026-06-27)

> Adversarial council run via the `roast` skill against ROADMAP §Open strategic
> questions #1. Evidence-grounded; the verdict feeds back into the roadmap.

## The brief judged

ActionAmp: a web focus app that opens to *one task* (not a list), betting the
*decision* is where overwhelm lives. Single-maker, zero audience, live but
unused, **$79.50/yr**. Wedge claim: a transparent matcher + GTD/PARA structure
+ calm brand. Market: "single-task focus" is now crowded (Llama Life, Tiimo,
Bento, One Thing, Forget); none proven at $80/yr; Things 3 stagnating but
losing users to *feature-rich* apps, not calm ones; to-do market $3.2B→$7.8B
but **winner-takes-most**.

## Verdict: RESHAPE (confidence: medium-high)

**One-line call:** The wedge is real and demand-voiced, but ActionAmp today
sells the *promise* of a smart matcher at a *premium* price while delivering a
transparent priority sort in a category that charges half as much. **The
matcher has to actually be smart before the price is defensible; the price has
to come down until it is.**

**Aggregate: 4.6/10** (Contrarian 3 · Expansionist 7 · First-Principles 5 ·
Researcher 4 · Buyer 4)

## The three things that drove it

1. **Price/category mismatch.** The single-task cohort tops out at ~$54 (Tiimo
   IAP); ActionAmp's $79.50 is off the category's curve, priced like Sunsama
   ($192) while delivering Llama Life's surface. PRICING.md calls $80 "the
   loneliest spot" — it's actually *off the curve*.
2. **Winner-takes-most.** 2026 State of Subscription Apps: top 10% grew 306%,
   median ~flat. A no-distribution single-maker app fights for the flat median
   unless the matcher breaks it into the top decile. ([Sub Club](https://subclub.com/episode/the-2026-state-of-subscription-apps-report))
3. **The moat is the weakest shipped part.** The matcher (`getTopTask`) is an
   honest priority sort — what every todo app does. The pitch promises "picks
   the *right* task"; the product delivers "picks the *highest-priority* task."
   `focus-engine-v2` + `focus-why-transparent` (ready specs, not built) are
   what close that gap.

## What's genuinely good (don't lose these)

- **The demand is voiced verbatim in the wild.** ADHD Instagram: *"which one
  of the 97 things do I prioritize for NOW?"* — that is ActionAmp's pitch,
  said by the target user unprompted. The decision-thesis is not invented.
- **ADHD-niche conversion is 8–12%** vs 2–4% general — the audience *will* pay
  at a higher rate, if reached.
- **The structure layer is the real copy-defensible moat.** Goals/Projects/
  Lenses is what Llama Life/Tiimo can't add in a sprint. The matcher is a
  feature; the structure is an architecture.

## The 48-hour test (do this before building more)

**Manual matcher sessions, no code.** Recruit ~20 overwhelmed people from
r/ADHD / r/productivity (free). Have them dump their real 20-task list; *you*
manually pick "the one task" + write the "why this" line using ActionAmp's
intended logic (priority + size-fit + energy). Send it back. Measure the
reaction:

- "Oh yeah, that *is* the right one" → matcher logic is sound → build it.
- "No, I'd do X first" → logic isn't surprising → reshape before coding.

This tests load-bearing assumption #2 ("a machine can pick your next task well
enough to trust") directly, for zero money. It's the test nobody has run, and
it's the one that decides whether the wedge is defensible.

## Implications for the roadmap

- **`focus-engine-v2` + `focus-why-transparent` are not "nice features" — they
  are the defensibility.** Their priority rises: they're what make the $80
  coherent. Sequence them before any public launch.
- **The $79.50 anchor is not defensible until the matcher surprises.** Don't
  move the price yet (no data), but treat it as *provisional* — the 48-hour
  test + matcher ship are what earn it.
- **The 48-hour manual-matcher test is a Discover action that needs no spec**
  and should run *before* Build ships the matcher, so the matcher builds on
  validated logic rather than assumed logic.

Sources: [Dataintelo – to-do market](https://dataintelo.com/report/global-to-do-list-apps),
[Sub Club – 2026 State of Subscription Apps](https://subclub.com/episode/the-2026-state-of-subscription-apps-report),
[Rivva – Things alternatives](https://blog.rivva.app/p/things-alternatives),
[Medium – Leaving Things 3](https://medium.com/macoclock/why-i-finally-left-things-3-after-nearly-a-decade-166de45bfce8),
[Llama Life](https://llamalife.co/), [Tiimo](https://www.tiimoapp.com/),
[Akiflow – Bento vs Llama Life](https://akiflow.com/blog/bento-vs-llama-life/).
