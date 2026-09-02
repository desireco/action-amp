# S13 + S15 wiring — Onboarding + Public/Founding-100

> Status: DELIVERED (this batch). One batch, two small surfaces.
> P0 checklists: `packages/contract/src/s13-onboarding/README.md` +
> `packages/contract/src/s15-public/README.md`. Fragments:
> `packages/contract/src/onboarding.ts` + `public.ts`,
> `packages/domain/src/onboarding/**`,
> `apps/api/src/procedures/onboarding.ts` + `public.ts`,
> `apps/web` welcome + founding-100 routes, `apps/web/e2e/onboarding.spec.ts`.

## 1. Contract + procedures (fragment → composition)

Delivered fragments, composed with the marked one-liners (same
"temporary gate wiring" convention as S9/S12 — the lines are LIVE in this
batch because the slice's own gates (e2e + curl) need the surface mounted):

- `packages/contract/src/router.ts`:
  `onboarding: onboardingContract, // S13` + `public: publicContract, // S15`
- `apps/api/src/router.ts`: the matching `onboardingProcedures` +
  `publicProcedures` lines.
- `packages/contract/src/index.ts`: additive export blocks for both fragments
  (S9/S10/S12 style).
- Wire paths: `POST /rpc/onboarding/{ensureOnboarded,setPreferredName,completeOnboarding,status}`
  and `POST /rpc/public/getFounding100Status`.

### Ops parity map

| Webapp op | Port | Parity notes |
|---|---|---|
| `ensureOnboarded` | `onboarding.ensureOnboarded` → `ensureOnboardedCore` | Verbatim: default lenses looked up by `{userId, isDefault, isIncluded}` FLAGS (never name), color backfill, "General" per lens via `uniquePermalink`, sample task only when stage=SAMPLE_TASK && zero tasks. Returns `{createdLenses}`. |
| `setPreferredName` | `onboarding.setPreferredName` → `setPreferredNameCore` | Trim + required; blank → 400 BAD_REQUEST, "Preferred name is required." verbatim. |
| `completeOnboarding` | `onboarding.completeOnboarding` → `completeOnboardingCore` | Idempotent early-return; skip → COMPLETE else SAMPLE_TASK; analytics + welcome email best-effort, errors swallowed. |
| — (useAuth read) | `onboarding.status` | **NEW, surface-driven**: the webapp gate/carousel read `hasSeenOnboarding`/`firstName` off `useAuth()`. No auth/me exists until S10's issuance work supersedes it; this read (one by-PK User read) is the parity shim. Retire when S10's `me` lands and re-point the store. |
| `getFounding100Status` | `public.getFounding100Status` | Public (no requireUser). `{cap:100, reserved:2, claimed, remaining:max(0,98−claimed), isFull: claimed≥98}`. Counted billed FOUNDER **or** manual `manualAccessGrant='FOUNDER'`, never FRIEND (`FOUNDER_MEMBERSHIP_WHERE`). |

## 2. REST endpoints (apps/api/src/procedures/public.ts → index.ts mount)

Mount line (marked in index.ts): `app.route("/", createPublicRest({ db, entities }))`.

| Endpoint | Contract |
|---|---|
| `GET /founding-100/status` | EXACT payload + key order `{cap, reserved, claimed, remaining, isFull}`; `Cache-Control: public, max-age=60`; CORS for EXACTLY `https://actionamp.com` (GET+OPTIONS, `Vary: Origin`, `Access-Control-Expose-Headers: Cache-Control`); other origins get NO CORS headers; OPTIONS → 204. |
| `GET /` | The `/` redirect (webapp `RedirectToMarketing`): prod → `https://actionamp.com`, localhost/127.0.0.1/::1 → `/login`. **Placement decision:** the web SPA serves the app at `/` (What Now), so the redirect lives on the API host — api.actionamp.com/ must not 404 (P0 §1 semantics preserved on the host that has a spare root). Revisit if the marketing split ever wants the redirect client-side again. |
| `POST /api/analytics/event` | FunnelTracker public ingest: validates `name` (webapp `ANALYTICS_EVENTS` set) + `visitorId` (`^[a-zA-Z0-9_-]+$`, ≤80), upserts the visitor session (lastSeenAt touch), inserts the event, 204; any rejection → 400 `{"error":"Invalid analytics event."}` (webapp body). **CORS (cross-review add):** the webapp analyticsMiddleware's two product origins (`actionamp.com` + `app.actionamp.com`, POST/OPTIONS, `Content-Type`) are ported too — the Astro tracker's text/plain body lands without them, but a preflighted JSON poster would lose events. **Fidelity (deferred):** minimal recorder — no utm/referrer attribution on first-seen, no `user_*` session reuse; the full analytics port owns those. It DOES keep the ONE_TIME_EVENTS dedup (one ONBOARDING_COMPLETED/SIGNUP_COMPLETED/… per user, ever). `completeOnboarding` routes through the same recorder with the webapp's exact payload (`visitorId: user_<id>`, `route: "/welcome"`). The recorder + payload builder live in `publicCore.ts` (pure slice — vitest can't import `@actionamp/contract`; reminder.ts precedent). |

## 3. Web routes

| Route | File | Notes |
|---|---|---|
| `/welcome` | `src/routes/welcome/+page.svelte` | The 5-panel carousel, verbatim copy/visuals/keyboard (→/Enter/←, Esc=skip, none of it while typing; page 0 ignores keys). Name step iff `!firstName`. `finish()` navigates ONLY after the server ack + optimistic store patch; failure keeps the panel with "Couldn’t save — check your connection and try again." |
| `/founding-100` | `src/routes/founding-100/+page.svelte` | Public offer page. CTA state machine: default → anonymous "Log in to Claim Your Spot" (`/login?returnTo=%2Ffounding-100`) → full "All 100 spots claimed" (disabled) → founder "You're a Founding Member" (disabled). Static "98 public memberships" fallback until the status query lands. |
| `/founding-100/welcome` | `src/routes/founding-100/welcome/+page.svelte` | 2s account poll, 45s cap; Finalizing → Congratulations ("member #N of 100") → StillConfirming. Never fakes success. |
| (chrome) | `src/lib/components/PublicLayout.svelte` + `publicLayout.css`, `founding100.css` | Webapp PublicLayout + Founding100Page.css ports (token-import dropped — tokens load globally). |
| (gate) | `src/lib/components/OnboardingGate.svelte` | **Layout-gate decision:** mounted once from the root `+layout.svelte` (3 marked lines) — the webapp kept the gate in App.tsx, this is the equivalent shared spot. Scope: the app home only (`/`, plus `/do*` for when that move composes) — never public pages; inert while resolving or unauthenticated (401). Also fires the once-per-session `ensureOnboarded` bootstrap on app-home entry with onboarding complete (the webapp AppShell call) — NOT before completion, matching the webapp's bounce-first order so the sample task seeds on the post-completion pass. |

Client stores: `lib/stores/onboarding.svelte.ts` (status load, ref-guarded
ensureOnboarded, swallow-failure name save, optimistic completion patch — the
["auth/me"] patch analogue), `lib/stores/public.svelte.ts` (founding status +
`trackFunnelEvent` → the public ingest; visitor id in localStorage
`actionamp.analytics.visitor`, Astro parity).

## 4. Domain seam (additive)

- `db/seam.ts`: `UserDelegate` (findUnique by id / update
  {preferredName, hasSeenOnboarding, onboardingStage} / count(UserWhereInput)),
  `Entities.User`; `TaskCreateInput.isOnboardingSample`.
- `db/client.ts`: `createUserDelegate` + registration;
  `userWhereToSql` (id/plan/manualAccessGrant/AND/OR/NOT — exactly what
  `FOUNDER_MEMBERSHIP_WHERE` + the onboarding cores pass);
  task create persists `isOnboardingSample`.
- `db/types.ts`: `OnboardingStage` enum export.
- `db/seam.checks.ts`: three onboarding core locks.
- `package.json`: `./onboarding` subpath export.

## 5. Deferred / wiring notes

- **Checkout (S16):** the authed `/founding-100` CTA navigates to a dead
  `/checkout/founder?priceKey=founder` route after firing the CHECKOUT_STARTED
  funnel event. When billing composes, swap the marked branch for
  `createCheckoutSession({ priceKey: "founder" })` → `result.url`
  (`success_url` = `/founding-100/welcome`). The 409 at the public cap is
  S16's server guard to port with it.
- **Welcome email (S12's seam):** `completeOnboarding`'s `sendWelcomeEmail`
  dep is stubbed at the API call site (marked WIRING NOTE in
  `procedures/onboarding.ts`). When S12's email seam lands: recipient =
  session email identity, name = preferredName || firstName || "there",
  subject "Your first task is waiting", CTA `${appUrl}/do`, best-effort.
- **Analytics ingest fidelity:** minimal recorder (see §2); the full
  analytics slice owns attribution + session-reuse + funnel reads.
- **`onboarding.status` retirement:** S10's auth/me supersedes it (§1).
- **`onboardingStage` transitions in tasks/inbox ops:** NOT in this batch —
  they live in the S2/S3 surface's ops (sample-task completion ×2
  SAMPLE_TASK→CAPTURE; createInboxItem CAPTURE→TRIAGE; triageInboxItem
  TRIAGE→COMPLETE). P0 §3.4 is the checklist when those ops port; schema
  default COMPLETE already guarantees migrated users never see onboarding.
- **Guided CAPTURE/TRIAGE hints on What Now** (webapp NextPage prompts):
  long-tail per P0 §7, not gated on.
- **Concurrent-work note:** at delivery time `apps/web/src/lib/push.ts` (S12)
  holds the one svelte-check error and `apps/api/src/push.ts` (S12) needs a
  `PushSubscription` seam delegate — neither is this batch's file.

## 6. Verification evidence

- curl of `GET /founding-100/status`: exact JSON + Cache-Control + CORS
  allow/deny — see the delivery report (pasted from the live dev server).
- `apps/web/e2e/onboarding.spec.ts`: full-flow (gate → carousel → seeds →
  stage SAMPLE_TASK → sample task), skip path (COMPLETE, no sample task),
  gate scoping (public page reachable, anonymous CTA).

## 7. Cross-review corrections (post-delivery, same batch)

- **`ensureOnboardedCore` 23505 correction (live-reached):** a user lens can
  own a default's NAME while missing its seed flags (rename "Work" → "Deep
  Work", create your own "Work"); the flags lookup misses it and the create
  hit `Lens_userId_name_key`, 500-ing the whole bootstrap (webapp HEAD has
  the same hole; observed live on the dev fixture user). The core now adopts
  the row on the unique violation and carries on — pinned by a domain test.
- **Founding-100 math unit tests added** (`procedures/public.test.ts`): the
  s15 P0 §6-mandated boundaries (claimed 97/98/99/100, key order, saturation)
  + recorder validation pins (unknown name, visitor-id charset/cap, metadata
  allow-list + 120 cap, ONE_TIME_EVENTS dedup short-circuit).
- **Analytics ingest CORS** (see §2 table) — the delivery shipped the ingest
  with no CORS; ported the webapp analyticsMiddleware's origins/preflight.
- Gate scope adjudication (kept narrow): a fresh user (hasSeenOnboarding=false)
  deep-linking /do/settings, /do/today, /do/projects, /do/inbox renders sane
  empty states with zero console errors (probed live); the gate catches them
  on the app home ("/"), which is where login/signup both land. Post-V1
  migrated users have stage=COMPLETE by default, so the gate only fires for
  genuinely new users anyway.
