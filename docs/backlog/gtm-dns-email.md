---
id: gtm-dns-email
kind: backlog
title: "DNS hygiene (SPF/DKIM/DMARC) + email deliverability check"
status: ready
priority: P1
spec_owner: user
build_owner: user
gates: auth + billing email placement (not bouncing to spam)
created: 2026-07-03

# sync-managed (do not hand-edit; written by duet sync):
gh_node_id: PVTI_lAHN6NzOAXMArs4MgsjN      # sync-managed (write-once)
gh_synced_at: 2026-07-07T18:16:34Z   # sync-managed (drift detection)
---

# DNS hygiene + email deliverability

## What

`actionamp.com` resolves (verified). Confirm: SPF/DKIM/DMARC for the
`noreply@actionamp.com` sender (so auth + billing emails land in the inbox, not
spam), and that `api.actionamp.com` SSL is the managed cert auto-renewing.
Resend is wired but deliverability is a DNS/config outcome, not code.

## Done-conditions

- [ ] SPF record published for `actionamp.com`.
- [ ] DKIM signing configured + DNS record published.
- [ ] DMARC record published (even `p=none` to start, with monitoring).
- [ ] `api.actionamp.com` SSL cert confirmed managed + auto-renewing.
- [ ] Test signup email + test password-reset sent to a Gmail AND an Outlook
      address; confirmed inbox placement (not spam).

## Why

Auth + billing both depend on email delivery. A user who can't verify their
email can't sign up; a billing receipt in spam erodes trust silently.
