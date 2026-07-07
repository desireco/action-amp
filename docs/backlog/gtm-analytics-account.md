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

Pick Plausible vs PostHog (lean: **Plausible** — privacy-respecting, calm, fits
the brand), create the site, get the key. The `observability-minimal` code
can't go live without it.

## Done-conditions

- [ ] Provider chosen (Plausible recommended) + rationale noted.
- [ ] Site created in the provider dashboard for `actionamp.com`.
- [ ] API key / snippet available to wire into the app.
- [ ] Handed to Build (or noted as ready) → `observability-minimal` unblocked.

## Why

**The single highest-leverage non-code action.** SUCCESS.md Bet 1 ("do the
right people want this?") is *literally unmeasurable* until this exists. The
visitor → checkout % is the one number that gates every GTM decision. This
unit is P0 because nothing in the validation gauntlet closes without it.
