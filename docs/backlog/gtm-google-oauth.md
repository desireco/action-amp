---
id: gtm-google-oauth
kind: backlog
title: "Create Google Cloud OAuth client + register redirect URIs"
status: ready
priority: P1
spec_owner: user
build_owner: user        # pure setup; no code (code is written in social-auth-google)
gates: social-auth-google (going live)
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4Mgskn      # sync-managed (write-once)
gh_synced_at: 2026-07-07T18:16:34Z   # sync-managed (drift detection)
---

# Google Cloud OAuth client

## What

Create the Google Cloud OAuth consent screen + client, register authorized
redirect URIs, get the credentials, set them in Railway. The code is already
written (`social-auth-google`, `done` code-side) but **disabled** — the
`main.wasp.ts` provider block is commented out and `GoogleButton` returns
`null`. Once this is done, uncomment the block + deploy.

## Done-conditions

- [ ] Google Cloud OAuth consent screen created.
- [ ] Authorized redirect URIs registered:
      `actionamp.com/auth/google/callback` (+ `localhost:...` for dev).
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set in the `action-amp-server`
      Railway service vars.
- [ ] A test user added (consent screen is in "test" mode initially).
- [ ] Provider block uncommented in `main.wasp.ts`, `GoogleButton` re-enabled,
      deployed.
- [ ] End-to-end Google login verified against the live callback.

## Why

For a calm, no-reputation app, asking a stranger to create + verify a password
before they've seen value is the cheapest bounce to eliminate. The code is
ready; the gate is pure console setup.

## Open questions

None (Discover side). Build will re-enable the provider block when the client
exists.
