# Feature Catalog

> **Authoritative inventory of what features exist.** One file per feature, 1:1
> with its spec. Status is *code-verified* (what's wired today), not what
> FEATURES.md or PRODUCT.md claim. When those prose docs disagree with this
> catalog, **this catalog wins on "does it exist / what does it do,"** and the
> prose doc is due for correction.
>
> Owned by Discover. Build reads only.
>
> Last code-verified: **2026-07-05**.

## How to read this

- Each entry below links to `docs/features/<slug>.md` (the catalog entry: WHAT
  it does, status, files) and — if one exists — `docs/specs/<slug>.md` (the
  done-conditions: HOW it's verified).
- **Statuses:**
  - `shipped` — exists in code, wired, reachable.
  - `partial` — exists but a named piece is missing or disabled.
  - `missing` — no code, only referenced as "future" or "Phase 2."
- For shipped/partial features, the file paths are the source of truth.

## Index (by area; status in parens)

### Capture & Triage
- [capture](./capture.md) (`shipped`) — `⌘K` quick-add + grammar v2 (`#` projects, `@` time, `[[lens]]`) → universal Inbox.
- [inbox-triage](./inbox-triage.md) (`shipped`) — per-item spec wizard; lossless Archive.
- [triage-classify-step](./triage-classify-step.md) (`shipped`) — Classify → Spec → Complete (replaces separate Context + Type steps).

### Focus — the wedge
- [next-what-now](./next-what-now.md) (`shipped`) — home = one task; `getTopTask`; "why this?" line.
- [today](./today.md) (`shipped`) — committed-for-today list, cap 5, Done-today section.
- [focus-mode](./focus-mode.md) (`shipped`) — dedicated `/app/focus` route; Variant F redesign (margin clock, summoned composer, confirm-on-complete).
- [task-notes-completion-log](./task-notes-completion-log.md) (`shipped`) — `TaskUpdate.kind` (NOTE | COMPLETED) thread + Focus composer.
- [upcoming-someday](./upcoming-someday.md) (`shipped`) — Upcoming (top-level Plan nav) + Someday.

### Planning
- [projects](./projects.md) (`shipped`) — list + detail, inline task create, progress roll-up.
- [goals](./goals.md) (`shipped`) — list + detail, aggregate progress, full lifecycle.
- [goal-planning](./goal-planning.md) (`shipped`) — Goal/Project lifecycle (complete/reopen/edit/delete/re-link) + project ordering.
- [logbook](./logbook.md) (`shipped`) — completed + Archived section, Restore, completed Goals.

### Cross-cutting
- [entitlements](./entitlements.md) (`shipped`) — server-side caps + ProGate paywall.
- [billing](./billing.md) (`shipped`) — 3 Pro prices + Founding 100 (server-enforced cap).
- [custom-lenses](./custom-lenses.md) (`shipped`) — user-defined lenses; Pro CRUD; `⌘L` switcher; per-lens identity.
- [onboarding](./onboarding.md) (`shipped`) — `/welcome`, server flag, 3 seed tasks.
- [auth](./auth.md) (`partial`) — email live; Google OAuth code present but disabled.
- [landing](./landing.md) (`partial`) — signup + Founding-100 CTAs; newsletter capture **missing but intended** (see [newsletter](./newsletter.md)).
- [feedback](./feedback.md) (`shipped`) — loudspeaker → modal → admin email.
- [shell-prefs](./shell-prefs.md) (`shipped`) — AppShell, focus-switch nav, shortcuts, dark mode, settings.
- [task-fields](./task-fields.md) (`partial`) — **Context** shipped (Task.content via chip popovers); **Outcome** (`Task.outcome`) not yet shipped.

### Planned (not in code)
- [command-palette](./command-palette.md) (`missing`, spec `ready`) — `⌘\` fuzzy search.
- [resources-project-owned](./resources-project-owned.md) (`missing`, spec `ready`) — project-owned links/notes + task refs; explicit `TaskResource` join (resolved 2026-07-03).
- [breadcrumb-nav](./breadcrumb-nav.md) (`missing`, spec `ready` — route model locked) — crumbs navigate.
- [focus-engine-v2](./focus-engine-v2.md) (`missing`, spec `draft`) — moment-aware matcher; needs tag-management UI + a mockup + matcher-test gate.
- [observability-minimal](./observability-minimal.md) (`missing`, spec `ready`, gated by `gtm-analytics-account`) — analytics + funnel.
- [retention-criticalpath](./retention-criticalpath.md) (`missing`, spec `ready`, depends on observability) — first-7-days instrumentation.
- [work-area-merged](./work-area-merged.md) (`missing`, spec `draft`) — merged Work area; one sub-piece (TaskUpdate.kind) shipped as `task-notes-completion-log`.
- [weekly-monthly-review](./weekly-monthly-review.md) (`missing`, spec `draft`) — period debriefs; v2 gated on `work-area-merged`.
- [newsletter](./newsletter.md) (`missing`, spec `draft`) — landing-page email capture (footer + quiet hero).
- [blog](./blog.md) (`missing`, spec `ready`) — SEO-bound publication on the Astro marketing site (`/blog`, `/blog/[slug]`, RSS); ADHD/focus/GTD intent. Builds on the shipped Astro split; pure static.
- [cli](./cli.md) (`missing`, **effort split into 3 specs 2026-07-03`) — power-user terminal surface:
  - `cli-pat-plumbing` (`ready`, P3 opportunistic) — `ApiKey` + PAT routes + middleware + Settings UI.
  - `cli-package` (`draft`) — the `cli/` package; draft because the op-refactor is unscoped.
  - `cli-skills` (`draft`) — four orchestration skills; depends on `cli-package`.
- [tag-management](./tag-management.md) (`missing`, spec `ready`) — Task-detail tag chips + reserved-name seeding; **unblocks `focus-engine-v2`**.
- [github-projects-sync](./github-projects-sync.md) (`missing`, spec `ready`) — GitHub Projects board (org `desireco`); two-way sync on structured fields, one-way on prose; `gh_node_id` join; manual CLI for v1.

### Deliberately not built (Phase 2 / Icebox)
- Subtasks, Pomodoro timer, email-in capture, AI-tuned suggestions, native mobile,
  hard focus mode. See ROADMAP §Icebox.

## Conflicts caught (2026-07-03 code verification)

These prose claims do not match the code. The catalog reflects code reality:

1. **Newsletter capture: intended, not shipped.** PRODUCT.md and ROADMAP.md
   state the newsletter is "live" (footer + hero); the code has no such
   feature. **Resolved as a feature to build**, not a prose error — see
   [newsletter](./newsletter.md) (`missing`, spec `draft`). The "live" claims
   in PRODUCT.md / ROADMAP.md will be reconciled when the spec ships (or
   corrected sooner if it slips).
2. **Google OAuth is disabled at the config level** (provider block commented in
   `main.wasp.ts`; `GoogleButton` returns `null`), though its spec is marked
   `done (code-side)`. Code is written; it is not wired on. → Either flip it on
   (after the Google Cloud client exists) or mark the spec `partial`.
3. **FEATURES.md self-flagged stale** in its own header (F6 triage keymap, F10
   candidate pool, structural framing). The catalog supersedes it for
   "what exists / what does it do." FEATURES.md remains useful only as
   historical feature-level reference.

## Maintenance

When a spec ships or a feature changes, update the relevant `features/<slug>.md`
file **in the same commit.** The `specs/` status and the `features/` status must
not drift — spec status tracks *done-conditions met*; feature status tracks
*exists in code*. They usually move together but are not identical (a feature can
be `shipped` while its spec is `done`; a partial feature has no clean spec state).
