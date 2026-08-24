# Research: what focus and todo-app users complain about (2026-08-24)

> Qualitative desk research across accessible Reddit threads and the Getting
> Things Done community forum. This records recurring user language and
> desired outcomes; it is not a representative survey or a feature commitment.

## The headline

The recurring complaint is not a missing way to store tasks. It is receiving a
pile of obligations when the person needs help deciding what to do next.

## Repeated problems and the outcome people want

| Problem people describe | What they want instead |
| --- | --- |
| **Today is an anxiety list.** Due, recurring, optional, and genuinely important items all land together. | A small, intentional daily commitment list. Tasks should appear when actionable, not merely because they exist. |
| **Future work appears too early.** Long-horizon repeating items are visible all year or invade Today long before they matter. | A distinct defer/start date or lead time, separate from a real deadline. |
| **There is no obvious “do this now” lane.** Interruptions make people lose their place; recording ad-hoc work is slower than the work itself. | One visible current task, fast switching, and a quick way to record or isolate work that starts now. |
| **Tasks and calendar events are confused.** A deadline, a work session, and a calendar commitment get represented as the same thing. | Keep the deadline intact while planning one or more work sessions before it. A time block should be a container for compatible work, not a duplicate task event. |
| **Time-blocking produces clutter and notifications.** Every planned item creates another event and often another alert. | Quiet planning by default; deliberate reminders only where wanted. Calendar blocks should not automatically interrupt the person. |
| **Power features become a second job.** Tags, filters, nested tasks, and custom views require maintenance and hide the useful view behind setup. | Opinionated built-in working views with low navigation and configuration cost. |
| **The app is not trustworthy enough for memory support.** Wrong date parsing, sync failures, disappearing tasks, and unclear completion behaviour have outsized consequences. | A dependable core: transparent parsing, predictable completion, and reliable cross-device state before novel automation. |

## Specific needs behind the requests

1. **Separate commitment from availability.** “Not before”, “I plan to work on
   this”, and “must be finished by” are different decisions and should not
   share a single date field.
2. **Make the present state legible.** Users want a single current task, enough
   context to resume after interruption, and a calm route to another candidate
   when the recommendation is wrong.
3. **Support blocks, not task-calendar duplication.** A block such as “Admin,
   10–12” should reserve time and let the user choose among relevant tasks.
4. **Treat reminders as an explicit choice.** Scheduling must not imply a
   notification; notification defaults should be quiet and controllable.
5. **Surface focus, not a hidden timer.** People ask for a prominent focus
   session associated with the task, plus lightweight elapsed/planned-time
   context.
6. **Optimise capture and decision separately.** Fast natural-language capture
   remains valued, but people need to see what was interpreted and then decide
   what deserves attention now.

## Implications for ActionAmp

This evidence supports the current product thesis rather than changing it:

- The Today cap and Upcoming bench answer the complaint that Today becomes an
  undifferentiated obligation list.
- Next → Now, the alternatives rail, and persistent focus state answer the
  need to resume or choose one thing without reopening a full list.
- `scheduledDate` (calendar planning) and `snoozedUntil` (exact availability)
  are the right semantic separation to preserve. A future feature should not
  collapse them back into an overloaded date.
- The centered focus route fits the request for focus to be visible and tied to
  actual work, not buried as a secondary utility.

The unaddressed opportunity is a **quiet planning block**: reserve a meaningful
window or protected focus period without turning it into another task, a dense
calendar card, or an automatic reminder. Research alone does not establish the
right interaction model or authorise a feature; validate it with users before
specifying or building it.

## Evidence and limits

The research is directional, based on discussion threads rather than usage
telemetry or a controlled sample. Reddit access was partially restricted at
research time, so the evidence combines accessible indexed Reddit thread text
with a public specialist forum. Treat frequency as a repeated qualitative
signal, not a percentage of all users.

### Sources

- [Todoist: “Right now” natural-language option](https://www.reddit.com/r/todoist/comments/1dv3v04)
- [TickTick: time blocking without notification overload](https://www.reddit.com/r/ticktick/comments/1pc6k20)
- [TickTick: tasks versus calendar events](https://www.reddit.com/r/ticktick/comments/1dc1pfr)
- [TickTick: deadlines and planned focus time](https://www.reddit.com/r/ticktick/comments/18ko3su)
- [Getting Things Done forum: recurring tasks cluttering Today](https://forum.gettingthingsdone.com/threads/recurring-tasks-cluttering-up-my-task-manager.18251/)
- [Getting Things Done forum: filtered views versus built-in lists](https://forum.gettingthingsdone.com/threads/use-of-single-list-with-filtered-views-of-that-list-or-multiple-lists-in-todoist.17013/)

## Follow-up analysis

See [focus-and-todo-app-gap-analysis-2026-08-24.md](./focus-and-todo-app-gap-analysis-2026-08-24.md)
for the comparison with shipped ActionAmp features, current communication, and
validation-first recommendations.
