# ActionAmp — Email Integration (Resend)

> Status: **Implemented** (HTTP-API path shipped 2026-07-08). Transactional
> email — auth verification, password reset, feedback, welcome — is sent through
> **Resend's HTTP API** from production and **SMTP** in dev. The architecture
> below describes the live system; `webapp/src/serverSetup.ts` is the source of
> truth for the runtime send path.
>
> Companion docs: `webapp/src/serverSetup.ts` (the runtime patch),
> `webapp/main.wasp.ts` (`emailSender` + `server.setupFn` config),
> `webapp/src/auth/email/` (the auth email pages). Authority for *how* email is
> delivered.

---

## 0. TL;DR

- **Provider: Resend.** Domain `actionamp.com` is verified.
- **Prod sends via Resend's HTTP API (`POST api.resend.com:443`), not SMTP.**
  Railway → Resend SMTP (ports 465/587) is unreachable — constant `ETIMEDOUT`
  at the connection phase. Resend's own guidance is "use the HTTP API for
  production; SMTP is the fallback." HTTPS egress is never blocked.
- **Wasp 0.24 has no native Resend provider** — `emailSender` supports only
  SMTP / SendGrid / Mailgun / Dummy. We stay on Resend by patching nodemailer's
  send path at runtime via a `server.setupFn`.
- **Dev keeps SMTP** — the patch is gated on `RESEND_API_KEY`, which is absent
  locally. Zero behavior change in `wasp start`.
- **`SMTP_SECURE` is a no-op** in this Wasp version (see §3). Don't try to tune
  SMTP TLS; it can't be fixed from config.

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

## 2. How it's wired (the runtime patch)

Wasp's generated `emailSender` is created **eagerly at bundle load** from the
`emailSender.provider: "SMTP"` config (see `.wasp/out/server/bundle/server.js`:
`initSmtpEmailSender` → `createTransport`). It runs before the server setup
function, so the transport config can't be swapped at runtime.

Instead, `webapp/src/serverSetup.ts` (registered as `app.server.setupFn`) does:

1. Read `RESEND_API_KEY`. If absent (dev), return — original SMTP `sendMail`
   runs unchanged.
2. Take the shared nodemailer **Mailer prototype** via a throwaway transporter
   (`Object.getPrototypeOf(createTransport(…))`). All transporter instances
   share it, so the already-created `emailSender` is covered.
3. Override `proto.sendMail` to `POST https://api.resend.com/emails` with
   `Authorization: Bearer <key>` and the nodemailer mail fields
   (`from`/`to`/`subject`/`text`/`html`), returning a nodemailer-compatible
   `{ messageId, response }`.

**Scope:** the app uses nodemailer only through Wasp's `emailSender`, so
patching the shared prototype is safe. If nodemailer is ever used elsewhere,
revisit this.

## 3. The `SMTP_SECURE` no-op (don't repeat this)

Wasp 0.24's generated SMTP provider calls `createTransport({ host, port, auth })`
with **no `secure` option and never reads `SMTP_SECURE`**. So:

- Setting `SMTP_SECURE=true` does nothing.
- On port 465 (implicit TLS), nodemailer defaults to `secure:false` → plaintext
  handshake on a TLS-only port → `ETIMEDOUT`.

The HTTP-API patch sidesteps SMTP entirely, so this no longer matters in prod.
In dev, SMTP on 465 works because local egress is clean.

## 4. Configuration

### `webapp/main.wasp.ts`
```ts
emailSender: {
  provider: "SMTP",            // dev fallback; overridden at runtime in prod
  defaultFrom: { name: "ActionAmp", email: "noreply@actionamp.com" },
},
server: {
  setupFn: serverSetup,        // routes prod sends through Resend HTTP API
},
```

### Environment (Railway → `action-amp-server`, production)
| Var | Value | Purpose |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | **Required for prod** — activates the HTTP-API patch |
| `SMTP_HOST` | `smtp.resend.com` | Dev fallback (unused in prod) |
| `SMTP_PORT` | `465` | Dev fallback |
| `SMTP_USERNAME` | `resend` | Dev fallback |
| `SMTP_PASSWORD` | `re_…` (same key) | Dev fallback |

`.env.server` is gitignored — secrets never enter the repo.

## 5. DNS on `actionamp.com`

| Record | Status | Action |
|---|---|---|
| **DKIM** (`resend._domainkey`) | ✅ present | none |
| **SPF** (apex `TXT`) | ⚠️ **missing** | **Add `v=spf1 include:send.resend.com ~all`** — confirm exact `include` in Resend → Domains → DNS records. Missing SPF raises spam-folder risk. |
| **DMARC** (`_dmarc`) | ✅ `v=DMARC1; p=none` | Move to `p=quarantine` later, once SPF alignment is confirmed via the DMARC reports (`rua=mailto:dmarc@actionamp.com`). |
| Domain verified in Resend | ✅ | none |
| **From address** | `ActionAmp <noreply@actionamp.com>` | keep (verified sender) |
| MX | none | acceptable — domain is send-only |

## 6. Verifying delivery

1. Trigger a real send (e.g. password reset on `app.actionamp.com/login`).
2. Check **Resend dashboard → Logs**: the send's `last_event` should reach
   `delivered`.
3. Programmatic check: `GET https://api.resend.com/emails` with
   `Authorization: Bearer <key>` returns recent sends + `last_event`.
4. `delivered` means Resend handed it to the recipient's mail server — **not**
   the inbox. Check spam/promotions for actual placement (especially the first
   sends from a domain).

## 7. Debugging gotchas

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

## 8. Operations

- **Redeploy after changing `RESEND_API_KEY`** — env-var changes don't reach the
  running process until a redeploy.
- **Rotating the Resend key:** revoke in Resend → create new → update both
  `RESEND_API_KEY` and `SMTP_PASSWORD` on Railway → redeploy.
- **Don't revert prod to SMTP.** It will break again (Railway egress). The
  HTTP-API patch is load-bearing.

## 9. Security

- Rotate any secret that touches a transcript/log: **Stripe live key** (highest
  priority), **JWT secret**, **DB password**, **Resend API key**,
  **Stripe webhook secret**.
- `.env.server` is gitignored and has never been committed — verify with
  `git ls-files .env.server` (should error / show nothing) if in doubt.
