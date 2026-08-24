# Analysis: user-research needs versus ActionAmp (2026-08-24)

> Companion to [focus-and-todo-app-user-research-2026-08-24.md](./focus-and-todo-app-user-research-2026-08-24.md).
> This is a product and communication analysis, not an approved roadmap change.
> “Shipped” means code-verified in `docs/features/` as of 2026-08-22; the
> public-site observations come from `site/src/pages/index.astro` as inspected
> on 2026-08-24.

## Verdict

ActionAmp already solves the most emotionally charged problem in the research:
an overwhelming list at the moment someone needs to act. Its product model is
stronger than its public explanation. The primary work is therefore:

1. **Make the existing promise more concrete and completely truthful.**
2. **Teach the system of relief — capture safely, commit narrowly, focus on
   one thing — rather than only the single-task moment.**
3. **Validate two gaps before building:** a richer moment-aware recommendation
   and a quiet planning block.

Do not react by adding a general calendar, more dashboards, or task-alert
machinery. Those would recreate the clutter users are escaping.

## Need-by-need comparison

| User need from research | Existing ActionAmp answer | Gap / risk | Recommendation |
| --- | --- | --- | --- |
| A small Today instead of an obligation pile | Today is explicitly committed, capped at five, and rolls incomplete items back to Upcoming each day. Upcoming and Someday keep the rest off stage. | This is one of the strongest shipped answers, but it is almost absent from the home-page story. | Explain the cap and fresh-start rollover as relief, not as enforcement. Show that a task can live safely outside Today. |
| A clear current task and recovery after interruption | Next → Now persists; Focus is a dedicated single-task route; alternatives allow a person to choose another candidate without losing the recommendation. | The public copy says “one task” but does not explain interruption recovery or retained agency. | Say: “Pick up where you left off, or choose another task. Your plan stays intact.” |
| Separate availability, planning, and commitment | `scheduledDate` is calendar scheduling; `snoozedUntil` is exact availability; Today and Upcoming are distinct commitments. | The model has the right primitive, but no public or in-product language teaches the distinction. Users may still treat every date as a deadline. | Introduce plain names and explanatory copy: **Plan for**, **Available after**, **Commit today**. Preserve the underlying field semantics. |
| Time blocking without task/event duplication | This Week offers a calendar horizon; Focus sessions are task-bound. | No shipped block/container model. `focus-engine-v2` deliberately excludes calendar integration. | Research and prototype a quiet, local “protected focus window” before specification. It should reserve attention, not create a calendar or duplicate tasks. |
| Quiet reminders | One optional daily Today reminder is off by default and user-timed; no per-task-alert system exists. | This is a genuine advantage but invisible in the positioning. | State the principle, not the mechanics: “No stream of task alerts. Add one daily reminder if it helps.” |
| Fast capture with trustworthy interpretation | Capture is universal, keyboard-first, and shows parsed chips before saving; Inbox and triage separate capture from organising. | The site communicates speed but not the important assurance that capture does not force an immediate organisational decision. | Add “Capture first. Decide later. Nothing is silently filed.” to onboarding and the Capture story. |
| A visible, useful focus session | Focus has a centered 25/45-minute timer, Pause, notes, wrap-up, and recorded sessions. | Marketing only says “Focus”; it leaves the working experience abstract. | Show a calm focus-screen proof point: timer, pause, and one progress note — not a feature grid. |
| A recommendation users can trust | Shipped “why this?” is truthful about actual priority/size/age factors; alternatives retain user agency. | The public hero currently depicts time-aware recommendations that the product does not ship. | Correct immediately; then run the existing matcher-validation study before expanding the promise. |

## P0: correct the live promise before amplifying it

The live landing-page demo currently shows **“30 min available”** and uses
reasons such as **“fits your time”**. The hero says ActionAmp “explains why.”
But the shipped matcher does **not** use available time or energy: its ranking
is in-progress → Today/Upcoming → priority → size → age. Time/energy matching
is `focus-engine-v2`, which remains `draft` and is gated by
`matcher-validation`.

This is not a small copy mismatch. It asks a visitor to trust precisely the
capability users most want — context-aware choice — before ActionAmp has it.
The fix is to present the honest current capability as a virtue:

| Surface | Replace the implied claim | With a truthful current claim |
| --- | --- | --- |
| Hero demo context | “30 min available” | “Suggested next task” |
| Demo reasons | “fits your time” | “Important and due today”; “A quick task you can finish now”; “You started this already” only when the demo state supports it |
| Hero subhead | “explains why” as a broad promise | “brings one task forward and tells you what made it the next choice” |
| Problem-section close | “does the picking for you” | “brings a clear next task forward — and lets you choose another” |
| FAQ / feature copy | “smart” or context-aware implication | “A transparent recommendation based on the decisions you have already made” |

Do not hide the limitation. “ActionAmp recommends; you decide” is both more
trustworthy and consistent with the alternatives rail. When validation clears
`focus-engine-v2`, the richer time/energy demonstration can return with real
product evidence.

## Communication changes to make now

### 1. Shift the message from minimalism to reliable relief

“One task” is memorable but incomplete. It can sound like a bare timer or a
single-task gimmick. The stronger story is a three-part contract:

> **Capture everything. Commit to less. See one clear next task.**

Suggested supporting paragraph:

> Your whole plan has a place. Today stays small on purpose. When it is time
> to work, ActionAmp brings one next task forward and leaves the rest out of
> your way.

This communicates the research’s core concern: people do not want their work
lost; they want it not to compete for attention right now.

### 2. Make the Today / Upcoming separation a proof point

Add one compact, visual section after “How it works,” not a feature grid:

- **Today is a promise, not a backlog.** Up to five deliberate commitments.
- **Everything else has a safe place.** Upcoming holds the bench; Someday
  holds the maybe-later work.
- **Tomorrow starts clean.** Incomplete Today items return to Upcoming for a
  deliberate recommitment, rather than becoming guilt-laden overdue rows.

Avoid saying “you have failed” or foregrounding overdue work. The story is
choice and recovery.

### 3. Explain agency at the moment of recommendation

The demo currently makes the product look like an opaque autopilot. Add one
short line near the card:

> One considered next step. A clear reason. Another choice when you need it.

This is more credible than a generic AI claim and accurately maps to the
shipped Why line plus alternatives rail.

### 4. Promote the calm notification stance

The research explicitly flags notification fatigue. ActionAmp already avoids
the category trap; say so sparingly in the FAQ or preferences/onboarding:

> No stream of task alerts. If you want one, set a single daily reminder.

Do not add notification badges, escalating nags, or “missed task” messaging.

### 5. Clarify capture without adding GTD homework

“Capture → Triage → Focus” is structurally correct but can feel like a
methodology lesson. Keep the three steps, but write them as emotional outcomes:

| Current label | Recommended explanation |
| --- | --- |
| Capture | “Get it out of your head. No sorting required.” |
| Triage | “Give it a home when you are ready.” |
| Focus | “See one clear next task when it is time to act.” |

Put GTD/PARA below this, as optional credibility for people who seek it.

## Product work to validate, then consider

### A. Moment-aware recommendation — highest strategic upside, validation first

`focus-engine-v2` directly addresses the research request for a task that fits
the moment. It is also the part of the current public demo that is prematurely
claimed. Do **not** build it from forum research alone.

The existing `matcher-validation` spec is the correct next action: collect real
task lists, manually make the richer recommendation, and record whether people
say it is right. Only a **BUILD** verdict should unlock the existing v2 design.
If participants reject the pick, revise the logic before any interface or tag
work.

### B. Quiet planning block — promising, but a new concept

The strongest unserved request is not a full calendar. It is a block such as
“Admin, 10–12” or “protected focus” that protects attention without duplicating
individual tasks or creating alerts.

Before a feature spec, test a low-fidelity prototype with 5–8 people who
already time-block. The questions are:

1. Is the block a commitment, an availability constraint, or a task container?
2. Does it select from compatible work, merely hide incompatible work, or do
   neither?
3. Is it private to ActionAmp, or must it affect an external work calendar?
4. Can it remain quiet by default and still earn its place on the focused home
   surface?

Guardrails: no general calendar, no duplicate task events, no automatic alerts,
no scheduler that silently moves work, and no crowding of Next.

### C. “Right now” capture — small experiment, not a system redesign

Research users want a quick way to record a few urgent interruptions. ActionAmp
already has fast capture and Next → Now. Test whether a visible “Do now” action
or `@now` grammar reduces friction without turning capture into prioritisation.
Success means it isolates immediate work and preserves the existing plan; it
must not automatically evict or demote another task.

### D. Make date semantics visible before adding date features

The internal split between `scheduledDate` and `snoozedUntil` is sound. First
improve labels, helper text, and the Week/Upcoming presentation; measure whether
people understand what each date means. A separate hard deadline should only be
introduced if interviews reveal a real unmet need, because it adds another
decision and another source of pressure.

## What not to add in response

- A general-purpose calendar or two-way calendar sync as the product centre.
- Per-task notification defaults, alert floods, badges, or streaks.
- More configurable filter/tag views as the main way to work.
- A large analytics or time-tracking dashboard.
- An opaque AI scheduler that moves tasks or starts work without a clear reason.

These are feature answers to the same overload the research describes. They
would weaken ActionAmp’s decision-first, calm contract.

## Recommended sequence

1. **P0 — copy/demo truthfulness:** correct the hero’s unshipped time-aware
   claims and explain recommendation + agency accurately.
2. **P1 — communicate shipped relief:** add a compact Today/Upcoming proof
   point; tighten Capture/Triage/Focus wording; mention the optional single
   daily reminder.
3. **P1 — validate the actual wedge:** run `matcher-validation`; update the v2
   status and public promise only from its verdict.
4. **P2 — validate quiet planning blocks:** prototype with time-blocking users;
   write a spec only if the problem and interaction model are clear.
5. **P2 — date-language usability test:** test Plan for / Available after /
   Commit today wording before adding more date concepts.

## Documentation cleanup to schedule with approved copy work

`docs/MARKETING.md` and `docs/PUBLIC-PAGES.md` still describe the old Wasp
`LandingPage.tsx` as the shipped public home. The live public home is now
`site/src/pages/index.astro`; `docs/features/landing.md` has the same stale
implementation pointer. Update those paths and reconcile the newsletter
status when the next approved public-site copy pass lands. This is
documentation drift, not evidence of a product gap.
