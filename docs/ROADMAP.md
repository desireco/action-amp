# Roadmap

<!-- Discover owns this file. Build reads only. -->
<!-- Active product work, 2026-08-15: the next release bundle is implemented on main: guided first-run practice, Goal rationale in Next/Focus/CLI, simple-list Lenses, reviews/focus improvements, This Week planning, project lifecycle controls, and smarter shared capture. This is not production deployment evidence. -->
<!-- Last reviewed: 2026-08-03 (CLI/API access is now Pro-only: Free accounts cannot issue or use personal API tokens; existing tokens stop working when an account returns to Free. CLI package publishing is in progress. Resources shipped — project-owned links/notes CRUD on the Project detail page + `actionamp resource list/add/update/delete` CLI + `/api/cli/resource/*` PAT routes, all backed by a pure `resources/operationsCore.ts`. NO `TaskResource` join — references are markdown links in Task Context, per the task-fields reversal; NO delete-with-impact flow, just simple delete. Passwordless magic-link email sign-in shipped (six-digit code OR sign-in link, 10-min TTL, rate-limited, atomic consume; replaces passwords; localhost uses fixed `111111` for QA). Share target extended: structured capture props (`title`/`content`/`sourceUrl` on `InboxItem`) + up to four image attachments (≤5MB each) + CLI `capture` with `--title/--content/--source-url/--file`. Task Outcome (`Task.outcome`) shipped — task-fields now complete. WONT_DO task state shipped — non-destructive decline for post-triage tasks, surfaces in the Logbook with Restore. Earlier 07-26: CLI lens management shipped. Earlier 07-23: Admin dashboard + feedback-triage system. Earlier 07-22: ActionAmp CLI terminal client shipped.) -->

---

## 0. The honest state of the project (read this first)

This is not a pre-launch product. It is a **soft-launched product with no
audience yet**. That distinction changes the whole roadmap.

**What's actually shipped and verified (updated 2026-07-29):**

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
- **Admin workspace**: a dedicated admin-only `/do/admin` shell with Overview,
  Funnel, and Feedback routes; `/do/settings/admin` redirects for old
  bookmarks. Overview retains global user/task/feedback counts, Funnel reads
  the first-party event ledger, and Feedback is the full triage queue. Backed
  by shared aggregate cores. Activity
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
- **Passwordless email sign-in (magic links)**: `/login` sends a six-digit code
  *and* a sign-in link (both create a normal Wasp session). The
  `MagicLoginChallenge` flow owns the challenge: 10-min TTL, 1-min resend
  throttle, 5-attempt cap, atomic consume (no double-session races), delivery
  failures logged + the credential deleted so nothing usable leaks. Passwords
  + password reset are gone; the email provider stays on for identity + the
  code delivery. Localhost uses a fixed `111111` for manual QA.
- **Share-to-inbox with images + structured capture**: the Android/Chrome
  `share_target` now carries structured fields (`title` / `content` /
  `sourceUrl` on `InboxItem`) and up to four image attachments (`InboxAttachment`,
  ≤5MB each, image MIME-only). The `/share` review page shows parsed chips before
  anything is saved; the CLI mirrors it (`capture --title/--content/
  --source-url/--file`). Inbox rows badge "Link attached" / "Image attached."
- **Project-owned Resources**: links + notes filed under a Project, full CRUD
  on the Project detail page (add/edit/remove) + `actionamp resource
  list/add/update/delete` on the CLI + `/api/cli/resource/*` PAT routes — all
  backed by a pure `resources/operationsCore.ts`. The Resource model is
  project-only (the "Project or Goal" dual-parent was dropped as
  over-engineered). **Scope cut vs. the original spec:** no `TaskResource`
  join (references stay markdown links in Task Context, per the `task-fields`
  reversal) and no delete-with-impact flow — Resources have no task links to
  impact, so delete is plain remove.
- **Task Context + Outcome**: the task-enhancement pair is complete.
  `Task.content` = Context (what you need to do it), `Task.outcome` = Outcome
  (what happened, captured at completion). Both optional markdown, both
  invisible when empty, both editable on the task page via a shared
  `PropertyChips` editor; Outcome renders in the completed-task panel.
- **WONT_DO task state**: a fourth `TaskStatus` — the non-destructive decline
  for tasks that already left the inbox (where hard-delete is the right call).
  A WONT_DO task drops out of every active list and surfaces in the Logbook's
  "Won't do" section with a Restore affordance. Preserves the triage context
  (priority/project/notes/due) so a "no, not this" is a recorded decision, not
  a silent deletion.
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
- **Current local test suite green**: 972 Vitest tests pass and `wasp compile`
  succeeds. This is code verification, not fresh deployment evidence.
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
There is **no distribution and no evidence of a single external user yet**.
Analytics and observability are live, but there is not enough external traffic
to produce a meaningful signal. So the binding constraint on the business is
**not engineering**. It is **attention**. A roadmap that adds more features
before proving anyone wants the existing ones is malpractice.

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

**Active significant product change:** **simple-list-lenses** (`review`, local
implementation; deployment not claimed) — a second Lens behavior for flat
checklists such as Shopping. Items can be added directly or arrive through the
universal Capture → Inbox path, where choosing a Simple-list Lens performs a
compact ListItem triage without Project, Goal, priority, size, or focus
machinery. The model keeps `ListItem` separate from `Task`, preserves captured
body/source context, rejects image filing until lossless attachment transfer
exists, and retains the existing Pro custom-Lens entitlement. Spec:
[`docs/specs/simple-list-lenses.md`](specs/simple-list-lenses.md). Verification
record: [`docs/features/simple-list-lenses.md`](features/simple-list-lenses.md).

**Active commercial enhancement:** **member onboarding + goal-setting
workshops** (`release-ready`; production publish not claimed) — recurring
yearly Pro includes a goal-setting workshop. Founding members receive
personal onboarding plus a goal-setting workshop. Monthly, Free, and the
unadvertised prepaid option remain outside the offer. Fulfillment is
human-arranged after purchase; this is a pricing/GTM offer, not a new app
entitlement or booking feature.

**Current release bundle** (`implemented on main`; production publish not
claimed) — the recent product work makes the existing loop clearer and more
practical without broadening the roadmap: guided first-run practice and Goal
rationale in Next, Focus, and the CLI; recorded focus sessions and calmer
Week/Month reviews; Simple-list Lenses for flat checklists; a Monday–Sunday
This Week view with weekday scheduling; and a more complete project/capture
flow. Projects can now be completed, archived, revealed in collapsible
sections, and moved between Lenses; shared captures can go straight to a
Project or Simple-list Lens when their destination is known. Empty custom
Lenses can safely change type, while populated ones show their blocking
projects before any conversion. These are code-complete changes awaiting the
normal release verification and publish path.

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
4. **observability-minimal** (`done` 2026-08-11) — StatCounter is live and
   working with the four anonymous funnel events (land → signup → app-open →
   checkout). First-party events, acquisition, activation, payment, and D1/D7
   retention reporting are available in the admin Funnel workspace. → §Shipped.
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
4. **triage-classify-step** (`in-progress`, core flow implemented 2026-07-04)
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
2. **resources-project-owned** → **shipped 2026-07-28/29** (scope-cut, see
   §Shipped): project-owned links/notes CRUD on the Project detail page + the
   CLI surface + PAT routes. **Shipped without** the `TaskResource` join
   (reversed by `task-fields` — references are markdown links in Context) and
   the delete-with-impact flow (no task links → nothing to impact; plain
   delete). If a future need for structured task↔resource links or a
   delete-impact surface resurfaces, reopen as a new spec — the current shape
   is deliberately simpler than the `ready` spec's done-conditions.
3. **task-fields** → **shipped complete 2026-07-28** (see §Shipped): Context
   (`Task.content`) + Outcome (`Task.outcome`), both optional markdown, both
   editable via the shared `PropertyChips` editor. Spec `task-fields.md` is
   `done`. The Task↔Resource reversal it introduced (markdown links, no join)
   is the reason `resources-project-owned` shipped scope-cut.
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
    `cli-write-ops.md` (`deferred`). ~~`cli-comments-resources.md`~~ (was
    `deferred`, unblocked the `task-research` skill) is **satisfied** by the
    shipped `resource` CLI commands. **Split into three specs 2026-07-03:**
    `cli-pat-plumbing`, `cli-package`, `cli-skills`. Umbrella + cross-cutting
    decisions: `docs/specs/cli.md`.
   **Phase 0 + Phase 1 shipped 2026-07-22** (see §Shipped); the surface has
   since grown: `lens list/show/switch/current` (2026-07-26) and `resource
   list/add/update/delete` (2026-07-29) landed, the latter satisfying the
   formerly-deferred `cli-comments-resources` (Resources are now full CLI
   CRUD). `capture` also gained shared-content + image flags
   (`--title/--content/--source-url/--file`, 2026-07-29). Only `cli-skills`
   (Phase 2 — the four orchestration skills) remains `draft`. **Pro-only
   access shipped 2026-08-03:** Free accounts cannot issue CLI/PAT tokens or
   use `/api/cli/*`; active Pro and Founding members can. **CLI package
   publishing is in progress**; do not publish customer install guidance until
   that release path is ready.
5. **goal-planning** (`done` 2026-07-05, was `ready`) — **shipped**: full
   Goal/Project lifecycle (complete, reopen, edit, delete, re-link) + explicit
   `Project.order` sequencing under a Goal + Logbook surfacing of completed
   goals + Reopen affordance + e2e (full sequence → complete → logbook →
   reopen). Server ops, UI, and tests all landed. → §Shipped. Spec at
   `docs/specs/done/goal-planning.md`; catalog at `docs/features/goal-planning.md`.
6. **work-area-merged** (`draft`) — collapses `/do` + `/do/today` into one
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
7. **habits-recurring-activities** (`idea` — needs discovery + spec) — support
    habits and recurring activities, including daily, weekly, and custom
    cadences, without turning them into a permanent pile of duplicated tasks.
    A due occurrence should enter Today when relevant; completing it should
    record that occurrence and schedule the next one. Keep the experience calm:
    no streaks, scores, guilt, or punitive overdue state. This is product-depth
    work after validation signal, not part of the current acquisition gauntlet.
## Queue notes

**Open actions on main:**

1. The validation queue is **newsletter → retention-criticalpath →
   distribution-quietlaunch**. Observability and analytics are shipped.
2. The product-depth queue after validation signal is **tag-management →
   matcher-validation → focus-engine-v2**. Focus-engine-v2
   stays draft until the tag UI, matcher test, and moment-bar design are closed.
3. Opportunistic small ready work: **breadcrumb-nav**. Useful depth work once
   there is signal: ~~goal-planning~~ → shipped; ~~resources-project-owned~~
   → shipped (scope-cut). The depth backlog now leans on **task-fields**
   and **weekly-monthly-review** are shipped; **tag-management** is the next
   open depth unit.
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

- **capture-image-intake** (`shipped` 2026-08-16) — `⌘K` capture accepts
  images: paste (`⌘V`) into the input, or drop a file on the open popover
  (the whole overlay is the target) or on the Capture FAB, which opens the
  popover with the files preloaded. Client-side mirror of
  `prepareImageAttachments` (four images, ≤5 MB each, `image/*` only, same
  error copy) rejects bad files before submit; the op re-validates. Saves
  through `createInboxItem`'s `attachments` — the identical InboxItem path
  the Android share target and `actionamp capture --file` use; image-only
  captures fall back to the first filename as display text. Extends
  `share-target-images-and-structured-capture`; no server changes. (No spec —
  client glue over an existing pipeline.)
- **observability-minimal + growth analytics** (`shipped` 2026-08-03;
  StatCounter confirmed working 2026-08-11) — StatCounter runs on the
  production marketing site and app with anonymous landing, signup, first-app-
  open, and checkout milestones; local traffic is excluded. ActionAmp also
  stores a no-content first-party event ledger and exposes an admin Funnel with
  acquisition sources, activation steps, checkout/payment conversion, and
  D1/D7 retention. Analytics and observability are complete roadmap items;
  future event additions are measured product work, not an unfinished tracker.
- **weekly-monthly-review** (`shipped` 2026-08-08) — Review now has distinct
  Today, Week, and Month debriefs plus the unchanged Logbook. All cadences show
  completed Goals, Projects, and every Task across Lenses; Week and Month lead
  with up to five completed Medium/Large actions and count all completed actions
  by Lens; Month adds next-month Goal emphasis. Optional reflections autosave
  into a new `Review` record; only Today needs an explicit close and historical
  snapshot. Settings independently enable each cadence
  (all on by default); navigation and direct-route guards honor every toggle
  combination. IANA-zone period helpers cover Monday weeks, calendar months,
  and DST days. Available to all accounts; no streaks, scores, reminders,
  comparative judgment, or Logbook rewrite. Prototype:
  `docs/mockups/review-rhythms.html`; spec:
  `docs/specs/weekly-monthly-review.md`.
- **command-palette-search** (`shipped` 2026-08-08) — `/` opens bounded
  sitewide Search and `⌘\` opens fuzzy Command without displacing `⌘K`
  Capture. Paid users can find Tasks in every lifecycle state plus Projects,
  Goals, Resources, and live/archived Inbox records across Lenses; results
  preserve exact permalink or anchored destinations. Safe commands, shared
  entitlement behavior, responsive pointer entry, 900 passing unit/component
  tests, and four passing Playwright journeys are recorded in
  `docs/specs/command-palette-search.md`.
- **resources-project-owned (scope-cut)** (`shipped` 2026-07-28/29) — the
  `Resource` entity is real: project-owned links + notes with full CRUD on the
  Project detail page (add/edit/remove behind the ⋯ overflow), the CLI surface
  (`actionamp resource list/add/update/delete`), and `/api/cli/resource/*` PAT
  routes — all backed by a pure `resources/operationsCore.ts` shared across the
  Wasp action, the CLI routes, and the triage resource branch. The dual-parent
  "Project or Goal" was dropped as over-engineered: `Resource.projectId` is
  required + NOT NULL (DB-enforced invariant). **Two scope cuts vs. the spec:**
  (1) **no `TaskResource` join** — tasks reference project material as markdown
  links in the Context field, per the `task-fields` reversal (the spec's §A
  "explicit join" was itself reversed); (2) **no delete-with-impact flow** —
  with no task links, delete is a plain remove (the "N tasks reference this"
  surface has nothing to show). The spec stays `ready`-with-reversals rather
  than moving to `done/`; its done-conditions for the join + impact flow are
  formally superseded by this entry. `cli-comments-resources` (deferred) is now
  unblocked and satisfied by the CLI surface.
- **auth-magic-link** (`shipped` 2026-07-28) — passwordless email sign-in
  replaces passwords. `/login` sends a six-digit code *and* a sign-in link;
  either creates a normal Wasp session. New `MagicLoginChallenge` model: SHA-256
  `codeHash` + `tokenHash`, 10-min TTL, 1-min resend throttle, 5-attempt cap,
  atomic `consumedAt` consume (prevents concurrent code/link submissions from
  creating two sessions). Email delivery failures are logged (provider detail
  kept server-side) and the challenge row is deleted so no usable credential
  survives a failed send. A newer request supersedes every older challenge for
  the same address (one clear sign-in path). Passwords + password reset removed
  from the UI; the email provider stays on for identity + code delivery.
  Localhost uses a fixed `111111` for manual QA (prod is `randomInt(100000,
  1000000)`). `auth.md` catalog entry + `docs/EMAIL-INTEGRATION.md` updated.
  (Predates the duet protocol — no spec; tracked here for the record.)
- **share-target-images-and-structured-capture** (`shipped` 2026-07-28/29) — the
  Android/Chrome `share_target` outgrew plain-text capture. `InboxItem` gained
  `title` / `content` / `sourceUrl` (structured fields from an Android page
  share; normal capture leaves them null) and an `InboxAttachment` child model
  (up to four images, ≤5MB each, image MIME-only, binary capped in the capture op). The
  `/share` review page separates a shared page's title/body/source/image and
  shows parsed chips before save; Android's duplicated page titles are
  de-duped. The CLI mirrors it: `capture --title/--content/--source-url/--file`
  (file read, size-checked, base64-encoded). Inbox rows badge "Link attached"
  / "Image attached." Service-worker + manifest fixes landed alongside
  (update-loop guard, explicit + generic Android image MIME types). Builds on
  `pwa-share-target`; the §Shipped entry below is extended, not superseded.
- **task-fields (complete)** (`shipped` 2026-07-28, Outcome leg) — the
  task-enhancement pair is now whole. **Context** (`Task.content`) shipped
  2026-07-05; **Outcome** (`Task.outcome`) shipped 2026-07-28: a nullable column
  captured at completion via `setTaskOutcome`, rendered (markdown) in the
  completed-task panel on the task page, read for future Logbook/Review. Both
  optional, both invisible when empty, both edited through the shared
  `PropertyChips` chip-popover editor. `task-fields.md` spec flipped `ready →
  done`; the partial `task-fields` catalog entry is now `shipped`. Feeds
  `weekly-monthly-review`'s honest "what happened" surface.
- **task-wont-do** (`shipped` 2026-07-26) — `TaskStatus` gained `WONT_DO`, the
  non-destructive decline for tasks that already left the inbox (hard-delete
  lives at triage only, before a row accumulates context). A WONT_DO task
  carries its triage context (priority/project/notes/due), drops out of every
  active list, and surfaces in the Logbook's "Won't do" section with a Restore
  affordance. The "I considered this and chose not to do it" decision is now a
  recorded event, not a silent delete. Migration is a single `ALTER TYPE ADD
  VALUE` (no backfill). (No duet spec — small, self-contained.)
- **admin-dashboard** (`shipped` 2026-07-22) — first in-app admin surface. A
  stats-first page at `/do/settings/admin` (admin-only tab in SettingsLayout)
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
- **cli (Phase 0 + Phase 1)** (`shipped; package publishing in progress`,
  updated 2026-08-03) — the ActionAmp terminal
  client. A standalone `cli/` package (commander + chalk, ESM, TypeScript)
  that talks to the webapp's `/api/cli/*` routes via PAT auth. **Phase 0
  (`cli-pat-plumbing`):** `ApiKey` model + SHA-256 hashed tokens, OAuth browser
  login flow (the `gh auth login` pattern — CLI opens browser, user confirms,
  token comes back via localhost callback), `/cli/login` consent page, Settings
  → Access tokens management UI, Bearer PAT middleware, `/api/cli/now` stub.
  **Pro-only entitlement enforced:** Free accounts cannot issue a token or
  call any CLI/API route; an active Pro plan or Founding membership is
  required, and existing tokens stop working immediately when an account
  returns to Free. Staff retain the standard internal entitlement bypass.
  **Phase 1 (`cli-package`):** full 11-command surface — login, now, capture,
  whoami, task (show/start/pause/done/snooze/move), today (--done), inbox
  (list/triage), project (list/show/create/add-task), goal (list/show/create),
  logbook, logout, plus `actionamp llm` (prints agent/LLM instructions). Every
  command supports `--json`. 55 CLI tests + the op-refactor (pure `*Core.ts`
  files shared between Wasp ops and CLI routes — zero duplicated logic). The
  throwaway prototype was replaced by the real package. **CLI package
  publishing is in progress**; public install documentation follows the
  release, not before it. Only `cli-skills` (Phase 2 — orchestration skills)
  remains draft. Specs: `docs/specs/cli.md` (umbrella),
  `cli-pat-plumbing.md`, `cli-package.md`, `cli-skills.md`.
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
- **pwa-share-target** (`shipped` 2026-07-25) — the installed PWA is an
  Android/Chrome share target. A `share_target` block in `manifest.json`
  POSTs the share sheet's `title`/`text`/`url` to a new session-authed
  `POST /api/share` route, which composes a single string (`Title — url`
  precedence, `composeShareText`) and saves via the existing pure
  `createInboxItemCore` — same core `⌘K` capture and the CLI use. The route
  303-redirects to a full-screen `/share` confirmation page (parsed chips +
  stored text, auto-dismisses ~3s via `window.close()` with a `/do` fallback)
  or a first-class error state (`empty` / `server` / `missing`). Logged-out
  shares are **not** preserved across login — the user re-shares after
  sign-in (deliberate scope cut; the signed-replay design is archived in the
  spec's git history if it ever hurts). iOS gap: `share_target` is
  Android/Chrome only; iOS Safari ignores the manifest block and a native
  Share Extension remains a post-PMF concern (Icebox). Spec:
  `docs/superpowers/specs/2026-07-25-pwa-share-target-design.md`; plan:
  `docs/superpowers/plans/2026-07-25-pwa-share-target.md`.
  **Extended 2026-07-28/29** — see the `share-target-images-and-structured-capture`
  entry at the top of §Shipped: `InboxItem` gained structured `title`/`content`/
  `sourceUrl` + an `InboxAttachment` image model (up to four images, ≤5MB each), the `/share`
  review page separates a shared page's fields, and the CLI mirrors it
  (`capture --title/--content/--source-url/--file`).
- **mobile-dock + task-row-action-drawer** (`shipped` ~2026-07-15) — the
  mobile bottom dock reorganized around a Do-first affordance with Today
  folded in (Next was demoted — the focus chooser lives at the top of /do,
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
  detail view (`/do/goals/:id` + `getGoal`, progress math matched to
  `getGoals`'s rollup after a review-blocker fix). 210 unit tests + 42/42 e2e
  (serially). **Two done-conditions settled at sign-off:** `/do/upcoming`
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
  through a `TaskSession` model; a dedicated `/do/focus/:taskId` route
  replaced the overlay-style invocation. Spec locked to Variant F at
  `docs/specs/`.
- **task-page-full-field-editing** (`shipped` 2026-07-05) — task permalinks
  (`/do/tasks/:id`) + chip-popover editing for every task field, sharing a
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
| Command palette / search | Shipped and server-authoritatively Pro-gated. |
| Energy/time matcher tags | Feature missing; gated behind tag-management + focus-engine-v2. |

### B. Free-user experience — improved, still unmeasured

The worst front-door problems were fixed by `first-run-experience`: onboarding
routes correctly, no longer teaches non-existent mobile gestures, and gives new
users a seed task so they can feel the Next loop without doing setup homework.
That does not prove activation works. It only removes obvious self-inflicted
friction.

The live analytics and `retention-criticalpath` must now answer:

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
| **0 — Quiet (now)** | Use live analytics, add newsletter capture, finish non-code launch setup. | Newsletter live; Google/Stripe/contact/email gates clear. |
| **1 — Friends & alpha (wks 1–2)** | Get 20–50 humans you can talk to, by direct ask. Founding 100 as the patron ask. | ≥20 external signups; ≥3 used Next on day 3. |
| **2 — Community (wks 3–6)** | Quiet distribution: put it in front of ~500 of the right people via communities + a small owned list. | ≥500 unique visitors; known visitor→signup rate. |
| **3 — Paid open (wk ~8)** | Only if Phase 2 shows the funnel isn't broken: pricing page live, Product Hunt launch, the launch-marketing-pack from the GTM skill. | Known signup→paid rate ≥ 3%; or a clear reshape signal. |

**The rule:** no phase advances until its trigger is met. If Phase 2 shows a
broken funnel (e.g. 500 visitors, 2 signups), the answer is never "launch
harder" — it's go fix retention (item 5) or the matcher (item 6).

### The one number to define before anything else

> **Of unique landing-page visitors, what % reach the checkout page?**

This is now measurable through StatCounter and the first-party admin Funnel.
The next constraint is traffic: collect enough real visits for the conversion
rate to carry decision weight.

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
- [x] Observability → **`observability-minimal`** (`done`)
- [ ] Google auth → **`social-auth-google`** (`done code-side`, blocked on
      Google console + Railway env vars)
- [x] Entitlement caps → **`entitlement-enforcement`** (`done`)
- [x] Friction cleanup → **`friction-cleanup`** (`done`; breadcrumb-nav spun out)
- [x] Command palette + search → **`command-palette-search`** (`done`)
- [ ] Newsletter capture → **`newsletter`** (`draft`; product copy + provider
      decision still needed)
- [ ] Blog (SEO publication) → **`blog`** (`ready`; builds on the shipped Astro
      split — two-lane index + rotating featured zone; content collection +
      `/blog` + `/blog/[slug]` + RSS)
- [ ] Blog shareability → **`blog-social-meta`** (`ready`; split from `blog` —
      OG images, Twitter/LinkedIn cards, share row)
- [ ] Breadcrumb navigation → **`breadcrumb-nav`** (`ready`, spun out of friction-cleanup; route model locked 2026-07-03)
- [ ] Tag management UI + reserved-tag seeding → **`tag-management`** (`ready`, written 2026-07-03; unblocks `focus-engine-v2`)
- [x] Project-owned Resources + Task references → **`resources-project-owned`**
      (`shipped` 2026-07-28/29, scope-cut — no `TaskResource` join, no
      delete-with-impact; see §Shipped)
- [x] Task enhancement fields (Context + Outcome) → **`task-fields`** (`done`
      2026-07-28 — Outcome shipped; Context shipped 2026-07-05)
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
- [x] **Analytics provider account.** StatCounter selected, configured, and
      confirmed working; `observability-minimal` is live.
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
