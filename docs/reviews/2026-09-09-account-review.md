# Account review — 2026-09-09

Read-only examination of Zeljko's ActionAmp account via the CLI (`now`, `today`,
`inbox list`, `project list/show`, `goal list`, `logbook`, `review week`).
No mutations were made. Findings below, ordered by impact.

## State snapshot

| Area | Finding |
|------|---------|
| Lenses | 2 — **Me** (default, 4 projects) and **Work** (3 projects) |
| Goals | **0 in both lenses** — the top tier of the hierarchy is unused |
| Today | **Empty** (0 of the 5-item cap) |
| This week | 3 completions, 6 focus minutes — near-zero momentum |
| Inbox | 3 items aging 3–6 days |
| `now` fallback | An overdue July question-task, scheduled 2026-08-16 |
| Projects | 7 total; 3 empty; 2 duplicate "General" in Me; 1 stalled |

## What to change

### 1. Today is empty — the chooser has nothing real to offer

With Today at 0/5, `now` falls back to stale overdue items, which is exactly
what happened: the top suggestion is a July task overdue since Aug 16. Pick
1–3 genuine candidates for Today. Best available:

- **Screw and tighten girls toilet** (House) — small, physical, done in 15 min.
- **Do a comprehensive review** (MVP, IMPORTANT) — currently snoozed to 09-12;
  either commit it Today or let the snooze stand, but decide deliberately.

A nearly-empty Today with one honest item beats snooze-fallback roulette.

### 2. A snooze cluster all resurfaced on 2026-09-06

Seven tasks in MVP share `snoozedUntil: 2026-09-06` — they all woke up
together three days ago and are now competing for attention as a blob. Triage
them once instead of re-snoozing en masse:

- **Already-shipped feature notes** → close them (see #3).
- **Real next steps** (e.g. *Add start task in projects*, *Make a create
  project or goal experience on mobile*) → commit one to Today, park the rest
  in Upcoming with a scheduled date.
- **Ideas, not actions** (*music feature*, *self-reflection notes*) → move to
  Someday where they belong.

### 3. Product feedback is stored as user tasks in MVP

Roughly half of MVP's open items are app-feedback phrased as questions or
requests ("Let tasks in edit be marked done", "Add hide completed tasks",
"Kako da u triage dam lakše da se projektima dodaje"). Several of these were
shipped in the platform switch (inline edit, hiding completed tasks). Recommended:

- Close what's shipped — the logbook keeps the record.
- Convert the rest into **project resources** (MVP supports notes/links) or a
  single "Process MVP feedback backlog" task, instead of letting them pile up
  as scheduling-eligible tasks that pollute the chooser.

### 4. Zero goals — the "why" layer is missing everywhere

No goals exist in either lens, so projects and tasks hang without direction.
The July question "How can I create goals here?" was the right instinct.
Suggested starting pair:

- **Work:** e.g. "Get ActionAmp in the hands of first real users" — link MVP
  and *Automate client outreach* to it.
- **Me:** one honest personal goal (the Obsidian "wannabe projects" list
  completed 09-09 is a ready-made source).

Two goals are enough; an empty goal tier is worse than a sparse one because
reviews then report nothing at the top level.

### 5. Project hygiene — duplicates, empties, dead weight

- **Two "General" projects in Me** (`9c196fc4…` with tasks, `132bf98c…` empty).
  Archive/delete the empty duplicate; identical names invite miscaptures.
- **Learn** and **Shopping** (Me) are empty — archive until needed, or fold the
  inbox's course/product links into them right now (see #7).
- **House** is 3/4 WONT_DO — effectively dead. One live task remains
  (*Screw and tighten girls toilet*); finish or move it, then archive.
- WONT_DO items generally linger in project lists; they're fine as history but
  consider archiving the whole project once drained.

### 6. "Automate client outreach" is a stalled someday-project

Five SOMEDAY tasks, none started, no first step in motion. Either activate the
first concrete action (*Detect new connections*) or shelve the project and
stop paying it attention. A project with no next action is a wish.

### 7. Inbox aging and capture hygiene

Three items, oldest from 09-03:

- **Dungeon master course link** → a resource/task under a Learn home.
- **SwitchBot MindClip link** → shopping/research item for Me.
- **"Screenshot (3 26 8:31:37 am)"** → untitled capture; also visible in
  completed history ("Screenshot (8 26 …)" completed 09-09). Share-target
  captures arrive with useless names — rewrite the description at triage, or
  the logbook becomes unreadable.

Product note arising from this: captures that arrive as
"Screenshot (date)" names could prompt for a one-line title at triage time.

### 8. General (Work) is a cross-life catch-all

It mixes work misc with a Serbian book-editing task and SAT/ACT research
(both now WONT_DO). Personal leftovers that survive cleanup belong in the Me
lens; keeping Work's General work-only makes lens-scoped review meaningful.

### 9. Focus accounting is blank

6 focus minutes this week — tasks get marked done without `start`. If weekly
review should say anything about focus time, start the task, work, then done.
Cheap habit, better review evidence.

## Suggested order of attack (≈30 min)

1. Commit 1–2 tasks to Today (#1).
2. Sweep the 09-06 snooze cluster: close shipped, promote one, demote the rest (#2, #3).
3. Create 2 goals, link existing projects (#4).
4. Delete empty duplicate General; archive House when drained (#5).
5. Triage inbox to zero (#7).

## Product observations (for the app, not the account)

- Snoozing multiple items with the same wake-up date creates a resurface flood;
  staggering defaults (or a "wake 1/day" queue) would soften the spike.
- Question-shaped captures ("How can I…", "What options…") age badly as tasks;
  a lightweight "make it an action" nudge at triage would help.
- Share-target screenshots land with meaningless titles.
- No bulk "push old things to Someday" existed — **shipped 2026-09-09** as
  `actionamp task sweep` (domain core + `POST /api/cli/task/sweep` + CLI;
  dry-run by default, `--apply` writes, `--older-than <days>` tunes the
  staleness threshold).
