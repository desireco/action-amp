# S14 — Emails + cron (parity notes)

> P0 pre-study for the platform switch. Source of truth read: `webapp/main.wasp.ts`
> (`emailSender` config + the single `job`), `docs/EMAIL-INTEGRATION.md` (implemented),
> `webapp/src/auth/magicLogin.ts` (+ `magicLoginEmail.tsx`), `webapp/src/onboarding/welcomeEmail.tsx`,
> `webapp/src/feedback/operations.ts` + `config.ts` (+ `src/email/FeedbackEmail.tsx`,
> `TransactionalEmail.tsx`, `previews/`), `webapp/src/notifications/dailyReminderJob.ts`
> (+ test), `webapp/src/shared/time/temporal` (clock), `.env.server` key names.
> The push/SW half of the reminder is owned by S12; this file owns the mail transport
> and the cron contract. These notes are the checklist the port is verified against.

## 1. Surface inventory

| Piece | Where | Trigger |
|---|---|---|
| Email transport | Wasp `emailSender` — `provider: "Resend"`, `defaultFrom: ActionAmp <noreply@actionamp.com>` (`main.wasp.ts`) | All sends below. |
| Magic-login code email | `auth/magicLogin.ts :: sendLoginEmail` | `requestMagicLogin` action (`/login`, `/signup`). |
| Welcome email | `onboarding/welcomeEmail.tsx`, sent by `completeOnboarding` | Once per account, on onboarding completion (best-effort). |
| Feedback notification email | `feedback/operations.ts :: maybeSendFeedbackEmail` | `submitFeedback` action, **only when `NODE_ENV === "production"`**. |
| (Wasp built-in auth mail) | `email` auth method config (verification route `/email-verification`; passwordReset clientRoute pinned to `/login`) | Scaffold only — the passwordless flow creates users with `isEmailVerified: true`; a stale provider reset link lands on passwordless login where it can't change a password. No reset emails exist. |
| The cron job | `notifications/dailyReminderJob.ts :: sendDailyTodayReminder` | **The only job in the app.** PgBoss executor, `schedule: { cron: "* * * * *" }` (every minute), entities `User, PushSubscription, Task`. |
| Shared templates | `src/email/TransactionalEmail.tsx` (react-email layout: title/preview/CTA + fixed footer "One task. Then the next. · Built By Dakic"), `previews/` (Feedback + Welcome preview pages) | — |

## 2. Email contracts

### 2.1 Magic-login code (the daily-use one)
- Subject **"Your ActionAmp sign-in code"**; body: the six-digit code (big type) +
  a one-time sign-in link button; text twin with both. Template `MagicLoginEmail`
  on the shared `TransactionalEmail` layout. Link = `${WASP_WEB_CLIENT_URL}/…`
  via `buildMagicLoginUrl(baseUrl, token, returnTo)` (returnTo validated by
  `safeAuthReturnTo`).
- Challenge mechanics (`MagicLoginChallenge` model): `codeHash = sha256(id:code)`,
  `tokenHash = sha256(token)` (32-byte base64url token) — **hashed at rest**; TTL
  **10 minutes**; **5 verification attempts** (code path); **one active challenge
  per address per 60s** (the resend guard — same calm `{sent:true}` response for
  fresh and rate-limited so it doesn't reveal account existence); a newer request
  supersedes (consumes) all older unconsumed challenges for the address; consume is
  atomic (`updateMany where consumedAt: null` must hit exactly 1) so code+link
  races can't mint two sessions.
- **Localhost**: code is always **`111111`** and **no email is sent** (detected via
  `WASP_WEB_CLIENT_URL` hostname or `NODE_ENV=development`). Production: crypto-random
  six digits + real send.
- Delivery failure: log server-side, **delete the just-created challenge** (never
  leave a usable credential behind), throw `503 "Could not send email. Try again
  shortly."`.
- Unknown-address behavior: the op still returns `{sent:true}` and sends nothing
  (no account-existence leak).

### 2.2 Welcome email — see S13 §3.6 (recipient resolution from auth identities,
name fallback chain, subject, best-effort swallow). Transport note: both onboarding
and feedback import the sender via a dynamic `"wasp/server/" + "email"` string
(a `wasp compile` workaround) — the port should just import its mail module directly.

### 2.3 Feedback notification
- Fires only in production (`shouldSendFeedbackEmail()`) and is skipped under
  `NODE_ENV=test`; recipient `ACTIONAMP_ADMIN_EMAIL?.trim() || "zeljko@dakic.com"`
  (`feedback/config.ts`); subject **"ActionAmp feedback"**; react-email
  `FeedbackEmail` template; failure is swallowed after the Feedback row is saved
  (the row is the source of truth; the email is a heads-up).

## 3. The cron job — `sendDailyTodayReminder` (full contract)

Runs **every minute** so any user-chosen local HH:mm can fire; per-user idempotence
makes it effectively once per user per calendar day. Returns `{ sent }` (count of
successful notification sends — the job's only observable output).

1. **VAPID gate**: read `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`;
   any missing → return `{sent: 0}` (no-op, no error).
2. `webpush.setVapidDetails(subject, publicKey, privateKey)`.
3. Load all users `where dailyReminderEnabled: true` with
   `{id, dailyReminderTime, dailyReminderTimeZone, lastDailyReminderAt, pushSubscriptions}`.
4. Per user: compute local `{date, time}` via **Temporal** (`instantFrom(now)
   .toZonedDateTimeISO(tz)`, minutes precision) — invalid tz → `continue` (skip);
   `time !== dailyReminderTime` → skip; already sent **this local date**
   (`lastDailyReminderAt` resolved in the same tz) → skip.
5. Query top **3** open TODAY tasks (`status: "TODAY", isDone: false`, order
   `priority desc, order asc`) + total count; `buildReminderBody`:
   - tasks present → `Today: <name1>, <name2>, <name3>` (+ ` (+N more)` when
     count > named sample); each name truncated at **48 chars** with `…`.
   - none → **"Nothing planned yet. Choose what matters."** (calm empty nudge).
6. Payload `JSON.stringify({ title: "ActionAmp", body, url: "/do/today" })` →
   `webpush.sendNotification` to every subscription (Promise.allSettled).
   Fulfilled → `sent++`; rejected with statusCode **404/410** → delete that
   `PushSubscription` row (pruned dead endpoints).
7. Stamp `lastDailyReminderAt = now` **if the user had ≥1 subscription — after an
   attempted delivery, failures included**: a retry-every-minute-until-midnight
   loop is worse than one missed calm nudge. Users with zero subscriptions never
   get stamped (so a later subscribe still fires that day).

Port notes: the per-minute cadence + once-per-local-day guard + the
"stamp even on failure" rule are the invariant trio. In the new stack this becomes
a Bun/cron-style scheduler entry (or PgBoss equivalent) — it must also survive
multiple workers (two runs in the same minute must not double-send: currently the
`lastDailyReminderAt` check-then-stamp is not atomic, so keep the job
single-instance or make the stamp conditional/atomic).

## 4. Env vars / keys (names only)

| Var | Used by | Notes |
|---|---|---|
| `RESEND_API_KEY` | transport | Required anywhere the server may send mail. Rotation → redeploy (env changes don't reach a running process). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | reminder job | Missing → job no-ops (S12 §5). |
| `WASP_WEB_CLIENT_URL` | link building | Magic-login URL, welcome-email appUrl; also drives the localhost fixed-code behavior. |
| `ACTIONAMP_ADMIN_EMAIL` | feedback email | Optional; hardcoded fallback exists. |
| `NODE_ENV` | gates | Feedback send gate, localhost code detection fallback, feedback test skip. |
| Legacy in `.env.server`, unused by code: `SMTP_HOST/PORT/USERNAME/PASSWORD` (pre-Resend), `SKIP_EMAIL_VERIFICATION_IN_DEV`, `GOOGLE_CLIENT_ID/SECRET` (social auth disabled). | | Don't port these. |

DNS/ops facts to carry over: domain `actionamp.com` verified in Resend; SPF record
for `send.resend.com` was still missing (spam-placement risk); DMARC `p=none`;
send-only (no MX). **Never revert to SMTP** — Railway's SMTP egress times out at
connection (ETIMEDOUT at CONN); the HTTPS API (port 443) is the only reliable
transport from the deploy host.

## 5. Edge cases

- Same-key dev/prod: localhost sends (fixed code path aside) appear in the same
  Resend logs as prod — misleading when debugging.
- Separate databases: a request for an address unknown in *that* environment
  returns 200 and sends nothing.
- Resend "delivered" = handed to the recipient MX, not inbox placement.
- Welcome/feedback emails must never fail their parent flows (both swallowed);
  the magic-login email **must** fail the request (503 + challenge deleted) —
  opposite postures, both deliberate.
- Reminder-job failure of one user must not abort the run (per-user try/catch on
  the clock only; send failures are settled promises).

## 6. Tests pinning behavior

- `notifications/dailyReminderJob.test.ts` — `truncate` (48-char ellipsis,
  boundary) + `buildReminderBody` (named ≤3, `(+N more)` only when count exceeds
  sample, no `+0`, calm fallback, long-name truncation, sample>count oddity).
  The loop itself (schedule/guards/pruning) is untested — port it behind a pure,
  testable seam.
- `auth` tests: `LoginPage.test.tsx` / `PasswordlessAuthPage.test.tsx` (request →
  verify step machine), `magicLogin` behavior covered via those + e2e `login.spec.ts`.
- `onboarding/welcomeEmail.test.ts`, `email/TransactionalEmail.test.tsx`,
  `feedback` op tests (email skipped in test env).

## 7. Parity bar

**Switch-day (100%):** the magic-login email + its challenge mechanics (hashed at
rest, 10-min TTL, 5 attempts, 1/minute resend guard, atomic consume, 503+delete on
delivery failure, localhost `111111` no-send) — auth is the front door and password
login effectively doesn't exist; and the reminder job's schedule/idempotence/payload
(see S12 for the client half) — a regression here either spams every minute or
silently kills the retention nudge. **Day-two acceptable:** welcome email, feedback
notification (both best-effort by design), email previews. **Not ported:** SMTP
legacy vars, Wasp's password-reset/verification mail scaffold (the passwordless
flow replaces it; keep the no-password-reset posture).
