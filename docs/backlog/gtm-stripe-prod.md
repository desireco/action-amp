---
id: gtm-stripe-prod
kind: backlog
title: "Verify Stripe is in production mode (prod keys + webhook signature)"
status: Next
priority: P1
spec_owner: user
build_owner: user
gates: all billing
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mgslb      # sync-managed (write-once)
gh_synced_at: 2026-07-08T19:45:22Z
---

# Stripe production verification

## What

Confirm the `action-amp-server` Railway service vars hold Stripe **prod** keys
(not test), and that the webhook endpoint is registered in the Stripe dashboard
pointing at `api.actionamp.com/webhooks/stripe` with the signature matching. The
billing code is live; this is the verify-it's-really-prod step.

## Done-conditions

- [ ] Stripe dashboard shows the live/prod mode keys match what Railway has.
- [ ] Webhook endpoint registered at `api.actionamp.com/webhooks/stripe`.
- [ ] Webhook signature verified (Stripe sends a signed event; the server
      accepts it, not a 400/401).
- [ ] One real (small) test transaction processed end-to-end in prod and
      visible in the Stripe dashboard.

## Why

The code is live and the Founding 100 checkout is wired. The risk is silent:
test keys would appear to work until a real customer's charge fails or a
webhook doesn't fire. One paying user makes this non-optional.
