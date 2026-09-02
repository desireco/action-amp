# S13 — Onboarding (parity notes)

> P0 pre-study for the platform switch. Source of truth read: `webapp/src/onboarding/`
> (`OnboardingPage.tsx`, `operations.ts` (+`operations.test.ts`), `welcomeEmail.tsx`
> (+`welcomeEmail.test.ts`)), the gate in `webapp/src/App.tsx`, the `ensureOnboarded`
> call in `webapp/src/app/AppShell.tsx`, stage transitions in
> `webapp/src/tasks/operations.ts` + `webapp/src/inbox/operations.ts`, guided hints in
> `webapp/src/app/NextPage.tsx`, `webapp/schema.prisma` (User fields, `OnboardingStage`),
> `webapp/main.wasp.ts`, `docs/features/onboarding.md` (verified 2026-07-03),
> `docs/PUBLIC-PAGES.md` §2. These notes are the checklist the port is verified against.

## 1. Routes / screens

| Surface | Where | Notes |
|---|---|---|
| `/welcome` (OnboardingRoute, **auth required**) | `OnboardingPage.tsx` | One-time carousel; auth-gated so it renders post-signup. |
| First-run gate | `App.tsx` | Authed user with `hasSeenOnboarding === false` on any `/do*` path → `<Navigate to="/welcome" replace />`. Scoped to `/do*` only — never yanks an un-onboarded user off `/email-verification`, `/founding-100/welcome`, etc.; skips while the session is still resolving. |
| Guided hints (not pages) | `NextPage.tsx` | When `onboardingStage === "CAPTURE"` and no task selected → first-capture prompt; `=== "TRIAGE"` → first-triage prompt. |

## 2. Operations

| Op | Kind | Input → Output | Notes |
|---|---|---|---|
| `ensureOnboarded` | action (auth) | `never` → `{ createdLenses: {name,id}[] }` | Idempotent bootstrap, called **once per user session** from AppShell (ref-guarded against StrictMode double-fire; only when authenticated). Declared entities: Lens, Project, Task, User. |
| `setPreferredName` | action (auth) | `{ preferredName }` → `{ preferredName }` | Trim + required (`"Preferred name is required."`); updates `User.preferredName`. |
| `completeOnboarding` | action (auth) | `{ skipGuidance?: boolean }` → `{ hasSeenOnboarding: true }` | Idempotent — early-returns if `context.user.hasSeenOnboarding` already true. |

No api routes; no job. The welcome email is sent inline by `completeOnboarding`
(transport details in S14).

## 3. Behaviors + data flows

### 3.1 The carousel (`OnboardingPage.tsx`)
- Pages: `welcome → (name, only when `!user.firstName?.trim()`) → capture → triage → focus`.
  Three one-sentence teaching panels for the real loop (Capture ⌘K / Triage decides /
  Focus one thing) with minimal decorative visuals (aria-hidden), dots, mobile title
  variants, focus moved to each guided heading for a11y.
- `welcome`: "It opens to one task, not a list." + **Show me →** / **Skip intro**
  (skip = `finish(true)`).
- `name`: input prefilled placeholder `user.firstName`; Enter or "Looks good →"
  submits `setPreferredName` — **save failures are swallowed** (onboarding must
  never block on a network hiccup; falls back to `firstName`); advances regardless.
- Keyboard (reading panels only, never while typing / on page 0): `→`/`Enter` next,
  `←` back, `Esc` = skip (`finish(true)`).
- `finish(skipGuidance)`: `completeOnboarding` → then **optimistically patch the
  `["auth/me"]` query cache** (`hasSeenOnboarding: true`, `onboardingStage`) so the
  App.tsx gate doesn't bounce the user straight back to `/welcome` (redirect loop);
  then `navigate("/do")`. On failure: stay on the panel, show
  "Couldn't save — check your connection and try again.", allow retry — **never
  navigate on a failed completion**, because the gate reads the same server flag.

### 3.2 `completeOnboarding` server contract
1. Idempotence check (early return when already complete).
2. `User.update { hasSeenOnboarding: true, onboardingStage: skipGuidance ?
   "COMPLETE" : "SAMPLE_TASK" }` — skip sets COMPLETE, which also prevents
   `ensureOnboarded` from seeding the practice task.
3. Fire-and-forget analytics `ONBOARDING_COMPLETED` (`visitorId: "user_<id>"`,
   `route: "/welcome"`) — errors swallowed.
4. **Welcome email, best-effort**: wrapped in try/catch — completion must never
   fail because SMTP/provider is down. Email contract in S14 §2.

### 3.3 `ensureOnboarded` server contract (idempotent bootstrap)
- `DEFAULT_LENSES`: **Work** (color `indigo`, `isIncluded: false` — the Free-plan
  entitlement flag, not a category) and **Me** (color `emerald`, `isIncluded: true`).
  Lookup is by `{ userId, isDefault: true, isIncluded }` — **not by name**
  (rename-safe). Existing default with a drifted color gets the color backfilled;
  name/kind never touched.
- Seeds a **"General" project per default lens** (the default target of triage's
  P key, so nothing is orphaned) — looked up by `{userId, lensId, name: "General"}`
  (rename-safe via lens kind), permalink via `uniquePermalink("General", …)`.
- Seeds **one sample task** only when `onboardingStage === "SAMPLE_TASK"` **and**
  the user has zero tasks: `"Practice: complete this task"`, `status TODAY`,
  `priority NORMAL`, `size S`, in the **Me** lens, `isOnboardingSample: true`,
  unique permalink. Check-then-create (not atomic) — hence the client's
  once-per-session ref guard.
- Returns the lenses it created (used by tests; the client ignores the result).

### 3.4 `onboardingStage` state machine (transitions live OUTSIDE this folder)
```
completeOnboarding:  (skip? COMPLETE : SAMPLE_TASK)
tasks/operations.ts (sample-task completion paths ×2): SAMPLE_TASK → CAPTURE
inbox/operations.ts createInboxItem:                  CAPTURE → TRIAGE
inbox/operations.ts triageInboxItem:                  TRIAGE → COMPLETE
```
All transitions are conditional `updateMany` (only advance if currently at the
expected stage). Schema default is `COMPLETE` — pre-existing users never see
onboarding; only fresh signups enter the machine.

### 3.5 What onboarding creates (data footprint)
2 default Lenses (Work/Me with identity colors), 2 "General" projects (one per
lens), optionally 1 sample Task, `User.preferredName?`, `User.hasSeenOnboarding`,
`User.onboardingStage`, one `ONBOARDING_COMPLETED` analytics event, one welcome email.

### 3.6 Welcome email (`welcomeEmail.tsx`)
Recipient is **not** on `User` (no email column) — resolved from the auth identity
table: for the email provider `providerUserId` IS the address; a google identity's
sub id is filtered out by the `@` check. Reached via a **direct PrismaClient**
(`onboardingDb.findAuthByUser`) because Wasp keeps auth models out of
`context.entities`. In the port, the email should come from the session/user record
directly. Name = `preferredName || firstName || "there"`. Subject
**"Your first task is waiting"**; CTA `Open ActionAmp` → `${appUrl}/do` where
appUrl = `WASP_WEB_CLIENT_URL ?? http://localhost:4000`. HTML via the shared
`TransactionalEmail` react-email layout; plain-text twin included. Returns `null`
(no send) when no address resolvable.

## 4. Env vars / keys (names only)

`WASP_WEB_CLIENT_URL` (welcome-email links). No others — email transport env is
S14's concern (`RESEND_API_KEY`).

## 5. Edge cases

- **Redirect loop hazard**: the gate reads the same server flag the completion
  writes — the optimistic `["auth/me"]` cache patch and the never-navigate-on-error
  rule are both load-bearing; lose either and finishing bounces the user back.
- Browser/device switch: gate is server-side (the old localStorage gate didn't
  survive either).
- Double-fire of `ensureOnboarded` (StrictMode) could seed two sample tasks —
  guarded client-side by ref; the port should keep a once-per-session guard or make
  the seed atomic.
- Name step skipped entirely when `firstName` exists (e.g. Google-derived or
  signup fullName). Signup collects ONE field (`fullName`), `firstName` is its
  first token (server-side `userSignupFields`).
- `Esc` anywhere in the carousel = skip with guidance suppressed (COMPLETE, no
  sample task) — the returning-member path.
- Welcome email send failure is invisible to the user (no error state).

## 6. Tests pinning behavior

`onboarding/operations.test.ts` (unit, mocked entities + faked auth lookup):
ensureOnboarded idempotence/seeding, setPreferredName validation,
completeOnboarding idempotence + stage writes + non-blocking email failure.
`onboarding/welcomeEmail.test.ts`: recipient resolution (email vs google identity),
name fallback chain, subject/copy. No dedicated e2e spec (login/next specs cover
the funnel edges).

## 7. Parity bar

**Switch-day (100%):** the whole flow — every new signup passes through it, and a
broken gate means either a redirect loop or users landing in a shell with no lenses
(triage/What Now depend on the seeded Work/Me lenses + General projects). That
means: `/welcome` route + gate semantics, the 5-panel carousel with skip, the three
ops with exact idempotence, the sample-task seed conditions, the four
`onboardingStage` transitions in the task/inbox ops, and the server-side
once-per-account flag. **Long-tail:** welcome email (best-effort by design — can
land day two), the guided CAPTURE/TRIAGE hints on NextPage (nice-to-have prompts,
not gates). **Must not regress:** `onboardingStage` default `COMPLETE` so migrated
users never see onboarding again.
