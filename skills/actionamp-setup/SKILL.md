---
name: actionamp-setup
description: >
  Set up and verify the ActionAmp CLI for an agent session: check login,
  discover lenses and projects, and handle empty or brand-new accounts. Use
  when the user says "set up actionamp", "connect actionamp", "am I logged in
  to actionamp", when an actionamp command fails with 401 or "not logged in",
  or the first time any other actionamp skill runs and state is unknown.
---

# ActionAmp setup

Verify the CLI works, then learn the account's shape.

## Steps

1. `actionamp whoami --json`
   - 401 / "Not logged in" → tell the user to run `actionamp login` (opens a
     browser). Stop and wait — do not retry in a loop.
   - 402 → CLI is Pro-gated. Explain once: upgrade under Settings → Billing,
     then `actionamp login` again.
2. `actionamp lens list --json` — enumerate lenses (the account's contexts).
   Note the default lens. Lenses scope everything; most commands take
   `--lens-id`.
3. `actionamp inbox list --json` and one `actionamp now --json` for a first
   read of the account.

## First-run judgment

- **Empty account** (no lenses with content, `now` → `task: null,
  reason: "no-lens"`): suggest the user create a lens or capture a first
  thought — `actionamp capture "<text>"`.
- **Sample data**: tasks flagged `isOnboardingSample: true` are demo content.
  Note them, ignore them in planning, and suggest the user clear them in the
  web app.
- **Active account**: report lenses, open task counts, inbox size. Then hand
  off to whatever the user wanted.

## Rules

Read [../_shared/rules.md](../_shared/rules.md) before acting on anything.
This skill only reads — setup never mutates.
