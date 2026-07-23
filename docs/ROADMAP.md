# Roadmap

<!-- Discover owns this file. Build reads only. -->
<!-- Last reviewed: 2026-07-23 (Admin dashboard shipped: a stats-first page at /app/settings/admin with global user/task/feedback counts across today/7d/30d windows, an inline feedback-status triage list, and a shared getAdminStatsCore. Activity tracking added (User.createdAt + lastActiveAt, throttled-stamped on app load, backfilled). actionamp-admin CLI gained `stats` (text + --json) backed by /api/cli/admin/stats. A full feedback-triage system landed: Feedback model with shortId (XXXX-XXXX Crockford base32), prefix-match lookups, admin-only /api/cli/feedback/* routes, and the actionamp-admin feedback commands (list/show/status). Earlier 07-22: ActionAmp CLI terminal client shipped — 11 commands, OAuth browser login, --json for agents, pure *Core.ts files shared with the web app.) -->

---

## 0. The honest state of the project (read this first)

This is not a pre-launch product. It is a **soft-launched product with no
audience yet**. That distinction changes the whole roadmap.

**What's actually shipped and verified (updated 2026-07-23):**

- **Deployed to Railway**, live at `actionamp.com` + `api.actionamp.com` (both
  return HTTP 200). Postgres on Railway, Resend SMTP for auth email.
- **Installable PWA**: web manifest with `display: standalone`, maskable icons,
  and the correct MIME (renamed `manifest.webmanifest → manifest.json` after
  Hikari's static MIME table refused to serve the spec extension). Long-press
  app-icon shortcuts (Capture / Next / Today) work on Chromium Android.
- **Resilient mobile sessions**: httpOnly cookie session fallback with sliding
  30-day refresh alongside the existing localStorage token path. iOS/Brave
  PWA users no longer get logged out by WebKit ITP's 7-day cap or Brave's
  clear-on-exit.
- **Web Push daily Today reminder**: VAPID-keyed, per-device subscriptions,
  per-minute PgBoss job (sends at most once per user/calendar day at their
  chosen local time), Preferences UI for permission + time.
- **App version + update banner**: git SHA baked into the bundle at build time
  (Settings → About + login footer); restructured service worker + banner
  prompt users to refresh when a new build is deployed.
- **Admin dashboard**: a stats-first page at `/app/settings/admin` (admin-only
  tab, reuses SettingsLayout) showing global user/task/feedback counts across
  today / 7d / 30d windows, plus an inline recent-feedback list with status
  picker. Backed by a shared `getAdminStatsCore` (pure, tested). Activity
  tracking via `User.createdAt` + `lastActiveAt` (throttled-stamped on app
  load in `getAppData`, backfilled from `Auth`/`AuthIdentity`). The
  `actionamp-admin stats` CLI command (text + `--json`) reads from the same
  core via `/api/cli/admin/stats`.
- **Feedback triage system**: the in-app feedback button now feeds a real
  `Feedback` model with a human-addressable `shortId` (XXXX-XXXX, Crockford
  base32), prefix-match lookups (show/status accept a partial id), and
  `FeedbackStatus` (OPEN / IN_PROGRESS / RESOLVED / CLOSED). Admin-only
  `/api/cli/feedback/{list,show,status}` routes + the `actionamp-admin`
  feedback commands (list/show/status) for terminal triage.
- **Full core loop works end-to-end**: capture (`⌘K`) → inbox → triage →
  task/project → Next focus chooser → Today (capped at 5) → completion →
  Logbook. Every step has a real server operation and a route.
- **Live Stripe billing**: recurring (Pro $79.50/yr, $12.95/mo), prepaid ($90),
  and the capped **Founding 100** ($99 lifetime, 100 spots, server-enforced
  cap, live count on the landing page). Webhook is the source of truth; client
  never mutates `plan`.
- **The wedge is built**: `getTopTask` priority-first matcher, Now/Next state
  machine (`startedAt` persists across navigation), the Next single-task
  home screen, focus-mode overlay.
- **Test suite green**: 630 Vitest tests pass and `wasp compile` is clean.
  E2E coverage rebuilt around cross-layer invariants (capture, login, inbox,
  triage, projects, today, next, entitlements); run it before public-launch
  changes.
- **Polished landing page**, design-system page, onboarding, dark mode,
  keyboard-shortcut system, focus-switch nav (Work/Plan/Review expanding
  sections).

**The docs are better, but this roadmap still needs active grooming.**
`docs/features/` is the code-verified source of truth for what exists. This
file is the strategy queue; when it conflicts with the feature catalog, fix
this file rather than treating stale roadmap prose as implementation truth.

### The single most important fact

**ActionAmp is live, and almost nobody is using it.** The landing page carries
signup and Founding 100 CTAs; newsletter capture is intended but not built.
There is **no distribution, no analytics, and no evidence of a single external
user yet**. So the binding constraint on the business is **not engineering**.
It is **attention + measurement**. A roadmap that adds more features before
proving anyone wants the existing ones is malpractice.

---

## Vision

ActionAmp is a focus app that opens to **one task** — the next thing that
matters — not a list. Its thesis: overwhelm happens at the *decision* (what do
I do now?), not at capture. The product bet is already built and shipped. The
business bet — that people will pay ~$80/yr for that decision to be made for
them — is **completely unvalidated**.

The goal of this roadmap is to validate the business bet as cheaply as
possible, then earn the right to build the breadth of features the premium
price assumes.

---

## Priority order

> **Live queue:** [ActionAmp Duet — Roadmap view](https://github.com/users/desireco/projects/5)
> (grouped by Tier, sorted by Priority). The board is the authoritative index
> for what's Now / Next / Then / Icebox; the tier lists below are prose
> context — strategy, reasoning, dependencies — not the hand-maintained index.
> Drag a card to steer; run `scripts/duet-sync-pull.sh` to write the change
> back into the file. See `docs/specs/github-projects-sync.md`.

Top = next. Each name matches (or will match) `docs/specs/<feature>.md`.
Status reflects duet state. **Discover writes the next spec for each `draft`
item; Build pulls `next` (a human promotes `ready → next` to stage work for Build).**

### Now (the validation gauntlet — do these before anything new)

> Specs live at `docs/specs/<slug>.md`. `ready` = Build may pull; `draft` =
> Discover still owes product decisions. Statuses reflect roadmap state as of
> 2026-07-04 — see §Queue notes below for known stale/historical sections.

1. **doc-reconciliation** (`done` 2026-06-27) — canonical docs reconciled with
   shipped reality: Trash→Archive leftovers fixed in WORKFLOW/TRIAGE/DATA-MODEL;
   the fix branch's four structural reversals (Upcoming default, Today+Upcoming
   matcher pool, explicit triage lens step, lossless Archive) confirmed sound
   and code-verified; BACKLOG flipped to 26 done / 23 open; FEATURES.md flagged
   stale with pointers to canonical. → §Shipped.
2. **first-run-experience** (`done` 2026-06-27) — onboarding was dead code +
   taught gestures the webapp lacks; new users landed on empty Next. Fixed:
   onboarding routing, `hasSeenOnboarding` migration, magic-moment seed task.
   Verified: 195 unit + 37 e2e tests pass. → §Shipped.
3. **legal-pages-oauth** (`done` 2026-06-27) — `/privacy` + `/terms` were
   OAuth-incomplete and stale. Fixed: third-party disclosure (Google/Stripe/
   Resend), "Plans and billing," consent links at signup. **Open item:** confirm
   contact addresses are real before launch (§GTM prep B). → §Shipped.
4. **observability-minimal** (`ready`, gated by user-owned analytics account) — ship one privacy-respecting tracker +
   the 4 funnel events (land → signup → app-open → checkout). The one number
   that matters: visitor → checkout %.
5. **newsletter** (`draft`) — add the quiet hero/footer email capture the GTM
   prose already assumes, or remove the newsletter promise everywhere. Owned
   audience capture matters before community distribution.
6. **blog** (`ready`, new 2026-07-08) — the SEO-bound publication on the Astro
   marketing site (`/blog`, `/blog/[slug]`, RSS): markdown-authored posts on
   ADHD/focus/GTD/decision-overwhelm intent. The owned **discovery** channel
   (where `newsletter` is the capture channel) — how strangers arrive via
   search on a surface the repo owns. Builds on the shipped Astro split
   (`infra-astro-marketing-split`, `done`): pure static SSG, content
   collection + RSS, zero Wasp/DB coupling. Unparks the Tier-4 `/blog` three
   docs park (`PUBLIC-PAGES.md` §4, `MARKETING.md` §1, this file's §GTM) now
   that the foundation is paid for. **Design locked (2026-07-08): two-lane
   index (Finds | Essays) + rotating featured zone** (Pattern A Spotlight /
   Pattern B Split, build-time); four categories Focus · Method · Attention ·
   Build; shareability split into `blog-social-meta`. Prototype at
   `docs/mockups/blog-directions.html`. Spec at `docs/specs/blog.md`.
7. **blog-social-meta** (`ready`, new 2026-07-08) — the shareability half of
   the blog: OG images (default + per-post override), `summary_large_image`
   Twitter cards, LinkedIn rich-preview `article:*` tags, and a calm
   share-row (Copy link + X + LinkedIn, no third-party widget). Split from
   `blog` because shareability is a per-post-asset + platform-contract
   problem (OG images are a content task), not a layout problem. Fills the
   schema slots `blog` reserves. The two compose; they don't block each other.
   Spec at `docs/specs/blog-social-meta.md`.
8. **social-auth-google** (`done` 2026-06-27, code-side) — Google OAuth added
   alongside email; config verified, never-throws name resolution. **Non-code
   gate outstanding (your side):** create the Google Cloud OAuth client +
   register redirect URIs + add a test user — see §GTM prep B. The callback
   verifies once the client exists. → §Shipped.
9. **distribution-quietlaunch** — (no spec; it's a campaign, not a build item)
   get the existing product in front of ~500 of the right people in 4 weeks.
10. **in-app-feedback** (`done` 2026-06-30) — shell loudspeaker opens a simple
   feedback modal. Feedback is stored with user, route, Work/Plan/Review
   section, lens context, and user agent; production sends an admin email to
   `ACTIONAMP_ADMIN_EMAIL` (default `zeljko@dakic.com`) after the DB write. Dev
   stores only. → §Shipped.

### Next (only after the gauntlet produces a signal)

1. **retention-criticalpath** (`ready`) — instrument the first-7-days funnel
   (`lastSeenAt` + 3 activation events: seed-completed, first-capture,
   first-triage) and close the known dead-ends (onboarding→seed disconnect,
   post-completion dead-end, empty-Inbox affordance). Depends on
   `observability-minimal`. The data-gated fixes (re-engagement email, etc.)
   are explicitly deferred to wait on the numbers.
2. **focus-why-transparent** (`done` 2026-06-27) — the "why this?" line under
   Next now states the *actual* ranking reason, never fabricating. The
   "never lies" invariant verified across all input combinations; rendering
   blocker caught + fixed. Prerequisite for focus-engine-v2 (which extends
   this line to explain moment-fit). → §Shipped.
3. **focus-engine-v2** (`draft`, **gated on the matcher test + 3 definition
   gaps**) — the moment-aware matcher: time-available + energy refinement *on
   top of* the existing priority sort (FEATURES.md F10's planned layer). The
   matcher re-ranks within a priority tier only — never demotes priority.
   Pro-gated. **Flipped `ready → draft` 2026-07-03 (review):** the matcher-test
   gate still holds (`docs/specs/matcher-validation.md` — run it first), plus
   three definition gaps — (A) depends on a `tag-management` UI that doesn't
   exist (the matcher reads energy/time tags users can't set); (B) the moment
   bar is under-designed for the wedge surface (needs a locked mockup); (C) the
   fallback-invariant test claim was incorrect. Details in the spec; the
   matcher-test run resolves the gate while Discover closes the gaps.
4. **command-palette-search** (`ready`) — command palette + full-text search across **all**
    tasks (open + done). The two Pro-tier features most likely to justify the
    price to an existing user. Depends on entitlement-enforcement.
5. **triage-classify-step** (`in-progress`, core flow implemented 2026-07-04)
   — replace the separate Context + Type triage steps with **Classify**
   (`Classify → Spec → Complete`). Concrete Project resolution shows
   `Destination: Project · Lens` and skips the standalone lens selection by
   default, while `[[lens]]` still preselects a visible, reversible Lens choice.
   Remaining polish: full `/` Lens picker and cross-lens Project change from
   Spec. Spec at
   `docs/specs/done/triage-classify-step.md`.

### Then (earn-the-revenue work — gated on ≥1 paying non-founder user)

1. **breadcrumb-nav** (`ready`, small — model locked 2026-07-03) — the
    `Breadcrumb` component works (crumbs are `<button>`s) but is wired only
    into the design-system demo, not the Project/Goal detail pages (both use a
    `← Back` Link). Per BACKLOG.md's BUILD REQUIREMENT (2026-06-16), clicking
    an ancestor crumb should re-anchor the view at that scope. **Spec at
    `docs/specs/breadcrumb-nav.md` — `ready` (route model locked: crumbs
    navigate to the ancestor's existing route, uniform with the app, no new
    view-state layer).** Includes the goal-card hover-implies-clickable nit.
2. **resources-project-owned** (`ready`, confirmed 2026-07-03) — make the
    existing-but-invisible `Resource` entity real: project-owned links+notes,
    surfaced on the Project detail page (add/edit/delete), with tasks
    referencing their project's resources and a **delete-with-impact** flow
    that shows which tasks depend on a resource before you remove it. Closes
    the gap `PAGES.md` already promises; lands the PARA "reference material"
    leg of the structure-depth differentiator (§"The threat the docs
    under-price"). **Two structural questions resolved 2026-07-03:** (A) the
    Task↔Resource link is an **explicit `TaskResource` join** (DB-enforces the
    same-project invariant, not an app-layer guard); (B) reconciles with
    `cli-comments-resources` (this spec is the source of truth for Resource's
    shape). Spec at `docs/specs/resources-project-owned.md`. Gated on items
    7–11 like the rest of this tier.
3. **task-fields** (`ready`, new 2026-07-04) — the task enhancement pair:
    **Context** (optional markdown, reuses `Task.content`; what you need *to
    do* the task — background, links, pointers to project-level Resources) and
    **Outcome** (optional markdown, new `Task.outcome` column; what *happened*,
    captured at completion for Review/Logbook). Both render via
    `react-markdown` + `remark-gfm`; both invisible when empty; NextCard stays
    title-only. **Reverses** `resources-project-owned` on the Task↔Resource
    link: markdown links in Context, no `TaskResource` join (see
    §Resource linking in the spec). No migration for Context; one nullable
    column for Outcome. Spec at `docs/specs/task-fields.md`.
4. **public-launch-readiness** (`draft` — needs spec) — Product Hunt, the launch
    marketing pack, the real pricing page. Only worth doing once items 7–11
    prove someone stays and pays.
4. **cli** (`effort split into 3 specs 2026-07-03`, **developer surface — not
    validation-critical**) — a top-level `cli/` package (typed library + thin
    binary) that talks to the HTTP API via **Personal Access Tokens** added to
    the backend, plus four paired orchestration skills (inbox-triage,
    goal-breakdown, today-balancer, task-research) that shell out to
    `actionamp <cmd> --json`. Headline command is `actionamp now`. **Honest
    framing:** this is a power-user / developer surface, not part of the
    validation gauntlet (§"Now") — the roadmap's own thesis is that adding
    surfaces before proving anyone wants the existing
    product is malpractice. So the effort is `ready` for Build to pull
    **opportunistically** (a self-contained, well-scoped piece of work; or when
    the skills need a machine interface), not a jump-the-queue item. Ships only
    what the backend already exposes; missing writes filed as
    `cli-write-ops.md` (`deferred`) + `cli-comments-resources.md` (`deferred`,
    unblocks the `task-research` skill). **Split into three specs 2026-07-03:**
    `cli-pat-plumbing` (`ready`, the natural first pull), `cli-package`
    (`draft` — op-refactor scope unscoped), `cli-skills` (`draft` — depends on
    cli-package). Umbrella + cross-cutting decisions: `docs/specs/cli.md`.
   **Phase 0 + Phase 1 shipped 2026-07-22** — see §Shipped. `cli-pat-plumbing`
   (PAT auth + OAuth browser login + `/cli/login` page) and `cli-package`
   (full 11-command surface: login/now/capture/whoami/task/today/inbox/
   project/goal/logbook/logout + `llm` agent reference, all with `--json`,
   55 tests, op-refactor extracting pure cores shared between web ops + CLI
   routes) are in Review. Only `cli-skills` (Phase 2 — the four orchestration
   skills) remains `draft`.
5. **goal-planning** (`done` 2026-07-05, was `ready`) — **shipped**: full
   Goal/Project lifecycle (complete, reopen, edit, delete, re-link) + explicit
   `Project.order` sequencing under a Goal + Logbook surfacing of completed
   goals + Reopen affordance + e2e (full sequence → complete → logbook →
   reopen). Server ops, UI, and tests all landed. → §Shipped. Spec at
   `docs/specs/done/goal-planning.md`; catalog at `docs/features/goal-planning.md`.
6. **work-area-merged** (`draft`) — collapses `/app` + `/app/today` into one
    Lens-scoped page (hero + Today | Done columns), and reshapes how a task is
    worked: **no completion circle anywhere** (complete only from focus mode —
    the list becomes a chooser, not a tick-box), a **timestamped activity log**
    per task (`Started / Paused / Completed / Not doing` interleaved with user
    notes, via a `kind` enum on `TaskUpdate`, which is surfaced nowhere today),
    and **`NOT_DOING` → lossless archive** (a decision recorded in history
    instead of silent delete). Reverses WORKFLOW.md §5.4 "two surfaces" → one.
    This is a **surfaces-and-logging refactor, not selection logic** — the
    `getTopTask` matcher is untouched, so it's independent of `focus-engine-v2`.
    Honest framing: it's product-quality polish on the wedge surface itself,
    so it sits in this tier (post-gauntlet), not the validation gauntlet.
    Interactive prototype at `docs/mockups/today-merged.html`. Spec at
    `docs/specs/work-area-merged.md`.
6. **weekly-monthly-review** (`draft`, spec written) — the Review area is
    WORKFLOW.md §2.5's "least-built area, net-new work": today it's just the
    Logbook (a flat list grouped by day). Adds `/app/review/weekly` +
    `/app/review/monthly` — period debriefs that group the window's completed
    tasks/projects **by Goal/Project** (not by day), show a **progress delta**
    vs. the prior period reusing `getGoals`' rollup math, and surface
    **stuck/aging** items (overdue, interrupted-Now >7d, never-Today >30d) —
    all inspectable today, surfaced nowhere. Split: **v1 range review**
    (completions + stuck, buildable on the current schema) and **v2 activity
    review** (timeline progress), **gated on `work-area-merged`'s `kind` enum
    on `TaskUpdate`** — the Started/Paused/Completed events don't exist yet.
    Entitlement lean: **Pro-only** (sidesteps the half-enforced 30-day Logbook
    cap in PRICING.md §4, fits the tier). Calm by rule: trends yes,
    streaks/guilt-trip red dots never (PRODUCT.md bans them). Spec at
    `docs/specs/weekly-monthly-review.md` — `ready` needs the entitlement call
    confirmed + a `docs/mockups/review-week.html` throwaway.

## Queue notes

**Open actions on main:**

1. The validation queue is **observability-minimal → newsletter →
   retention-criticalpath → distribution-quietlaunch**. Observability is gated
   by the user-owned analytics-provider setup.
2. The product-depth queue after validation signal is **command-palette-search
   → tag-management → matcher-validation → focus-engine-v2**. Focus-engine-v2
   stays draft until the tag UI, matcher test, and moment-bar design are closed.
3. Opportunistic small ready work: **breadcrumb-nav**. Useful depth work once
   there is signal: **goal-planning**, then **resources-project-owned**.
4. Developer-surface work (**cli-pat-plumbing**, then `cli-package` /
   `cli-skills`) remains explicitly opportunistic, not validation-critical.
5. **Tooling:** **github-projects-sync** (`ready`, P2, realigned 2026-07-07) —
   a GitHub Projects board (org `desireco`) as the **management surface** for
   the Duet queue: Projects owns lifecycle (drag a card → it commits to the
   file via a `projects_v2_item` Action), markdown owns prose. Matches the duet
   upstream's locked source-of-truth split. Independent of the validation
   gauntlet; pull when the flat markdown queue starts losing signal (it already
   is — ~25 live units). Gates on a one-time `gh auth refresh -s read:project
   project` + consuming the upstream write-back Action.

## Shipped

<!-- Moved here when a spec's status flips to done. Populate as Build ships + Discover signs off. -->

- **admin-dashboard** (`shipped` 2026-07-22) — first in-app admin surface. A
  stats-first page at `/app/settings/admin` (admin-only tab in SettingsLayout)
  showing global counts across today / 7d / 30d windows: users (total, signed
  up, active), tasks (created, completed, total), feedback (by status, total).
  An inline recent-feedback list with a status picker lets the admin triage
  without leaving the page. Backed by `getAdminStatsCore` + `getRecentFeedbackCore`
  (pure, tested) shared between the Wasp query and `/api/cli/admin/stats` +
  `/api/cli/admin/feedback` PAT routes. Activity tracking added:
  `User.createdAt` + `User.lastActiveAt` (throttled-stamped on app load in
  `getAppData`, backfilled from `Auth`/`AuthIdentity` for existing users).
  The `actionamp-admin stats` command (text + `--json`) reads the same core.
  Spec: `docs/superpowers/specs/2026-07-22-admin-dashboard-design.md`.
- **feedback-triage** (`shipped` 2026-07-22) — the in-app feedback button
  (the shell feedback widget) now feeds a real `Feedback` model with:
  `FeedbackStatus` enum (OPEN / IN_PROGRESS / RESOLVED / CLOSED), a
  human-addressable `shortId` (XXXX-XXXX, Crockford base32, generated + unique
  at insert), prefix-match lookups (`show`/`status` accept a partial id or
  shortId), and `updatedAt` (backfilled from `createdAt`, kept current via
  `@updatedAt`). Admin-only `/api/cli/feedback/{list,show,status}` routes +
  the `actionamp-admin` feedback commands (list/show/status) for terminal
  triage. Pure `operationsCore.ts` (submit/list/show/updateStatus) shared
  between the Wasp ops, the PAT routes, and the admin CLI — zero duplicated
  logic. Tests cover all four cores.
- **cli (Phase 0 + Phase 1)** (`review` 2026-07-22) — the ActionAmp terminal
  client. A standalone `cli/` package (commander + chalk, ESM, TypeScript)
  that talks to the webapp's `/api/cli/*` routes via PAT auth. **Phase 0
  (`cli-pat-plumbing`):** `ApiKey` model + SHA-256 hashed tokens, OAuth browser
  login flow (the `gh auth login` pattern — CLI opens browser, user confirms,
  token comes back via localhost callback), `/cli/login` consent page, Settings
  → Access tokens management UI, Bearer PAT middleware, `/api/cli/now` stub.
  Entitlement-enforced (FREE users can't read Pro-gated lenses via the CLI).
  **Phase 1 (`cli-package`):** full 11-command surface — login, now, capture,
  whoami, task (show/start/pause/done/snooze/move), today (--done), inbox
  (list/triage), project (list/show/create/add-task), goal (list/show/create),
  logbook, logout, plus `actionamp llm` (prints agent/LLM instructions). Every
  command supports `--json`. 55 CLI tests + the op-refactor (pure `*Core.ts`
  files shared between Wasp ops and CLI routes — zero duplicated logic). The
  throwaway prototype was replaced by the real package. Only `cli-skills`
  (Phase 2 — orchestration skills) remains draft. Specs: `docs/specs/cli.md`
  (umbrella), `cli-pat-plumbing.md`, `cli-package.md`, `cli-skills.md`.
- **pwa-installable + session-resilience + web-push + version-banner**
  (`shipped` 2026-07-21) — four small trunks landing together because they
  share the same mobile-PWA failure surface. **(1) Installable PWA**: web
  manifest with `display: standalone`, maskable icons rendered from the
  existing `favicon.svg`, apple-mobile-web-app-capable metas. Chrome Android
  now builds a true WebAPK and surfaces the Capture / Next / Today long-press
  shortcuts. **(2) Session cookie fallback**: the session ID lived only in
  `localStorage`, which WebKit's ITP caps at 7 days and Brave's clear-on-exit
  wipes on app close — the daily-logout bug. Added an httpOnly cookie
  (`sameSite=lax`, sliding 30-day refresh) alongside the existing token path;
  if either survives, the user stays logged in. **(3) Web Push daily Today
  reminder**: VAPID-keyed, per-device `PushSubscription` rows, a per-minute
  PgBoss job that fires at most once per user/calendar day at their chosen
  local time, Preferences UI for permission + time. **(4) Manifest MIME fix
  + version display + update banner**: manifest renamed `.webmanifest → .json`
  after discovering Hikari's static MIME table doesn't know the spec extension
  (and that the file is served from the *client* service, so server-side
  middleware can't fix it). App version (git SHA) injected at build time via
  Vite `define` and surfaced in Settings → About + the login footer. Service
  worker restructured (dropped unconditional `skipWaiting`, added a gated
  `SKIP_WAITING` message handler) so a new deployment prompts the user to
  refresh via a calm teal banner. Closes the "Native mobile / PWA install"
  Icebox line (F23/F25).
- **mobile-dock + task-row-action-drawer** (`shipped` ~2026-07-15) — the
  mobile bottom dock reorganized around a Do-first affordance with Today
  folded in (Next was demoted — the focus chooser lives at the top of /app,
  not the dock). Task rows now open an action drawer on tap instead of
  navigating, keeping the user in context. Project mobile rows streamlined.
  Logbook row spacing tightened and title/outcome reflowed inline.
- **e2e-suite-rebuild + dev-worktree-tooling** (`shipped` ~2026-07-15) — the
  Playwright suite was trimmed from 60 tests to 18 cross-layer invariants
  (capture, login, inbox, triage, projects, today, next, entitlements),
  repairing it against the refactored triage/planning UI and fixing an
  entitlements race. Added a general-purpose dev-worktree creator
  (`webapp/scripts/dev-worktree.sh`) for parallel feature development, with
  teardown + sync helpers run from inside the worktree. See
  `docs/DEV-WORKTREES.md`.
- **deps + email-transport-resilience** (`shipped` ~2026-07-16) — nodemailer
  bumped 6→7→9 with a transitive-vuln audit fix, unused `@react-email/ui`
  dropped. Billing server no longer crashes on boot when
  `STRIPE_SECRET_KEY` is absent (dev/local-dev guard). Semver-safe package
  bumps across the webapp.
- **founding-100-price-correction** (`shipped` 2026-07-20) — Founding 100 was
  advertised as $139 in several marketing + doc surfaces; corrected to $99
  everywhere to match the live Stripe checkout price.
- **public-footer-baseline + legal-link-routing** (`shipped` ~2026-07-18) —
  public page footer went full-bleed (outer bg/border, inner max-width
  wrapper), and in-app public legal/about links repointed to the marketing
  apex (`actionamp.com`) instead of the app origin.

- **doc-reconciliation** (`done` 2026-06-27) — canonical docs reconciled with
  shipped reality after the branch consolidation. Fixed Trash→Archive
  contradictions in WORKFLOW/TRIAGE/DATA-MODEL; confirmed the merged fix
  branch's four structural reversals are sound and code-matched; BACKLOG
  flipped to 26 done / 23 open; FEATURES.md F6/F10 flagged stale with pointers
  to the canonical docs.
- **first-run-experience** (`done` 2026-06-27) — onboarding routing +
  `hasSeenOnboarding` migration + magic-moment seed task. Verified: done-
  conditions checked against code, 195 unit tests + 37 e2e tests pass. Review
  writeup at `docs/reviews/first-run-experience.md`.
- **legal-pages-oauth** (`done` 2026-06-27) — OAuth-ready privacy/terms
  (Google/Stripe/Resend disclosure, "Free at launch"→"Plans and billing") +
  consent links at the signup form. The data-retention overclaim was caught and
  fixed. **Open item carried forward:** contact addresses
  (`privacy@`/`legal@actionamp.com`) must be confirmed real/monitored before
  launch — see §GTM prep B. Review writeup at `docs/reviews/legal-pages-oauth.md`.
- **social-auth-google** (`done` 2026-06-27, code-side) — Google OAuth added
  alongside email; Wasp 0.24 config verified, the Google `userSignupFields`
  never throws (name→email-localpart→`"there"`). Review blocker (false
  null/loading story on the button) caught + fixed. **Open items carried
  forward (non-code, your side):** create the Google Cloud OAuth client +
  register dev/prod redirect URIs + add a test user — see §GTM prep B. The
  actual callback can't be verified until the client exists. Review writeup at
  `docs/reviews/social-auth-google.md`.
- **focus-why-transparent** (`done` 2026-06-27) — the "why this?" line under
  Next is now composed from `getTopTask`'s actual ranking factors, never
  fabricating a reason. The "never lies" invariant verified across all input
  combinations; the rendering blocker (NORMAL-priority line dropped) caught +
  fixed. +15 tests (14 helper + 1 card regression guard). Review writeup at
  `docs/reviews/focus-why-transparent.md`.
- **friction-cleanup** (`done` 2026-07-02) — closed the small honest gaps:
  Someday promote-to-Today, Today "Done today" section (`getDoneToday`), Goal
  detail view (`/app/goals/:id` + `getGoal`, progress math matched to
  `getGoals`'s rollup after a review-blocker fix). 210 unit tests + 42/42 e2e
  (serially). **Two done-conditions settled at sign-off:** `/app/upcoming`
  removal dropped per user instruction; breadcrumb nav spun out as its own
  backlog item (`breadcrumb-nav`) — interaction-design decision, not cleanup.
  Review writeup at `docs/reviews/friction-cleanup.md`.
- **entitlement-enforcement** (`done` 2026-07-03) — the free-tier caps in
  PRICING.md §4 are now enforced server-side (the billing boundary) + surfaced
  as calm "Pro feature" paywall moments client-side. Guards on `createProject`,
  `createGoal`, the triage project path, and all lens-scoped reads
  (`getTasks`/`getProjects`/`getGoals`/`getTopTask`/`getDoneToday`). Work lens is
  visible-but-locked for FREE (client gate + server 402). Default lens flipped
  `Work → Me`. Shared `<ProGate>` component established for future gates. Uses
  `isPlanActive` (expired PRO → FREE). 285 unit tests + 45/45 e2e (serially,
  incl. 3 new entitlement cases). Review writeup at
  `docs/reviews/entitlement-enforcement.md`. **Unblocks** an accurate privacy
  policy (legal-pages-oauth hedged its data-retention clause on this).
- **capture-grammar** (`shipped` 2026-07-04) — grammar v2 is live for the
  `⌘K` capture path: first `#` is a project hint, later `#` tokens are tags,
  `@` is time only, and `[[lens]]` is the explicit cross-lens override.
  Inline project autocomplete and the triage resolver now share the same
  persisted `parsedProject` hint. + project resolver tests for punctuation
  names (`C++`, `Q4/OKR`).
- **goal-planning** (`shipped` 2026-07-05) — the Planning area became mutable:
  complete / reopen / edit / delete / re-link for Goals and Projects, an
  explicit `Project.order` sequence under each Goal (with "the next project
  toward this goal" surfaced), completed Goals surfaced in the Logbook, and a
  Reopen affordance. Server ops + UI + e2e (full lifecycle sequence) all
  landed. Independent of `focus-engine-v2` — pure Planning-area work, no
  matcher impact.
- **focus-redesign (Variant F)** (`shipped` 2026-07-05) — the focus screen
  rebuilt around a two-number margin clock (live session + honest total), a
  summoned composer, and confirm-on-complete. Focus segments are now accounted
  through a `TaskSession` model; a dedicated `/app/focus/:taskId` route
  replaced the overlay-style invocation. Spec locked to Variant F at
  `docs/specs/`.
- **task-page-full-field-editing** (`shipped` 2026-07-05) — task permalinks
  (`/app/tasks/:id`) + chip-popover editing for every task field, sharing a
  single `PropertyChips` editor across triage and the task page. Completed
  task detail became feedback-only.
- **task-notes-completion-log** (`shipped` 2026-07-05) — tasks gained a notes
  thread + timestamped completion log via a `TaskUpdate.kind` discriminator
  (NOTE | COMPLETED). Notes are captured in triage, editable from task rows,
  and rendered as a thread + composer in Focus mode. Unblocks the v2 activity
  review in `weekly-monthly-review`.
- **lists-upcoming-top-level** (`shipped` 2026-07-05) — Upcoming promoted to a
  top-level Plan nav item as a single surface; the Today bench was dropped and
  cross-links added. Today/Upcoming got a polish pass.
- **design-token-migration** (`shipped` 2026-07-05) — type scale + semantic
  aliases added; `font-size`, `line-height`, and `font-weight 400` migrated to
  tokens across `components/ui/`, `app/`, feature pages, and lenses.
  Consolidated `focus-ring` / `empty-mark` / `lens-halo`. No visual regression.
- **Feature catalog (`docs/features/`)** — stood up 2026-07-03. The
  code-verified inventory of what exists (one file per feature, 1:1 with specs);
  supersedes `FEATURES.md` on "does it exist / what does it do." `AGENTS.md`
  routing + a `docs/features/README.md` index added. `docs/SUCCESS.md` (the
  thesis as testable bets) added alongside. **Three doc/reality conflicts the
  catalog caught — open decisions, not roadmap state:**
  1. **Newsletter capture is absent.** PRODUCT.md + ROADMAP §GTM both call it
     "live" (footer + hero); only signup + Founding-100 CTAs exist. → Build it,
     or fix the prose.
  2. **Google OAuth is config-disabled.** Code present, spec marked
     `done (code-side)`, but the provider block is commented in `main.wasp.ts`
     and `GoogleButton` returns `null`. → Flip on after the Google Cloud client
     exists (backlog `gtm-google-oauth`), or mark the spec `partial`.
  3. **`FEATURES.md` is self-flagged stale** (F6 triage keymap, F10 candidate
     pool, structural framing). Catalog now wins for existence questions;
     FEATURES.md stays as historical feature-level reference only.

(The core loop, billing, and deploy are shipped but were never tracked as duet
specs — they predate the protocol.)

## Icebox

- Native mobile / PWA install (F23/F25) — **partially unparked 2026-07-21**:
  installable web manifest, maskable icons, sliding session cookie, and Web
  Push daily reminder shipped. True native shells (iOS App Store, Android
  Play) remain a post-PMF problem; web-first is still correct.
- AI-tuned focus suggestions ("learn from what you pick/skip"). Explicitly
  Phase 2 in FEATURES.md; keep it there until the transparent matcher earns trust.
- Email-in capture (F5), bulk clarify (F7), Pomodoro timer (F14).
- Hard focus mode (each mode as a distinct full-screen layout) — the north star
  in WORKFLOW.md §5.6; soft focus ships and proves the model first.
- Lifetime tier beyond Founding 100 (Model B). Parked per PRICING.md unless
  churn data demands it.
- Multi-device sync beyond web.

---

## Evidence (why this order — the adversarial case)

### The market (real numbers, 2026-06)

- **ADHD apps market: ~$2.0–2.8B in 2026, ~12–15% CAGR through 2035.**
  ADHD-specific apps convert free→paid at **8–12%**, vs **2–4%** for general
  consumer apps. This is a real, paying niche — the WTP exists.
  (Market Reports World; Business Research Insights; DataIntelo.)
- **The broader productivity-apps market is ~$14.5B (2026) → ~$30.9B (2034).**
  The category is not shrinking. (Fortune Business Insights.)

### The threat the docs under-price

**"Single-task focus" is no longer a novel wedge — it is a crowded category.**
The 2026 ADHD/focus roundups list, against ActionAmp's exact thesis:

- **Llama Life** — single-task, ADHD-friendly, freemium, established.
- **Forget (forget.work)** — positions itself *as* the ADHD single-task app.
- **Tiimo**, **Bento Focus**, **yoodoo**, **"The One: Minimalist Focus"** —
  all "show one task, hide the rest."
- **Taskmaster** — single-task, **100% free, no subscription.**
- **Things 3** ($50 once) and **Sunsama** ($20/mo) bracket the price range.

The ActionAmp docs speak as if "the list is demoted" is a unique position. In
2026 it is table stakes for this segment. **The differentiator cannot be
"we show one task." It must be one of: the transparent matcher (why this,
not that), the GTD+PARA depth (structure at scale), or the calm/honest brand
register.** That's why `focus-engine-v2` and the brand work rank above new
surfaces.

### The pricing read

$79.50/yr is, per PRICING.md's own honest assessment, "the loneliest spot in
the category" — above Things-once, 2.2× Todoist, matched only by the heavier
Sunsama. With zero reputation and zero audience, **the price is not the
problem and it is not the solution — the missing audience is.** Do not move
the price until 500+ of the right people have seen the product and the
conversion number is known. Founding 100 ($99 lifetime) is the right
patron-on-ramp and is already live; lean on it, don't discount the ladder.

---

## Free-tier audit (current read, 2026-07-04)

> Question: what are the limits for free users, and do they have a good
> experience? Two audits: **(A) are the intended caps enforced?** and
> **(B) does a free user reach the product's value before bouncing?**

### A. Entitlement enforcement — substantially fixed

`entitlement-enforcement` shipped 2026-07-03. The Free → Pro boundary now
exists server-side for the surfaces that matter most to conversion: Work lens
access, project/goal caps, lens-scoped reads, and custom lens configuration.
That means distribution no longer points strangers at an unlimited product with
no upgrade trigger.

Known remaining entitlement questions are product-scope, not launch blockers:

| Limit / gate | Current read |
|---|---|
| Logbook ≤ 30 days | Still not enforced; defer until Review/logbook becomes a paid surface. |
| Multi-device: 1 device | No device model exists; not worth building before usage signal. |
| Command palette / search | Feature missing; spec is ready and should be Pro-gated when built. |
| Energy/time matcher tags | Feature missing; gated behind tag-management + focus-engine-v2. |

### B. Free-user experience — improved, still unmeasured

The worst front-door problems were fixed by `first-run-experience`: onboarding
routes correctly, no longer teaches non-existent mobile gestures, and gives new
users a seed task so they can feel the Next loop without doing setup homework.
That does not prove activation works. It only removes obvious self-inflicted
friction.

The current unknowns are exactly what `observability-minimal` and
`retention-criticalpath` must answer:

- Do visitors sign up?
- Do signups reach the app?
- Do new users complete the seed task?
- Do they create a real capture?
- Do they triage it?
- Do they return on day 1 / day 7?

### The verdict on "good experience"

The free tier now has a real upgrade boundary and a less hostile first run.
The remaining risk is empirical: we do not yet know whether strangers reach the
magic moment or come back. Do not add broad product surface area to answer that.
Measure it, then fix the largest leak.

---

## GTM strategy (the campaign, not the feature list)

Aligned to the `go-to-market-strategy` skill's motion selection: **PLG** is
correct (ACV < $5K, self-serve possible, technical-ish buyer). The motion is
not in question; **the missing prerequisite is audience.** So the launch is
sequenced as audience-first.

### Motion: Product-Led Growth (self-serve, free → paid)

- **Free tier** is the wedge (Next, full focus loop, personal scope). It
  exists, and the main entitlement boundary is now enforced. The next leak to
  find is not theoretical; it is funnel data: do visitors sign up, activate,
  and return?
- **Channels (ORB):**
  - **Owned (build first):** newsletter capture is intended but not shipped.
    Add the quiet hero/footer form before community distribution, then grow it.
    Blog/SEO surface for ADHD+focus+GTD intent: spec'd (`docs/specs/blog.md`,
    `ready`, 2026-07-08) — unparked from the Tier-4 "deferred" note now that
    the Astro marketing split shipped the foundation. Newsletter is the
    capture channel; the blog is the discovery channel.
  - **Rented (drive to owned):** r/ADHD, r/productivity, r/gtd (carefully —
    these ban self-promo; lead with value, not links); ADHD/focus Twitter &
    TikTok where Llama Life/Tiimo already play.
  - **Borrowed:** guest posts / podcast spots in the ADHD-creator space.

### Phased launch (realistic for one solo maker, no team, no budget)

| Phase | Goal | Trigger to advance |
|---|---|---|
| **0 — Quiet (now)** | Add analytics, add newsletter capture, finish non-code launch setup. | Analytics live; newsletter live; Google/Stripe/contact/email gates clear. |
| **1 — Friends & alpha (wks 1–2)** | Get 20–50 humans you can talk to, by direct ask. Founding 100 as the patron ask. | ≥20 external signups; ≥3 used Next on day 3. |
| **2 — Community (wks 3–6)** | Quiet distribution: put it in front of ~500 of the right people via communities + a small owned list. | ≥500 unique visitors; known visitor→signup rate. |
| **3 — Paid open (wk ~8)** | Only if Phase 2 shows the funnel isn't broken: pricing page live, Product Hunt launch, the launch-marketing-pack from the GTM skill. | Known signup→paid rate ≥ 3%; or a clear reshape signal. |

**The rule:** no phase advances until its trigger is met. If Phase 2 shows a
broken funnel (e.g. 500 visitors, 2 signups), the answer is never "launch
harder" — it's go fix retention (item 5) or the matcher (item 6).

### The one number to define before anything else

> **Of unique landing-page visitors, what % reach the checkout page?**

Today this is unmeasurable (no analytics). Until it's measurable, every GTM
decision is a guess. This is why `observability-minimal` stays at the front of
the queue.

## Open strategic questions (for Discover to resolve, not Build)

1. **Is the wedge defensible in 2026?** — **ANSWERED 2026-06-27 (roast, RESHAPE).**
   "Show one task" is a crowded category (Llama Life/Tiimo/Bento/One Thing/
   Forget), none proven at $80/yr. The wedge is *demand-voiced* (ADHD users
   ask "which of the 97 things do I prioritize NOW?" — that's the pitch,
   unprompted) but **not yet defensible**, because the only real moat — the
   matcher — is the weakest shipped part (an honest priority sort). Verdict:
   keep the thesis + structure depth; **the matcher (`focus-engine-v2` +
   `focus-why-transparent`) must ship and *surprise* before the $79.50 price
   is coherent.** Full reasoning + the zero-cost 48-hour manual-matcher test
   that validates the core assumption: `docs/research/wedge-defensibility-
   roast-2026-06-27.md`.
2. **Audience or product first?** This roadmap bets **product-cleanup +
   audience** in parallel (items 1–6), new features after. The alternative
   (ship more features, then seek audience) is the classic indie death spiral.
   Push back hard if you think a specific feature is the unlock.
3. **The landing-page CTA.** **Resolved in principle, incomplete in code** —
   signup + Founding 100 are live; newsletter capture is intended but missing.
   The principle that governs them is **fairness**, not "no nudge ever" — see
   PRODUCT.md §"Fair to users" (revised). Signup, paid-plan push, newsletter,
   and the honest Founding 100 cap are all in-bounds; deception, trapping, and
   guilt-tripping are out.
4. **$80 anchor, eyes-open.** PRICING.md already flags this as the loneliest
   spot. Keep it — but the data prerequisite (item 3) is what lets us move it
   without guessing.

---

## GTM prep checklist (what stands between today and a real launch)

Separated into **code** (Build owns, tracked above as specs) and **the rest**
(the user owns — no code, just setup/decisions). The "rest" is the part most
roadmaps forget and most launches stall on.

### A. Code items (each has a spec in `docs/specs/`)

- [x] Legal pages exist (`/privacy`, `/terms`) + OAuth/billing accuracy fixes
      → **`legal-pages-oauth`** (`done`)
- [x] First-run experience → **`first-run-experience`** (`done`)
- [ ] Observability → **`observability-minimal`** (`ready`)
- [ ] Google auth → **`social-auth-google`** (`done code-side`, blocked on
      Google console + Railway env vars)
- [x] Entitlement caps → **`entitlement-enforcement`** (`done`)
- [x] Friction cleanup → **`friction-cleanup`** (`done`; breadcrumb-nav spun out)
- [ ] Command palette + search → **`command-palette-search`** (`ready`)
- [ ] Newsletter capture → **`newsletter`** (`draft`; product copy + provider
      decision still needed)
- [ ] Blog (SEO publication) → **`blog`** (`ready`; builds on the shipped Astro
      split — two-lane index + rotating featured zone; content collection +
      `/blog` + `/blog/[slug]` + RSS)
- [ ] Blog shareability → **`blog-social-meta`** (`ready`; split from `blog` —
      OG images, Twitter/LinkedIn cards, share row)
- [ ] Breadcrumb navigation → **`breadcrumb-nav`** (`ready`, spun out of friction-cleanup; route model locked 2026-07-03)
- [ ] Tag management UI + reserved-tag seeding → **`tag-management`** (`ready`, written 2026-07-03; unblocks `focus-engine-v2`)
- [ ] Project-owned Resources + Task references → **`resources-project-owned`** (`ready`, confirmed 2026-07-03)
- [x] Goal/Project lifecycle (complete/edit/relink/sequence) → **`goal-planning`** (`done`)

### B. Non-code items the user owns (no spec — these are setup/decisions)

These are the things Build cannot do. They gate real launch regardless of
code state.

> **Tracked as lifecycle units in `docs/backlog/`** (promoted out of this prose
> checklist 2026-07-03). The list below is the summary; the backlog files are
> the source of truth for status — all `ready` except `gtm-founding100-story`
> (`draft`).

- [ ] **Google Cloud OAuth client.** Create the OAuth consent screen, register
      `actionamp.com/auth/google/callback` (+ localhost for dev) as authorized
      redirect URIs, get `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, set them
      in Railway service vars. *Gates social-auth-google.*
- [ ] **Stripe in production mode.** Confirm the prod keys (not test) are what
      the `action-amp-server` Railway service vars hold, and that the webhook
      endpoint is registered in the Stripe dashboard pointing at
      `api.actionamp.com/webhooks/stripe`. The code is live; verify the live
      key + webhook signature match prod. *Gates all billing.*
- [ ] **A real, monitored support/contact address.** Privacy + Terms reference
      `privacy@actionamp.com` / `legal@actionamp.com` — confirm these inboxes
      exist and are read. Google verification + user trust both need a working
      contact. *Gates legal-pages-oauth signoff.*
- [ ] **Domain + DNS hygiene.** `actionamp.com` resolves (verified), but
      confirm: SPF/DKIM/DMARC for the `noreply@actionamp.com` sender (so auth
      + billing emails don't land in spam), and that `api.actionamp.com` SSL
      is the managed cert auto-renewing.
- [ ] **Email deliverability check.** Send a test signup + a test password-
      reset to a Gmail + Outlook address; confirm inbox placement (Resend is
      wired but deliverability is a DNS/config outcome, not code).
- [ ] **Analytics provider account.** Pick Plausible or PostHog (lean: Plausible),
      create the site, get the key — gates `observability-minimal` going live.
- [ ] **The Founding-100 story.** The page + checkout + 100-cap are live; the
      remaining question is *how the first 100 are found* through quiet
      distribution. This is a campaign decision, not code.
- [ ] **Backup + DB snapshot policy.** Railway Postgres — confirm automated
      backups are on and you know how to restore. One paying user makes this
      non-optional.

### The honest "what's actually left for a *public* launch" read

Code is in good shape. The **eight non-code items above** are the real
critical path, and four of them (Google console, Stripe prod verify, support
inbox, email deliverability) are pure setup that no amount of building
accelerates. Recommend: while Build works the ready specs, the user knocks out
section B in parallel — they're independent tracks.

---

<!-- Each draft item above should get testable done-conditions before it advances
     to `ready`. Current Discover priority: make newsletter concrete enough to
     build, then close focus-engine-v2's tag/mockup/matcher gates. -->
