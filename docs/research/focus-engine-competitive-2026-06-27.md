# Research: focus-engine-v2 — how competitors model energy/time (2026-06-27)

> Evidence base for `docs/specs/focus-engine-v2.md`'s Open Questions. Read
> alongside the spec's "Open questions" section. Discover's working notes.

## The question

ActionAmp's matcher is priority-only today (`getTopTask`: priority → size →
oldest). The roadmap bets that adding **time-available + energy** matching is
the differentiator vs the single-task crowd. Before building, we needed to know:
how do Tiimo / Sunsama / Forget actually model energy, and does auto-matching
help or hurt?

## What the evidence says

### Tiimo — energy exists, but it's manual, not a matcher
Tiimo has **mood/energy tracking** and "flexible routine adjustment to match
your energy and focus levels." But the *matching* is the user's own time-block
decision — Tiimo surfaces your energy state and the tasks, and *you* place
them. It does not pick the next task for you. ([tiimoapp.com](https://www.tiimoapp.com/))

### Sunsama — deliberately no auto-scheduling by energy
Sunsama is "primarily a manual planner" with **no built-in AI energy-based
auto-scheduling.** Users who practice energy-matching do it by hand, via
channels and timeboxing. The calm/premium player in the category chose manual
on purpose. ([morgen.so comparison](https://www.morgen.so/blog-posts/sunsama-vs-akiflow))

### The single-task wedge crowd (Llama Life, Forget, Tiimo, Bento)
None of the "show one task" apps auto-match on energy. Their value is
*hiding the list* + sequential guidance, not algorithmic selection.

## The decisive read (and a correction)

**No competitor in the focus/todo category auto-matches on energy.** The
universal pattern is: the app surfaces state (energy, time), the human places
the task.

> **Correction to an earlier framing:** I first read this as "so we shouldn't
> build it" and demoted the matcher to the icebox. That was wrong. Competitor
> behavior is *context*, not a *veto*. ActionAmp exists precisely because
> every todo app makes the safe choice; copying Tiimo's manual approach would
> erase the wedge. The matcher is FEATURES.md F10's explicitly-planned
> refinement layer ("added later, on top of priority + size"), not a
> speculative bet — the question was always *when*, not *whether*.

What the evidence *does* legitimately inform:

1. **The override question is resolved by principle, not precedent.** Priority
   is an explicit user signal; time/energy are filters that re-order *within*
   a priority tier, never across it. The matcher never demotes an Important
   task because the moment is wrong — it surfaces the mismatch honestly in the
   "why" line instead. Calm + transparent, by PRODUCT.md.
2. **The unambiguous, low-risk win is the transparency layer** — the "why
   this?" line. It's cheap, on-brand, and a prerequisite for the matcher
   (which extends the line to explain the moment-fit). Ship it first as
   `focus-why-transparent`; the matcher builds on it.
3. **The calm constraint is real and self-imposed.** The moment bar must not
   crowd the home screen (PRODUCT.md: "whitespace is the point"). That's a
   design-discipline note for implementation, not a reason not to build.

## Resolutions to the spec's Open Questions

| # | Question | Resolution |
|---|---|---|
| 1 | Energy model (3 levels vs 2 axes) | **Defer.** No competitor proves the 3-level model is right; building the input before the matcher is decided is cart-before-horse. |
| 2 | How much does matcher override the user? | **Resolved: it must not override priority.** Priority is an explicit user signal; energy/time are filters, never a demotion of an Important task. The matcher re-orders *within* priority, never across it. |
| 3 | Moment bar always-visible vs progressive? | **Defer** (tied to whether the matcher ships at all). |
| 4 | Where do energy/time tags come from? | **Defer** (same dependency). |
| 5 | Does it move retention, or is it nice-to-have? | **Open — this is now the gate.** Given no competitor does it and the calm-brand risk, this must be validated (roast / prototype / wait-for-data) before building. |

## Recommendation

- **`focus-why-transparent` (`ready`)** — ship first. The cheap transparency
  layer the matcher will extend. No matcher change, no schema change.
- **`focus-engine-v2` (`ready`)** — the moment-aware matcher, sequenced after
  the front-door fixes and the transparency line. Built on the product's own
  terms (FEATURES.md F10's planned layer), not on competitor precedent.

Sources: [Tiimo](https://www.tiimoapp.com/), [Morgen — Sunsama vs Akiflow](https://www.morgen.so/blog-posts/sunsama-vs-akiflow), [Morgen — ADHD productivity apps](https://www.morgen.so/blog-posts/adhd-productivity-apps), [Any.do — ADHD task management](https://www.any.do/blog/task-management-adhd-apps-strategies/).
