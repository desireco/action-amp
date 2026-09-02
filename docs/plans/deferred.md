# Deferred, skipped, and deliberately-not-ported

> One list of everything the platform-switch build skipped, deferred to a
> later slice, or deliberately did not port. Committed 2026-09-02 after the
> full review pass — this is the working list for "what's missing".
>
> Not on this list: anything that LANDED (see PLATFORM-SWITCH.md §Status).
> Webapp bugs we deliberately did NOT port have their own section.

## Deliberate deviations (webapp behavior improved — kept)

| Deviation | Why |
|---|---|
| Logbook read is lens-gated | Webapp's web `getLogbook` lacked `assertLensAllowed` (FREE could read Work-lens history by direct nav). Closed; CLI already gated. |
| Duplicate-name 409s actually fire | Webapp's `isUniqueViolation` missed postgres 23505 nested in `.cause` → every duplicate lens/goal rename was a live 500. Port checks the cause chain. |
| Lens soft cap ("a 9th lens") enforced | Webapp's guard short-circuited entitled users, so it could never 402. Port enforces the documented semantics. |
| `deleteGoal` does not touch `Resource` | Webapp's call would crash (`Resource.goalId` dropped in migration). Port re-parents projects/tasks only, pinned by test. |
| Onboarding bootstrap 500 fixed | A user lens renaming to a default's name crashed `ensureOnboarded` (23505). Port adopts the row instead. |
| Magic-login localhost code is fail-closed | `NODE_ENV=production` never gets the universal `111111` code, even misconfigured; missing Resend key fails closed (503). |
| Onboarding gate scope is the app home | Webapp bounced every `/do*`; port bounces `/` (and `/do`) only — deep links render sanely and self-heal on the next home visit. |
| `startTask` reads the real focus-minutes pref | Webapp's S4-era port stand-in hardcoded 25; now hydrates `User.focusSessionMinutes` (25\|45). |
| Welcome email + feedback admin email wired | Both were stubbed; now best-effort through the S12 email seam (prod-only for feedback, per webapp). |

## Deferred to a later slice / post-switch (with owner-era notes)

| Item | Where it stopped | To finish |
|---|---|---|
| Image attachments through triage/share fan-out | SW stashes + previews them; `create*` contract ops carry no attachment params | Extend contract + cores (S12 surface) |
| Attachment lightbox / thumbs on task detail | S1 deferred | With attachments above |
| Simple-list reorder ops (`reorderListItems`) | S1 deferred (checklist keyset fully covered) | Small core+op port |
| Task-detail inline re-file (property-chip re-file on detail page) | S5 simplified the detail row editor | UI work on the detail page |
| `submitFeedbackCore` admin-notification variants | Wired now (best-effort); template is an inlined HTML port, not react-email pixel-perfect | Polish only |
| Analytics attribution (utm/referrer on first-seen, `user_*` session reuse) | Minimal recorder keeps ONE_TIME_EVENTS dedup | Analytics slice |
| Signup analytics events (`SIGNUP_COMPLETED` + …) | S10 note | With analytics slice |
| `onboardingStage` transitions live in tasks/inbox ops | Capture→triage→complete ARE wired; sample-task stage transition pinned? verify | Small |
| Deploy-version banner + build-time `version.json` SHA | `{"version":"dev"}` placeholder | Build pipeline |
| Push-delivery e2e (real VAPID → browser notification) | Invariants unit-pinned; needs browser-grant harness | V1/V2 manual pass |
| Live hosted-checkout dry run (real Stripe page → webhook delivery) | Test-mode signed webhooks verified at the HTTP level | **V2 rehearsal, with Jake** |
| Funnel core lives in `src/admin/funnelCore.ts` | Move to `src/analytics/` someday (import churn, no behavior) | Cosmetic |
| `?item=` deep-link e2e (logbook) | Covered manually; no spec | Small spec add |
| Shortcut-cheatsheet overlay (the `?` key) | KeysFooter removed in the shell port; keyset parity lives in the palette | With shell polish |
| CommandPalette theme/lens-switch command targets | Palette entries render as lookups | Shell polish |
| What Now guided hints (onboarding-ish coach marks) | S1 deferred | Product work |
| AllowanceChip (FREE used-vs-cap display) | Enforced boundary is the 402 → ProGate panel | Cosmetic |
| `caretCoords.ts` documented `as any` | Deliberate | Only if the mention dropdown misbehaves |
| CLI `queryString` repeated-param nuance | Hono vs Express qs on hand-crafted URLs; unreachable from the CLIs | Never, probably |
| Newsletter | Not built in webapp either | Product work |
| V6 Neon pooled `DATABASE_URL` | Optional, post-switch | Separate project |

## Webapp-side (NOT ours to fix — webapp/ is the frozen rollback)

| Item | Note |
|---|---|
| 3 pre-existing `webapp` vitest failures on `main` | tasks pool/alternatives assertions + PasswordlessAuthPage heading — predate the switch; likely what `stash@{0}` (WIP on `fix/today-badge-lens-scoping`) was addressing. The stash holds 32 files of un-landed webapp WIP — review before dropping. |
| `docs/features/inbox-triage.md` describes Archive as a wizard type | Stale doc; the wizard removed it (server still supports archive). |
| Root AGENTS.md model list was stale | Fixed in this pass (`b502629` predecessor). |

## Known cosmetic debt (fine to ship)

- 6 `state_referenced_locally` svelte warnings in settings dialogs/forms — adjudicated intentional initial-capture.
- Share page: one alt-text a11y nit; some unused CSS selectors pruned already.
- TaskRow's 9px dot + a few off-token font sizes (cosmetic watchlist from S1 review).
- `_emphasis_` markdown not rendered in Logbook outcomes (documented subset); links inside code spans still linkify.
