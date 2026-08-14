---
feature: focus-goal-context
status: draft
spec_owner: discover
build_owner: build
kind: spec
---

# Feature: Goal rationale and work continuity

> Product contract created 2026-08-10 and extended twice on 2026-08-10. This remains
> `draft`; planning does not place it in the Build queue or authorize
> implementation.
>
> Parked execution queue:
> [`../focus-goal-context-task-queue.md`](../focus-goal-context-task-queue.md).

## Summary

ActionAmp keeps a Task's larger purpose visible at both decision and execution
time:

- a **Next** candidate quietly shows why it matters and which Goal it advances;
- the active **Focus** surface shows the same Goal rationale;
- a resumed Next candidate shows how much work already happened and the latest
  progress note, so restarting does not mean reconstructing context.
- `actionamp now` names the current Project and Goal and explains both why the
  matcher chose the Task and why the Goal matters.

This does not replace the existing Next-card “why this?” line. That line
explains why the matcher selected the Task **now**. Goal rationale explains why
the user chose this work **at all**.

## User problem

The chooser and Focus mode reduce distraction, but they also remove useful
planning and continuity context. A person can see exactly what to do while
losing sight of the outcome it supports. After pausing, they can also return to
the same Task without seeing time already invested or the note that explains
where they stopped.

Project, Goal, TaskSession, and TaskUpdate data already express this context.
Current Next data lacks Project→Goal details and session/note history. Current
Focus data includes sessions and notes, but not the Project's Goal or either
Goal description.

## Product decisions

### Surfaces and states

- Goal rationale appears on a Task in the **Next candidate** state on `/do`.
- Goal rationale also appears on the active Task at `/do/focus`.
- Prior-work continuity appears only on `/do` when `NextCard.state === "next"`.
  The home-card `now` state does not show a stale summary while work is active;
  live execution context belongs in Focus.
- `actionamp now` human and JSON output gain explicit Project, Goal, and why
  context. Other CLI commands, lists, Task detail, Project detail, Review, and
  Logbook do not change.
- A Task with no resolved Goal gets no Goal prompt. A fresh Task with no prior
  work gets no continuity block. Missing data creates whitespace, not nags.

### Goal resolution

Resolve one Goal for presentation:

1. `task.project.goal` when the Task's Project has a Goal;
2. otherwise `task.goal` for legacy direct-Goal Tasks;
3. otherwise `null`.

Project-linked Goal is authoritative. If legacy data contains both links and
they disagree, show one Project Goal. Do not merge descriptions. No migration
or data repair belongs here.

### Goal copy

With a non-empty Goal description:

```text
Why does this matter?
<trimmed Goal description>
Goal · <Goal name>
```

Without a usable description:

```text
Why does this matter?
Toward <Goal name>.
```

Do not repeat Goal name on a separate attribution line in fallback state. Do
not manufacture rationale from Project name, Task content, priority, due date,
matcher signals, or work history.

### Next-card hierarchy

Next remains one calm decision path:

```text
Next · <Lens>
<Task title>
<Project · due · size>
<existing matcher rationale: why now>

Why does this matter?
<Goal rationale>

<prior-work summary, only when history exists>
<latest progress note, only when one exists>

Start   Not now
```

- Existing matcher rationale and amber emphasis remain unchanged.
- Goal rationale follows matcher rationale and uses no card, icon, link,
  disclosure, animation, badge, or action.
- Prior-work context follows Goal rationale. If no Goal exists, it follows the
  existing matcher rationale directly.
- The added context remains narrower in visual weight than Task title and
  actions. It may increase vertical height; it must not make a scroll trap or
  create horizontal overflow at mobile widths.

### Focus hierarchy

- Place Goal rationale directly below Task title and above editable Task
  details.
- Keep it in the existing centered content column.
- Focus does not repeat the matcher rationale or prior-work summary; its timer
  and activity thread already provide live and historical execution context.

### Prior-work continuity

Continuity is derived from closed TaskSessions and user-authored NOTE updates.
It appears when at least one valid closed session or one non-empty NOTE exists.

Summary segments, omitting zero-value segments:

```text
42 min worked · 2 sessions · 3 notes
```

Rules:

- A valid session has `endedAt > startedAt`. Open, zero-length, reversed, or
  invalid sessions do not count.
- Worked time is the sum of valid closed-session durations, not planned Pomodoro
  minutes and not only sessions whose countdown completed.
- Positive time below 60 seconds renders `<1 min worked`.
- Otherwise round aggregate duration to nearest whole minute and render
  `1 min worked` or `<n> min worked`.
- Session and note labels use correct singular/plural forms.
- Omit `0 min`, `0 sessions`, and `0 notes`; never show an empty stats row.
- Notes count only trimmed, non-empty `TaskUpdate.kind === NOTE` rows.
  `COMPLETED` system events do not count as notes.
- Show only newest valid progress note under a small `Latest note` label. Trim
  outer whitespace and clamp visually to two lines. Do not alter stored text.
- Latest note renders as passive plain text. No link, markdown interaction,
  inline editor, expansion control, or full thread on Next. Full history remains
  available after Start enters Focus.
- A Task may show note continuity without worked time, or worked time without a
  note. Do not invent missing segments.

### Visual treatment

- Question: small muted supporting text.
- Goal answer: normal body size and weight, below title prominence.
- Described Goal attribution: quiet violet, because violet already means
  Project/Goal identity. No amber; amber remains matcher emphasis.
- Continuity stats: compact muted text using tabular numerals when available.
- Latest note: subdued two-line plain-text preview.
- No new raw colors. Use existing tokens.

### CLI `now` output

Human output becomes a short labeled block rather than relying on one compact
Task line:

```text
Ship the landing page
Project: Launch v2
Goal: Reach 100 paid customers
Why now: Important — due today
Why it matters: Prove paid demand before expanding scope.
```

Rules:

- Task description is always first and unlabelled.
- Show `Project:` when Task belongs to a Project.
- Show resolved `Goal:` when Project Goal or legacy direct Goal exists. If both
  Project and Goal exist, show both; they answer different questions.
- `Why now:` uses exact truthful matcher explanation from shared `composeWhy`.
  Omit line when matcher has no truthful clause.
- `Why it matters:` uses trimmed Goal description or `Toward <Goal name>.`
  fallback. Omit when no Goal exists.
- Keep output calm and line-oriented. No color-dependent meaning, icons,
  indentation tree, badge, or exclamation.
- Do not show worked-time or note continuity in CLI v1. User asked for Project,
  Goal, and why; web continuity remains separate until CLI demand is clear.

`--json` remains stable and gains one additive top-level field:

```ts
type NowResult = {
  task: Task | null;
  context: {
    project: { id: string; name: string; permalink?: string } | null;
    goal: {
      id: string;
      name: string;
      permalink?: string;
      description: string | null;
    } | null;
    whyNow: string | null;
    whyItMatters: string | null;
  } | null;
  reason?: "no-lens" | "no-candidates";
};
```

For `task: null`, return `context: null`. For a Task, always return a context
object even when every optional value is null. Existing `task` and `reason`
meanings do not change. Human output consumes this explicit context; it does
not reverse-engineer why from raw Task fields.

## Data and interface contract

### Focused Task

Extend authenticated `getFocusedTask` relation selection:

- `project`: retain `id`, `permalink`, and `name`; add nested `goal` selecting
  `id`, `name`, and `description`;
- legacy direct `goal`: retain `id`, `permalink`, and `name`; add
  `description`.

Existing sessions and updates already support Focus. No extra query is needed.

### Ranked Task and shared hydration

Keep shared `getTopTaskData` ranking unchanged. After either Wasp `getTopTask`
or CLI `/api/cli/now` receives the ranked Task, call one shared pure hydration
core for that owned winner. Do not attach Goal/history relations to every
candidate.

The owned hydration returns:

- Project fields plus nested Goal `id`, `name`, and `description`;
- legacy direct Goal fields plus `description`;
- sessions ordered by `startedAt`, selecting `startedAt` and `endedAt`;
- NOTE updates ordered newest-first, selecting data required for count and
  latest-note display.

Hydration remains scoped by ranked Task id plus authenticated user id. If Task
vanishes between ranking and hydration, return `null`, not stale data. Wasp
returns hydrated Task to Next. CLI retains existing raw `task` field and uses
hydrated row only to construct additive `context`; session/note rows are not
serialized into CLI response.

### Pure presentation values

Add a small pure task-context module shared by Next and Focus:

```ts
interface GoalContext {
  name: string;
  description: string | null;
}

interface TaskContinuity {
  workedMs: number;
  workedLabel: string | null;
  sessionCount: number;
  noteCount: number;
  latestNote: string | null;
}
```

It owns Goal precedence, description trimming, valid-session arithmetic,
minute formatting, NOTE filtering, count grammar inputs, and latest-note
selection. It also builds matcher and Goal explanation strings for CLI context
without importing React, browser, or Wasp APIs. React components and CLI route
receive normalized values and do not reinterpret raw Prisma relations or
timestamps.

This feature adds no schema, migration, mutation, cache invalidation, ranking,
session-writing, note-writing, or focus-state behavior.

## Authorization and ownership

- Preserve existing authenticated Task ownership boundaries.
- Obtain Project, Goal, sessions, and notes only through the owned Task.
- Add no independent Goal, TaskSession, or TaskUpdate lookup using client input.
- Accept no Goal or history id from the client.
- All added context is read-only.
- CLI context is built server-side from authenticated ranked and hydrated Task.
  Client supplies no Project, Goal, or why data.
- CLI response exposes only documented context fields; hydrated sessions and
  notes remain server-internal for this route.

## Accessibility

- Goal rationale and continuity are normal document content, not `aria-live`.
- Give Goal block an accessible section label such as `Goal context`.
- Give continuity block an accessible section label such as `Previous work`.
- Do not make passive copy keyboard-focusable.
- Preserve Start, Not now, Pause, Focus shortcuts, and Escape behavior.

## Done conditions

- [ ] Described Project Goal renders exact Goal question, description, and
      attribution on Next candidate and active Focus.
- [ ] Description-less Goal renders `Toward <goal>.` without duplicate
      attribution on both surfaces.
- [ ] Project Goal wins over conflicting legacy direct Goal; direct Goal remains
      fallback; no Goal renders no block.
- [ ] Paused/resumed Next candidate shows aggregate worked minutes from valid
      closed session durations, valid session count, and NOTE count.
- [ ] Positive sub-minute work shows `<1 min worked`; zero/malformed/open
      sessions do not inflate totals.
- [ ] Next shows newest non-empty NOTE as a two-line passive preview and excludes
      `COMPLETED` events; no full thread or editor appears.
- [ ] Fresh Next candidate renders no empty continuity row, zero stats, or
      organizing prompt.
- [ ] Next `now` state does not show paused-work continuity.
- [ ] Existing matcher rationale remains truthful, visually separate, and
      unchanged.
- [ ] Shared `getTopTaskData` ranking remains unchanged; one shared owned
      hydration core serves Wasp Next and CLI context without fetching history
      for every candidate.
- [ ] `actionamp now` human output shows Task first, then available Project,
      resolved Goal, truthful `Why now`, and Goal-backed `Why it matters` lines.
- [ ] CLI omits unavailable lines without placeholders and never invents Goal
      rationale from Project or Task text.
- [ ] `now --json` adds exact documented nullable `context` while preserving
      existing `task` and `reason` semantics; null Task returns null context.
- [ ] CLI response does not serialize TaskSession or TaskUpdate histories.
- [ ] Context remains subordinate to title, timer, and actions at desktop and
      mobile widths without horizontal overflow.
- [ ] Existing timer, details editing, notes, completion, snooze, pause,
      keyboard, and matcher behavior remain unchanged.
- [ ] Focused server, pure context, FocusMode, NextCard, and CLI `now` tests
      pass; standalone CLI build passes.
- [ ] `./scripts/wasp-safe.sh compile` passes.
- [ ] Browser QA verifies described, fallback, absent, fresh, and resumed
      states at desktop and mobile widths on an authorized dev server.
- [ ] Code-verified `focus-mode` and `next-what-now` feature docs update only
      after matching verification succeeds.

## Non-goals

- Editing or linking Goals from Next or Focus.
- Prompting users to organize a Task while working.
- Showing Project description as rationale.
- Changing data relationships or legacy records.
- Changing `composeWhy`, ranking, or matcher copy.
- Showing active-session live time on Next.
- Showing every note, Task content, completed system events, or note editing on
  Next.
- Adding breadcrumbs, deep links, popovers, badges, icons, or collapsible UI.
- Adding worked-time, session, or note history to CLI output.
- Changing CLI commands other than `now`.
- Adding analytics for context impressions.

## Cross-surface consequences

- `docs/WORKFLOW.md` must distinguish matcher rationale, Goal rationale, and
  paused-work continuity in Work Area semantics.
- `docs/PAGES.md` must describe both `/do` Next and `/do/focus` behavior.
- `docs/features/focus-mode.md` and `docs/features/next-what-now.md` update only
  after code verification.
- `cli/README.md` must document human and JSON `now` contracts; code-verified
  `docs/features/cli.md` updates only after verification.
- No changes are required in `docs/INTERACTION.md`, `docs/DATA-MODEL.md`,
  `docs/DESIGN-SYSTEM.md`, route registration, or Prisma schema.
