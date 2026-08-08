# Review: weekly-monthly-review

<!-- Build owns this file. Discover reads it to sign off. -->

## What changed

Review now has four destinations instead of one overloaded history surface:

- **Today** closes the day with named accomplishments and one optional memory.
- **Week** connects work to Goals and Projects, leads with up to five completed
  Medium/Large actions, counts all completed actions by Lens, and summarizes
  effort neutrally.
- **Month** leads with completed Goals and up to five completed Medium/Large
  actions, counts all completed actions by Lens, shows the month's weekly shape,
  and supports one optional next-month Goal emphasis.
- **Logbook** remains the chronological record and cannot be disabled.

Preferences now expose independent Today, Week, and Month switches. All default
on. Turning one off changes navigation only; it deletes no review or completion
data. Review responses autosave through the new `Review` model. Only Today has
an explicit close action and completed snapshot.

## Gates run

- **Migration:** `wasp db migrate-dev --name review-rhythms` — pass; schema is
  current through 38 migrations.
- **Wasp compile:** pass.
- **Production build:** pass. Existing dependency audit reported 3 moderate and
  7 high vulnerabilities; no automatic dependency mutation was attempted.
- **Focused tests:** 74/74 pass across period math, read/write operations,
  ownership, preferences, component rendering, shortcuts, and route context.
- **Full unit/component suite:** 900/900 pass across 67 files after shared
  Project/Task fixtures and concurrent command-palette assertions were repaired.
- **Prototype browser QA:** pass for cadence switching, dense task disclosure,
  accomplishment highlights, autosave, settings/nav adaptation, desktop/mobile,
  and light/dark.
- **Live-app browser smoke:** pass on the running development server for Today,
  Week, and Month routes, desktop and mobile layouts, with zero console errors.
  A dedicated automated Review E2E remains deferred.
- **Diff hygiene:** `git diff --check` pass after review fixes.

## Findings fixed

1. **Autosave ordering:** an older request could finish after a newer edit and
   overwrite its state. Saves now serialize and use edit revisions; completion
   waits for pending saves and wins last.
2. **DST month slices:** fixed-duration stepping could drift at daylight-saving
   boundaries. Slices now advance by local calendar date.
3. **Focus accounting:** sessions crossing a review boundary were counted in
   full. They are clipped to the period and aggregated by Lens, so filters remain
   accurate.
4. **Async recovery:** failed review queries produce visible recovery states
   instead of silent rejection or an empty page.
5. **Month emphasis:** a saved completed Goal remains displayable while new
   choices are limited to active Goals.
6. **Coverage gaps:** added all eight preference combinations, shortcut typing
   suppression, ownership guards, every-task rendering, and DST slices.

## Done-condition evidence

- [x] Distinct Today closure, Week alignment, Month direction, and Logbook
      history destinations.
- [x] Independent settings with preference-aware desktop/mobile routing and
      permanent Logbook fallback.
- [x] Every completed task remains inspectable, including Outcome Markdown and
      honest Goal/Project/Lens grouping.
- [x] Completed Goals receive the strongest calm visual emphasis; no streaks,
      scores, confetti, nags, or judgmental comparisons.
- [x] Optional autosaved reflection for every cadence, no Week/Month close
      action, and stable completed snapshots for Today closure.
- [x] Monday weeks, calendar months, IANA zones, and 23/25-hour days tested.
- [x] Keyboard suppression, responsive layout, dark mode, and reduced-motion
      treatment implemented and covered by component/static-browser checks.

## Deferred verification

Dedicated automated Review E2E remains the only deferred gate. This does not
hide a known Review defect; compile, production build, the full unit/component
suite, prototype QA, and live desktop/mobile browser smoke pass.

## Verdict

**done** (implementation sign-off 2026-08-08), with live-app E2E explicitly
deferred under the repository's server-start policy.
