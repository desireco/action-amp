---
id: gtm-contact-inbox
kind: backlog
title: "Confirm monitored contact addresses (privacy@ / legal@)"
status: ready
priority: P1
spec_owner: user
build_owner: user
gates: legal-pages-oauth final signoff; Google OAuth verification; user trust
created: 2026-07-03
---

# Monitored contact addresses

## What

Privacy + Terms reference `privacy@actionamp.com` / `legal@actionamp.com`.
Confirm these inboxes exist and are read. Carried forward from the
`legal-pages-oauth` review (open item).

## Done-conditions

- [ ] `privacy@actionamp.com` exists and is monitored.
- [ ] `legal@actionamp.com` exists and is monitored.
- [ ] A test send to each confirmed received.

## Why

Google OAuth verification + user trust both need a working contact. Privacy
policy hedged data retention on entitlement-enforcement; this is the user-facing
side of "we can be reached."
