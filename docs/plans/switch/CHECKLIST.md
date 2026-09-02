# Switch-day checklist (runbook)

> Executes `docs/plans/2026-08-31-platform-switch-v3.md` §6 in order. Jake is
> present for the whole run (goal set gate #4). Check items off as you go;
> every `__:__` is a time placeholder to fill in during the run — the V2
> rehearsal's timings are the reference for what "minutes" means here.
>
> **V2 dependency:** steps 3, 4, 5, 7 and the rollback drill were rehearsed
> end-to-end in V2 before this day. If V2 has not happened, stop and
> schedule it — this checklist assumes the steps are already timed and the
> scripts already exercised (V3) against local and staging URLs.

**Preconditions — all must be true (v3 §6):** V1 parity run done on a fresh
prod dump; Jake's staging dogfood week complete; rollback script tested in
the rehearsal; same-day backup taken (step 3, below); new stack deployed and
warm; Stripe test-mode webhook dry run passed.

Fill in before starting (nothing secret lives in this repo):

```
NEW_STACK_APP_URL=      {{new stack client service, Railway}}
NEW_STACK_API_URL=      {{new stack api service, Railway}}
WASP_WARM_URL=          {{Wasp service direct url — what rollback.sh warm-checks}}
ROLLBACK_BASE_URL=      {{the public api host after a rollback, e.g. https://api.actionamp.com}}
STRIPE_WEBHOOK_OLD=     {{Wasp webhook url, recorded before step 6}}
STRIPE_WEBHOOK_NEW=     {{new stack webhook url}}
BACKUP_FILE=            {{filled at step 3}}
```

---

## 1. Announce — `__:__`

- [ ] Send `ANNOUNCEMENT.md` (filled: send time, from-address, list source).
- [ ] Confirm delivery to your own address before the batch goes out.

## 2. Freeze writes — `__:__`

- [ ] Pick the quiet hour: confirm via analytics/admin dashboard that active
      sessions are near zero (the accepted "freeze" per v3 §6; if a
      maintenance banner mechanism exists by now, `{{MAINTENANCE_MODE}}`,
      enable it instead — fill this in during V2).
- [ ] Note the freeze time — **switch window start** (ROLLBACK.md needs it).

## 3. Final backup — `__:__`

- [ ] Dump:

  ```sh
  # PROD_DATABASE_URL comes from Railway at run time — never stored here.
  pg_dump "$PROD_DATABASE_URL" -Fc -f "backup-$(date +%F-%H%M).dump"
  ```

- [ ] **Verify restorable** (a dump nobody has restored is not a backup):

  ```sh
  createdb scratch_restore_check
  pg_restore --no-owner -d scratch_restore_check "$BACKUP_FILE"
  psql -d scratch_restore_check -c 'select count(*) from "User";'   # sane number
  dropdb scratch_restore_check
  ```

## 4. Warm check (new stack, pre-domain) — `__:__`

- [ ] New stack is healthy on its own Railway URLs, before any traffic moves:

  ```sh
  BASE_URL="$NEW_STACK_API_URL" SESSION_COOKIE="$JAKE_WASP_SESSION_COOKIE" \
    scripts/switch/warm-check.sh
  ```

  (`SESSION_COOKIE`: the `wasp_session` value copied from a logged-in
  browser on the CURRENT prod — sessions survive the switch, so this cookie
  is valid on both stacks. Locally, the script can mint one itself via the
  dev login route; that route does not exist in production.)
- [ ] All lines PASS, including the scratch write that cleans up after
      itself. Any FAIL stops the run here — nothing has moved yet.

## 5. Flip the domain — `__:__`

- [ ] Railway: move `app.actionamp.com` + `api.actionamp.com` from the Wasp
      service to `{{NEW_STACK_SERVICES}}`. This is the entire "migration."
- [ ] Note the time — **flip time** (goes in the incident note).
- [ ] Wait for propagation (rehearsal timing); spot-check:

  ```sh
  curl -s https://api.actionamp.com/health        # {"ok":true}
  curl -s https://api.actionamp.com/ready         # {"ok":true,"db":"up"}
  ```

## 6. Stripe webhook URL update — `__:__`

- [ ] Stripe dashboard → Developers → Webhooks → ActionAmp endpoint: URL →
      `"$STRIPE_WEBHOOK_NEW"`. Record the old URL (`$STRIPE_WEBHOOK_OLD`)
      in the incident note **before** editing — the rollback needs it.
- [ ] Send a test event from Stripe (or trigger a harmless billing event)
      and confirm it lands in the new stack's logs.

## 7. Verify on the real domain — `__:__`

- [ ] Automated sweep:

  ```sh
  BASE_URL="https://api.actionamp.com" SESSION_COOKIE="$JAKE_WASP_SESSION_COOKIE" \
    TEST_EMAIL="{{a mailbox you can open right now}}" \
    scripts/switch/verify-switch.sh
  ```

- [ ] Then the manual list the script prints (do them in this order):
  - [ ] **Passwordless login, code path:** the magic-login email arrives for
        `TEST_EMAIL`; the six-digit code logs in and lands on `/do`.
  - [ ] **Passwordless login, link path:** the one-time link in the same
        email logs in too (fresh challenge for a second send if needed).
  - [ ] **NEW-user login** if you have a spare address — the v3 rollback
        trigger is specifically about new users.
  - [ ] **Existing session:** reload a browser tab that was open before the
        flip — still signed in, no re-login (M1).
  - [ ] **Capture** — ⌘K, type, enter; item lands in the inbox.
  - [ ] **Complete a task** — run a focus session or complete from a list;
        logbook reflects it.
  - [ ] **Lists** — Today / Upcoming / Someday render and accept edits.
  - [ ] **CLI:**

    ```sh
    actionamp login            # OAuth browser round-trip mints a PAT
    actionamp now --json       # one --json command against prod
    ```

  - [ ] **Billing portal** — Settings → Billing opens the Stripe portal;
        close it; plan unchanged.
  - [ ] **Push opt-in** — Settings → notifications: the permission prompt
        fires and a subscription row is created (one test notification).
  - [ ] **Share target (Android, if at hand):** share a link into ActionAmp;
        it lands in the inbox.
- [ ] Any failure here → consult ROLLBACK.md triggers. Login-broken-for-new-
      user, persistent write errors, or billing misbehavior = roll back.

## 8. Unfreeze — `__:__`

- [ ] Maintenance banner off (if used); announce internally that the switch
      is done. Most users never noticed; nobody was logged out.

## 9. Watch — `__:__` → +48h

- [ ] Close log watching for 48h (new stack's JSON request/error lines;
      Stripe webhook deliveries; Resend email sends).
- [ ] Wasp stays stopped-but-startable (V5 deletes it after 2–4 weeks, with
      Jake's approval — not now).
- [ ] T+24h check-in `__:__`, T+48h check-in `__:__`: re-run
      `scripts/switch/verify-switch.sh` once each; skim error logs.

---

## During the run: write things down

The incident note (plain text, timestamped) is the switch window's record:
freeze start, backup filename, flip time, webhook edit time, verify results,
unfreeze time — or the rollback decision and its timestamps. Both stacks
share one database (ROLLBACK.md §switch window), so this note is what bounds
any post-hoc write inspection.
