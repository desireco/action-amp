# Rollback — the one-pager

> v3 §6 "Rollback". Print this or keep it open on switch day. The rollback is
> a domain flip back to the untouched Wasp service plus a Stripe webhook URL
> revert. It costs minutes, not hours. When in doubt, roll back — diagnosing
> on the new stack can happen after the product is safe.

## The one-line model

The database never moved and the schema never changed, so rolling back moves
**nothing but traffic**: point the domains at the Wasp service again, point
the Stripe webhook at the Wasp URL again. Wasp has been stopped-but-startable
the whole time and `webapp/` is untouched (I1) — it still deploys.

## Roll back when any of these is true (v3 triggers)

- [ ] **Login is broken for a NEW user** — a fresh passwordless login cannot
      complete (code or link fails, or verifying never lands a session).
- [ ] **Write errors** — captures, triage dispatches, task edits, or settings
      saves failing persistently (not one flaky request; a pattern).
- [ ] **Billing misbehavior** — the billing portal won't open, Stripe webhook
      events aren't landing (plan changes not applying), or a plan/cap answer
      is wrong.

Also roll back immediately on anything that smells like **data damage**
(wrong task shown to a user, a write that altered the wrong row). Restore
from the final backup only if damage is confirmed — see the note below.

## Do NOT roll back for

One slow page. A cosmetic bug. A single confusing support email. Log it,
keep watching, fix forward if it's small — the flip back is cheap, so save
it for the triggers above.

## Who does what

| Who | Does |
|---|---|
| **Jake** | Makes the call. Performs the two dashboard flips (Railway domains, Stripe webhook). Decides on any backup restore (destructive — Jake only). |
| **Second person** (agent or human) | Runs `scripts/switch/rollback.sh` before the flip (warm-checks the Wasp service, prints the exact steps), then again after (verifies the rolled-back stack). Keeps the timestamped incident note. |

One person can do both, but the second pair of eyes on the trigger decision
is worth the ten minutes.

## The flip-back, in order (minutes, not hours)

1. **Note the time.** Write down switch start and rollback start — this is
   the *switch window* (see below). `date -u` output into the incident note.
2. **Railway — move the domains back.** Project `{{RAILWAY_PROJECT}}`
   (dashboard → the service networking settings):
   `app.actionamp.com` and `api.actionamp.com` → back to the Wasp service
   `{{WASP_SERVICE}}` (name to fill in from Railway; the Wasp service is
   `action-amp-server` in project `afda37a6-…` per
   `docs/research/deployment-research.md` §6). Detach them from the
   new-stack services `{{NEW_STACK_SERVICES}}` — do **not** delete the
   new-stack deployment; it stays for diagnosis.
3. **Stripe — revert the webhook URL.** Dashboard → Developers → Webhooks →
   the ActionAmp endpoint → URL back to `{{WASP_WEBHOOK_URL}}`
   (the Wasp URL recorded in CHECKLIST.md step 6 before it was changed).
4. **Run the script.** `BASE_URL=https://api.actionamp.com
   scripts/switch/rollback.sh` — it warm-checks the Wasp service, prints
   these steps verbatim, and re-verifies after the flip.
5. **Verify the triggers are clear** (these mirror the v3 §6 verify list):
   - a fresh passwordless login completes (code arrives, verifying lands a
     session);
   - one write works (capture an item, complete it);
   - billing: the portal opens and the plan reads correctly.
6. **Resume the watch.** 48h of close log watching continues, now on Wasp.
   Leave the new stack deployed but dark for post-mortem.

Propagation expectation: Railway domain reassignment takes effect in roughly
a minute (DNS was never touched — both stacks already served these hostnames
via Railway), the Stripe webhook edit is immediate, verification about five
minutes. If it is not converging in fifteen, say so in the incident note and
keep the product on Wasp while diagnosing.

## The switch window and write conflicts

Both stacks share one database, so writes made on the new stack during the
switch window are **real rows in the real database** — they survive the
rollback and no data moves in either direction. The window matters for two
reasons:

- **Diagnosis:** if a write went wrong on the new stack, the window bounds
  which rows to inspect. Keep the timestamps from step 1.
- **Backup restore (rare, destructive):** if data damage is confirmed rather
  than suspected, restoring the final pre-switch backup (v3 §6 step 3)
  discards everything written since — including any good writes from the
  window. That trade is Jake's call alone, made after the rollback flip, not
  during it.

## What this script set never does

Nothing in `scripts/switch/` executes an irreversible step. Every
destructive or dashboard-only action (domain moves, webhook edits, backup
restores) is a printed instruction for a human. The scripts only read
endpoints and perform the one self-cleaning scratch write in the warm check.
