# ActionAmp — Interaction Model (the moat)

> Status: EXPLORATION — 2026-06-16
> The thesis: **every task manager optimizes states (the list, the card).
> Nobody optimizes transitions. ActionAmp's differentiation is interactional.**
> Visual DNA is Things (calm, minimal, lively). The *behavior* is unlike any of them.

---

## 1. The enemy: the sidebar of nouns

Every task manager — Things, Todoist, TickTick, Asana, Linear's tasks, Sunsama —
navigates via a sidebar of nouns: Inbox / Today / Projects / Goals / Logbook.

This flattens **five genuinely different cognitive modes** into five
interchangeable list-views. But they are not the same job:

| Mode | What your brain does | Register |
|---|---|---|
| **Doing** (What Now) | singular, committed | present, locked-in |
| **Capturing** (Inbox) | open, receptive | permissive, fast |
| **Planning** (Today/Upcoming) | arranging, committing | deliberate |
| **Organizing** (Projects/Goals) | architectural | hierarchical, "why" |
| **Reviewing** (Logbook) | reflective | past-facing, meaning-making |

Same UI + different data = why they all feel the same.
**ActionAmp treats each mode as a place, not a page.**

## 2. The four transitions to innovate

User-named. Each is a verb, each currently mistreated as navigation.

### T1. Switching Lens (Work / Me) — *crossing a threshold*
Today: a segmented toggle. The moment is psychologically huge — closing one
world, opening another. **Should feel like a boundary.** One gesture; the whole
workspace re-scopes with a visible transition. Maybe a warmth shift (Work cooler,
Me warmer). It's a *place* you leave and arrive at.

### T2. Starting a task — *entering a mode, not opening a doc*
The sacred micro-second of choosing to act. Every app treats it as navigation.
**Should be a pull-focus** — task expands to become the world, everything else
dims/slides away, completion circle front-and-center. You're *entering a doing
session*, not "opening Task #284." The transition IS the commitment.

### T3. Moving between doing/planning/organizing — *the big one*
Two axes nobody uses:
- **Zoom axis:** Task → Project → Goal are **three zoom levels of the same
  view**, not three pages. You're always looking at "the current thing"; zoom
  out to see what it's part of. Figma-zoom, but for your work hierarchy.
- **Time axis:** Logbook (past) ← What Now (present) → Upcoming (future) is a
  **timeline you pan along.**

The sidebar dies. Navigation becomes zooming + panning.

### T4. Reviewing — *a ritual, not a query*
Logbook-as-list is the laziest version. Review is meaning-making: "Did this
move the Goal? What mattered this week?" **Goal-centric, conversational,
time-bound.** End-of-day debrief. Weekly GTD review as a guided flow.

## 3. The unifying principle

**Cognitive modes are places, not pages.** Every transition is a *movement*
with a beginning and end. The sidebar-of-nouns dies. Navigation is spatial +
gestural, keyboard-first, with transitions that mean something.

## 4. Risk to manage

Spatial/zoom nav has a gimmickry reputation (Prezi). Discipline if we commit:
- Tiny movements. Constant orientation (you always know where you are + how
  to get back).
- Keyboard-first.
- Never show off.
- Calm, not spectacular.

## 5. Prototyping plan (this session)

Three **genuinely different** bets, built as rough clickable prototypes. No
polish — just enough to feel whether each approach is liberating or
disorienting. A/B them on the workbench.

| Approach | Core idea | Inspiration | Risk |
|---|---|---|---|
| **A. Zoom + Pan** | Task↔Project↔Goal is zoom; past↔present↔future is pan. No sidebar. | Figma + timeline | disorienting |
| **B. Focus / Blur** | Everything visible but de-focused; current = sharp. Switching = attention shift, no movement. | optics, depth-of-field | too subtle to read |
| **C. Time-adaptive** | The home *changes* by time of day: morning=plan, midday=do, evening=review. Time IS the mode switcher. | calendar, ritual | feels prescriptive |

If none land, we fall back to the v2 sidebar but keep T2 (task-start as
pull-focus) — the single highest-value transition regardless of nav paradigm.

## 6. What stays constant across all approaches

- **The brand mark = the completion state.** Filled teal rounded-square is
  logo + favicon + the payoff. One visual, three jobs.
- **Things DNA.** Calm, restrained, every motion purposeful. Never show off.
- **Voice, not chips.** Natural language over metadata badges.
- **Keyboard-first.** Every transition has a shortcut. Mouse is optional.
- **`prefers-reduced-motion` honored** always.
