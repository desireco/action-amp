# Announcement email — platform switch

> v3 §6 step 1. The user-facing note that goes out before/at the flip.
> Tone rules per `PRODUCT.md`: calm, direct, honest. No exclamation marks,
> no hype, no fake urgency. Short enough to read on a phone.

**Send:** `{{SEND_DATETIME}}` — at or just before the flip (Jake picks the
exact hour; the v3 §6 quiet-hour guidance applies).

**From:** `{{FROM_ADDRESS}}` — today's verified sender is
`ActionAmp <noreply@actionamp.com>`, but a `noreply` address contradicts the
email's own "reply to us" line. Use a monitored mailbox if one exists and
note it here before sending; otherwise keep `noreply@` and point people at
the feedback channel instead of "reply".

**To:** all registered users (`{{LIST_SOURCE}}` — export or query filled in
at send time; do not commit any address list to the repo).

**Subject:** We're switching the platform ActionAmp runs on

---

Hi `{{FIRST_NAME}}`,

This week we're moving ActionAmp to a new platform. The app you use stays
exactly as it is — this is work under the floorboards, not a redesign.

What changes: the software underneath. Nothing else.

What you need to do: nothing.

Your account, your tasks, your projects, your sign-ins — all untouched. We
are not moving any data. The new platform runs on the same database, and
existing sessions keep working, so you stay signed in.

If anything looks off afterward — a page that misbehaves, something missing,
a login that doesn't — reply to this email and tell us. We would rather hear
about a small thing twice than miss a real one.

— Jake, ActionAmp

---

## Notes for the sender (not part of the email)

- Read it once aloud before sending; if any sentence sounds like marketing,
  cut it. (Nothing here should need an exclamation mark to work.)
- Send **before** the flip so users hear it from us first; the CHECKLIST.md
  step 1 references this draft.
- If the switch slips past the announced window, a one-line follow-up beats
  silence: "Still happening this week. We'll send a short note when it's
  done."
