# ActionAmp — Email Integration (Resend)

> Status: **Implemented**. Transactional email — auth verification, password
> reset, feedback, welcome — is sent through Wasp's native **Resend** provider.
> `webapp/main.wasp.ts` is source of truth for the transport configuration.
>
> Companion docs: `webapp/main.wasp.ts` (`emailSender` config),
> `webapp/src/auth/email/` (the auth email pages). Authority for *how* email is
> delivered.

---

## 0. TL;DR

- **Provider: Resend.** Domain `actionamp.com` is verified.
- **All environments send via Resend's HTTPS API.** This avoids Railway's blocked
  SMTP egress and removes the custom nodemailer runtime patch.
- **Wasp 0.25 supports `provider: "Resend"` natively.** Wasp owns the provider
  implementation while ActionAmp continues to use its existing templates and
  `emailSender.send` calls.
- **`RESEND_API_KEY` is required** wherever the server starts and may send mail.

---

## 1. Why HTTP API, not SMTP

- **Symptom in prod:** every outbound email failed with
  `Failed to send email Error: Connection timeout … code: 'ETIMEDOUT',
  command: 'CONN'`. The failure is at TCP/TLS **connection establishment** —
  before auth, before send. That's network egress, not credentials or config.
- **Constant, not intermittent:** dev (laptop) always delivered; prod never did.
  The differentiator is the network path: your laptop reaches `smtp.resend.com`
  cleanly; Railway does not.
- **Resend's recommendation:** the HTTP API is their production transport.
  SMTP is provided as a fallback and is known-unreliable from cloud hosts.
- **Port-hopping (465 ↔ 587) does not help** — both are unreachable from
  Railway. Only the API (port 443) works reliably.

## 2. How it's wired

`webapp/main.wasp.ts` declares `emailSender.provider: "Resend"` and the
standard `defaultFrom` sender. Wasp creates the HTTPS Resend transport and
exposes it as `emailSender` from `wasp/server/email`.

ActionAmp's existing call sites (`src/onboarding/operations.ts` and
`src/feedback/operations.ts`) keep calling `emailSender.send`; no template,
recipient, or auth-flow behavior changes.

## 3. Configuration

### `webapp/main.wasp.ts`
```ts
emailSender: {
  provider: "Resend",
  defaultFrom: { name: "ActionAmp", email: "noreply@actionamp.com" },
},
```

### Environment (Railway → `action-amp-server`, production)
| Var | Value | Purpose |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | Required by Wasp's native Resend provider |

`.env.server` is gitignored — secrets never enter the repo.

## 4. DNS on `actionamp.com`

| Record | Status | Action |
|---|---|---|
| **DKIM** (`resend._domainkey`) | ✅ present | none |
| **SPF** (apex `TXT`) | ⚠️ **missing** | **Add `v=spf1 include:send.resend.com ~all`** — confirm exact `include` in Resend → Domains → DNS records. Missing SPF raises spam-folder risk. |
| **DMARC** (`_dmarc`) | ✅ `v=DMARC1; p=none` | Move to `p=quarantine` later, once SPF alignment is confirmed via the DMARC reports (`rua=mailto:dmarc@actionamp.com`). |
| Domain verified in Resend | ✅ | none |
| **From address** | `ActionAmp <noreply@actionamp.com>` | keep (verified sender) |
| MX | none | acceptable — domain is send-only |

## 5. Verifying delivery

1. Trigger a real send (e.g. password reset on `app.actionamp.com/login`).
2. Check **Resend dashboard → Logs**: the send's `last_event` should reach
   `delivered`.
3. Programmatic check: `GET https://api.resend.com/emails` with
   `Authorization: Bearer <key>` returns recent sends + `last_event`.
4. `delivered` means Resend handed it to the recipient's mail server — **not**
   the inbox. Check spam/promotions for actual placement (especially the first
   sends from a domain).

## 6. Debugging gotchas

These cost real time during the original investigation — keep them in mind:

- **`request-password-reset` returns `200` even when the send fails.** Wasp
  swallows send errors (anti-enumeration) and logs them server-side. A `200`
  response does **not** mean the email was sent.
- **60-second resend cooldown.** Repeated reset requests inside 60s are silently
  dropped (`isEmailResendAllowed`, `resendInterval = 60_000`). Rapid re-testing
  looks like "no email" when really it's the cooldown.
- **"Works locally, fails on prod" + `ETIMEDOUT` at `CONN` = network egress.**
  Not auth, not keys, not config. Reach for the HTTP API, don't tune SMTP.
- **Separate databases.** A test email may be registered in dev (via the
  autologin route) but not in prod → Wasp returns `200` and sends nothing for
  unknown addresses.
- **Localhost sends appear in the same Resend Logs** as prod sends (same key),
  which can mislead you into thinking a send came from prod.

## 7. Operations

- **Redeploy after changing `RESEND_API_KEY`** — env-var changes don't reach the
  running process until a redeploy.
- **Rotating the Resend key:** revoke in Resend → create new → update
  `RESEND_API_KEY` in every server environment → redeploy.
- **Don't revert prod to SMTP.** Railway SMTP egress previously timed out.

## 8. Security

- Rotate any secret that touches a transcript/log: **Stripe live key** (highest
  priority), **JWT secret**, **DB password**, **Resend API key**,
  **Stripe webhook secret**.
- `.env.server` is gitignored and has never been committed — verify with
  `git ls-files .env.server` (should error / show nothing) if in doubt.
