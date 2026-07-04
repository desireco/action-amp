# Roadmap

<!-- Discover owns this file. Build reads only. -->
<!-- Last reviewed: 2026-07-03 (Discover — feature catalog stood up at docs/features/; SUCCESS.md (the bets) added; GTM prep B promoted to tracked backlog units; matcher-validation spec drafted, gates focus-engine-v2; weekly-monthly-review added to Then tier) -->

---

## 0. The honest state of the project (read this first)

This is not a pre-launch product. It is a **soft-launched product with no
audience yet**. That distinction changes the whole roadmap.

**What's actually shipped and verified (2026-06-27):**

- **Deployed to Railway**, live at `actionamp.com` + `api.actionamp.com` (both
  return HTTP 200). Postgres on Railway, Resend SMTP for auth email.
- **Full core loop works end-to-end**: capture (`⌘K`) → inbox → triage →
  task/project → Next focus chooser → Today (capped at 5) → completion →
  Logbook. Every step has a real server operation and a route.
- **Live Stripe billing**: recurring (Pro $79.50/yr, $12.95/mo), prepaid ($90),
  and the capped **Founding 100** ($139 lifetime, 100 spots, server-enforced
  cap, live count on the landing page). Webhook is the source of truth; client
  never mutates `plan`.
- **The wedge is built**: `getTopTask` priority-first matcher, Now/Next state
  machine (`startedAt` persists across navigation), the Next single-task
  home screen, focus-mode overlay.
- **Test suite green**: 183 unit/component tests (13 files), 8 Playwright e2e
  specs (capture, login, inbox, triage, projects, today, next).
- **Polished landing page**, design-system page, onboarding, dark mode,
  keyboard-shortcut system, focus-switch nav (Work/Plan/Review expanding
  sections).

**The docs are stale relative to the code.** `BACKLOG.md` (dated 2026-06-23)
still lists as "not built" items that are demonstrably shipped (deploy,
triage, focus engine, lists, billing). The duet `specs/` and `reviews/`
folders are empty (templates only). The first piece of real work this roadmap
implies is **reconciling the docs with reality** so Build doesn't work off a
lie.

### The single most important fact

**ActionAmp is live, and almost nobody is using it.** The landing page carries
a newsletter capture (footer + hero) and the Founding 100 checkout, both live —
but there is **no distribution, no analytics, and no evidence of a single
external user yet**. (There is also no waitlist, by deliberate choice — see
PRODUCT.md §"Fair to users.") So the binding constraint on the business is
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

Top = next. Each name matches (or will match) `docs/specs/<feature>.md`.
Status reflects duet state. **Discover writes the next spec for each `draft`
item; Build pulls `ready`.**

### Now (the validation gauntlet — do these before anything new)

> Specs live at `docs/specs/<slug>.md`. `ready` = Build may pull; `draft` =
> Discover still owes product decisions. Statuses reflect branch state as of
> 2026-06-27 — see §Branch state below for what's in flight.

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
4. **observability-minimal** (`ready`) — ship one privacy-respecting tracker +
   the 4 funnel events (land → signup → app-open → checkout). The one number
   that matters: visitor → checkout %.
5. **social-auth-google** (`done` 2026-06-27, code-side) — Google OAuth added
   alongside email; config verified, never-throws name resolution. **Non-code
   gate outstanding (your side):** create the Google Cloud OAuth client +
   register redirect URIs + add a test user — see §GTM prep B. The callback
   verifies once the client exists. → §Shipped.
6. **distribution-quietlaunch** — (no spec; it's a campaign, not a build item)
   get the existing product in front of ~500 of the right people in 4 weeks.
7. **in-app-feedback** (`done` 2026-06-30) — shell loudspeaker opens a simple
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
3. **public-launch-readiness** (`draft` — needs spec) — Product Hunt, the launch
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
5. **goal-planning** (`ready`, new 2026-07-03) — the Planning area is
   **read-mostly today**: you can create Goals/Projects and read roll-ups, but
   cannot complete, reopen, edit, delete, or re-link them, and cannot start a
   Project from inside a Goal (`isDone`/`completedAt` on both models are
   write-only-by-hand; `grep updateProject|completeGoal|deleteGoal` → zero
   matches). This closes the lifecycle + alignment holes and adds one
   lightweight planning affordance: an explicit **sequence** of Projects under
   a Goal, with the first one surfaced as "the next project toward this goal."
   Pure Planning-area completion — no new routes, no matcher impact (independent
   of `focus-engine-v2`). Same tier as `resources-project-owned` + `breadcrumb-nav`
   per user decision 2026-07-03: depth/polish on a shipped surface, gated like
   the rest of this tier. Spec at `docs/specs/goal-planning.md`; catalog at
   `docs/features/goal-planning.md`.
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

## Branch state (2026-06-27)

**Working directly on `main` — no feature branches.** The three in-flight
branches were rebased onto main and deleted; their work is in main's history.
Verified after consolidation + signoff: `wasp compile` clean, **195 unit
tests and 37 e2e tests pass**, migrations applied.

What landed and was signed off:

- **`first-run-experience` → `done`** (signed off 2026-06-27). Onboarding
  routing + `hasSeenOnboarding` migration + magic-moment seed task. e2e suite
  (the one open caveat in Build's review) run and green.
- **`legal-pages-oauth` → `done`** (signed off 2026-06-27). Privacy/terms
  rewrite + consent links. Data-retention overclaim caught + fixed during
  review. Contact-address confirmation carried to §GTM prep B.
- **`fix/what-now-surfaces-triaged-tasks` → merged (no spec).** Added: Project
  detail page + `/app/projects/:id` route (satisfies part of `friction-cleanup`),
  triage co-author wizard with lossless Archive (`archive_inbox_items`
  migration + `ARCHIVED` status), Next surfacing triaged tasks. It also
  edited `WORKFLOW.md` / `TRIAGE.md` / `DATA-MODEL.md` — `doc-reconciliation`
  should review those edits against the canonical docs.

**Open Discover actions on main:**

1. `doc-reconciliation` is now the priority — the merged fix branch edited
   canonical docs; reconcile them so planning isn't split-brain.
2. The `ready` specs are the queue (2026-07-03 review): **observability-
   minimal** (gated by `gtm-analytics-account`), **retention-criticalpath**
   (depends on observability), **command-palette-search**,
   **resources-project-owned**, **breadcrumb-nav** (route model locked),
   **tag-management** (unblocks focus-engine-v2), **cli-pat-plumbing**
   (opportunistic). Flipped to `draft` after review: **focus-engine-v2** (needs
   tag-management + a mockup + matcher-test gate), **cli-package** +
   **cli-skills**.

## Shipped

<!-- Moved here when a spec's status flips to done. Populate as Build ships + Discover signs off. -->

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

- Native mobile / PWA install (F23/F25). Web-first is correct; mobile is a
  post-PMF problem.
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
conversion number is known. Founding 100 ($139 lifetime) is the right
patron-on-ramp and is already live; lean on it, don't discount the ladder.

---

## Free-tier audit (2026-06-27)

> Question: what are the limits for free users, and do they have a good
> experience? Two audits: **(A) are the intended caps enforced?** and
> **(B) does a free user reach the product's value before bouncing?**

### A. Entitlement enforcement — none of it exists

`billing/config.ts` defines `FREE_LIMITS = { projects: 3, goals: 1, workLens: false }`
and the comment claims *"Enforced server-side, never on the client."* It is
**imported nowhere in `src/`.** Every cap in PRICING.md §4 is documentation or
marketing copy, not code:

| Intended cap (PRICING.md §4) | Status | Evidence |
|---|---|---|
| Work Lens disabled for Free | **NOT ENFORCED** | `ensureOnboarded` seeds Work+Me for *every* user; AppShell renders all lenses; `LensSwitch` has no plan awareness. Work is even the hardcoded default. |
| Max 3 Projects | **NOT ENFORCED** | `createProject` (`projects/operations.ts:67`) — no count, no plan check, unconditional `create`. |
| Max 1 Goal | **NOT ENFORCED** | `createGoal` (`goals/operations.ts:47`) — same: auth + trim, then `create`. |
| Logbook ≤ 30 days | **NOT ENFORCED** | `getLogbook` filters only `isDone`; no date range. |
| Multi-device: 1 device | **NOT ENFORCED** | No device model exists at all. |
| Command palette / search: Pro-only | **N/A** | The feature doesn't exist. `⌘K` is capture (available to all). |
| Energy/time matcher tags: Pro-only | **N/A** | The feature doesn't exist. |

`isPlanActive()` is dead code. The **only** plan-gated behavior in the whole
app is the Founding-100 spot cap — a sales-scarcity limit, not an entitlement.

**Read:** today a free user gets the *entire* product — unlimited projects,
goals, both lenses, full history. There is **no upgrade trigger anywhere in
the app.** The only place limits are even *mentioned* is the marketing copy on
the billing page (`FreeUpgradeScreen`). PRICING.md's thesis ("personal-only
Lens is the strongest upgrade trigger") is unimplemented end to end.

### B. The free-user experience — broken at the front door

The bigger problem is not the missing wall; it's that a new user may never
reach the value that wall would protect.

1. **Onboarding is dead code.** `hasCompletedOnboarding()` is defined in
   `OnboardingPage.tsx:342` and **never called anywhere.**
   `onAuthSucceededRedirectTo: "/app"` skips `/welcome` entirely. The
   `OnboardingRoute` exists but nothing routes a new signup to it.
2. **Onboarding teaches the wrong thing.** Its 4 "lessons" are the **mobile
   prototype gestures** (long-press to start working, two-finger swipe to zoom,
   one-finger swipe for modes) — see `docs/mockups/`. The webapp does not
   implement these; real interaction is keyboard + buttons (per the e2e suite).
   It teaches gestures the product lacks, and teaches nothing about the actual
   loop: capture → triage → Next.
3. **No seed data.** `ensureOnboarded` creates only empty Work+Me lenses and
   empty "General" projects. A brand-new user lands on Next showing
   *"Nothing on the table"* with an empty Inbox — no example task, no obvious
   first move. The empty state copy ("Capture something with ⌘K, then triage it
   to Today") is correct *instructions*, but a user who hasn't felt the magic
   won't do homework to feel it.
4. **Auth is email-only** (no Google). For a calm, no-reputation app, asking a
   stranger to create and verify a password before they've seen value is the
   cheapest bounce to eliminate.

### The verdict on "good experience"

The free tier is **unlimited** (which is generous) but **unwelcoming** (which
is fatal). The two findings compound: a new user gets everything for free and
still has no reason to stay, because the magic moment (Next picking your
next task) requires them to first capture, then triage, then set Today — with
nothing guiding them there. **There is no wall, and there is no welcome.**
Fixing the welcome (item 2) is more urgent than fixing the wall (item 9),
because a wall behind a door nobody enters protects nothing.

---

## GTM strategy (the campaign, not the feature list)

Aligned to the `go-to-market-strategy` skill's motion selection: **PLG** is
correct (ACV < $5K, self-serve possible, technical-ish buyer). The motion is
not in question; **the missing prerequisite is audience.** So the launch is
sequenced as audience-first.

### Motion: Product-Led Growth (self-serve, free → paid)

- **Free tier** is the wedge (Next, full focus loop, personal scope). It
  exists. The leak is that entitlement isn't enforced (roadmap item 8) — free
  currently gives away the Pro structure. Fix the trigger before driving
  traffic, or you drive traffic to a product that can't convert.
- **Channels (ORB):**
  - **Owned (build first):** the email list is now live (newsletter capture
    on the landing page — footer + hero), so the job is **growing it**, not
    standing it up. Still needed: a blog/SEO surface for ADHD+focus+GTD
    intent (deferred — see PUBLIC-PAGES.md Tier 4 → BACKLOG).
  - **Rented (drive to owned):** r/ADHD, r/productivity, r/gtd (carefully —
    these ban self-promo; lead with value, not links); ADHD/focus Twitter &
    TikTok where Llama Life/Tiimo already play.
  - **Borrowed:** guest posts / podcast spots in the ADHD-creator space.

### Phased launch (realistic for one solo maker, no team, no budget)

| Phase | Goal | Trigger to advance |
|---|---|---|
| **0 — Quiet (now)** | Reconcile docs, add analytics, fix auth friction, enforce entitlement. | Analytics live; Google auth live; caps enforced. |
| **1 — Friends & alpha (wks 1–2)** | Get 20–50 humans you can talk to, by direct ask. Founding 100 as the patron ask. | ≥20 external signups; ≥3 used Next on day 3. |
| **2 — Community (wks 3–6)** | Item 4: put it in front of ~500 of the right people via communities + a small owned list. | ≥500 unique visitors; known visitor→signup rate. |
| **3 — Paid open (wk ~8)** | Only if Phase 2 shows the funnel isn't broken: pricing page live, Product Hunt launch, the launch-marketing-pack from the GTM skill. | Known signup→paid rate ≥ 3%; or a clear reshape signal. |

**The rule:** no phase advances until its trigger is met. If Phase 2 shows a
broken funnel (e.g. 500 visitors, 2 signups), the answer is never "launch
harder" — it's go fix retention (item 5) or the matcher (item 6).

### The one number to define before anything else

> **Of unique landing-page visitors, what % reach the checkout page?**

Today this is unmeasurable (no analytics). Until it's measurable, every GTM
decision is a guess. This is why `observability-minimal` is item 2, not item 9.

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
3. **The landing-page CTA.** ~~Correct pre-deploy; now arguably leaving money
   on the table…~~ **RESOLVED 2026-07-03** — newsletter capture (footer + quiet
   hero) and the Founding 100 link are the live CTAs. The principle that
   governs them is **fairness**, not "no nudge ever" — see PRODUCT.md §"Fair to
   users" (revised). Signup, paid-plan push, and the honest Founding 100 cap
   are all in-bounds; deception, trapping, and guilt-tripping are out.
4. **$80 anchor, eyes-open.** PRICING.md already flags this as the loneliest
   spot. Keep it — but the data prerequisite (item 3) is what lets us move it
   without guessing.

---

## GTM prep checklist (what stands between today and a real launch)

Separated into **code** (Build owns, tracked above as specs) and **the rest**
(the user owns — no code, just setup/decisions). The "rest" is the part most
roadmaps forget and most launches stall on.

### A. Code items (each has a spec in `docs/specs/`)

- [x] Legal pages exist (`/privacy`, `/terms`) — but need OAuth + billing
      accuracy fixes → **`legal-pages-oauth`** (`ready`)
- [x] First-run experience → **`first-run-experience`** (`done`)
- [ ] Observability → **`observability-minimal`** (`ready`)
- [ ] Google auth → **`social-auth-google`** (`ready`, needs legal + console)
- [x] Entitlement caps → **`entitlement-enforcement`** (`done`)
- [x] Friction cleanup → **`friction-cleanup`** (`done`; breadcrumb-nav spun out)
- [ ] Command palette + search → **`command-palette-search`** (`ready`)
- [ ] Breadcrumb navigation → **`breadcrumb-nav`** (`ready`, spun out of friction-cleanup; route model locked 2026-07-03)
- [ ] Tag management UI + reserved-tag seeding → **`tag-management`** (`ready`, written 2026-07-03; unblocks `focus-engine-v2`)
- [ ] Project-owned Resources + Task references → **`resources-project-owned`** (`ready`, confirmed 2026-07-03)
- [ ] Goal/Project lifecycle (complete/edit/relink/sequence) → **`goal-planning`** (`ready`)

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
      remaining question is *how the first 100 are found* (item 6,
      distribution). This is a campaign decision, not code.
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

<!-- Each draft item above will get its own docs/specs/<feature>.md with testable
     done-conditions before it advances to `ready`. Discover's next action: write
     the spec for item 1 (doc-reconciliation) — it's the cheapest and unblocks an
     honest everything-else. -->
