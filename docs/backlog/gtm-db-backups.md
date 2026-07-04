---
id: gtm-db-backups
kind: backlog
title: "Railway Postgres backup + restore policy"
status: ready
priority: P2
spec_owner: user
build_owner: user
gates: one paying user (becomes non-optional)
created: 2026-07-03
---

# Railway Postgres backups

## What

Confirm automated backups are on for the Railway Postgres, and that you know
how to restore. One paying user makes this non-optional.

## Done-conditions

- [ ] Automated backups confirmed on in Railway.
- [ ] Restore procedure documented (a one-pager: command/steps + where the
      backup lands).
- [ ] One trial restore performed (to a throwaway DB) to prove it works.

## Why

Code can be rebuilt; user data can't. The cost of finding out backups don't
work is finding out at the moment you need them.
