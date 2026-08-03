---
id: gtm-analytics-account
kind: backlog
title: "Pick analytics provider + create site (gates observability-minimal)"
status: ready
priority: P0          # the single highest-leverage non-code action
spec_owner: user
build_owner: user
gates: observability-minimal go-live; SUCCESS.md Bet 1 measurability
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mgsg5      # sync-managed (write-once)
gh_synced_at: 2026-07-07T18:16:34Z   # sync-managed (drift detection)
---

# Analytics provider account

## What

**Resolved 2026-08-03: StatCounter.** The project has been created for
`actionamp.com`; its production snippet is available to wire across the
marketing site and app. The `observability-minimal` event funnel still needs
its four explicit conversion events.

## Done-conditions

- [x] Provider chosen: StatCounter (visitor journeys, session replay, and
      heatmaps fit the team's preference).
- [x] Site created in the provider dashboard for `actionamp.com`.
- [x] Snippet available to wire into the marketing site and app.
- [x] Handed to Build → `observability-minimal` unblocked.

## Why

**The single highest-leverage non-code action.** SUCCESS.md Bet 1 ("do the
right people want this?") is *literally unmeasurable* until this exists. The
visitor → checkout % is the one number that gates every GTM decision. This
unit is P0 because nothing in the validation gauntlet closes without it.
