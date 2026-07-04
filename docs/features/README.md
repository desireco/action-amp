# Feature Catalog

> **Authoritative inventory of what features exist.** One file per feature, 1:1
> with its spec. Status is *code-verified* (what's wired today), not what
> FEATURES.md or PRODUCT.md claim. When those prose docs disagree with this
> catalog, **this catalog wins on "does it exist / what does it do,"** and the
> prose doc is due for correction.
>
> Owned by Discover. Build reads only.
>
> Last code-verified: **2026-07-03**.

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
- [capture](./capture.md) (`shipped`) — `⌘K` quick-add + NL parsing → universal Inbox.
- [inbox-triage](./inbox-triage.md) (`shipped`) — per-item spec wizard; lossless Archive.

### Focus — the wedge
- [next-what-now](./next-what-now.md) (`shipped`) — home = one task; `getTopTask`; "why this?" line.
- [today](./today.md) (`shipped`) — committed-for-today list, cap 5, Done-today section.
- [focus-mode](./focus-mode.md) (`partial`) — single-task overlay; no timer.
- [upcoming-someday](./upcoming-someday.md) (`shipped`) — bench + maybe-later lists.

### Planning
- [projects](./projects.md) (`shipped`) — list + detail, inline task create, progress roll-up.
- [goals](./goals.md) (`shipped`) — list + detail, aggregate progress.
- [logbook](./logbook.md) (`shipped`) — completed + Archived section, Restore.

### Cross-cutting
- [entitlements](./entitlements.md) (`shipped`) — server-side caps + ProGate paywall.
- [billing](./billing.md) (`shipped`) — 3 Pro prices + Founding 100 (server-enforced cap).
- [onboarding](./onboarding.md) (`shipped`) — `/welcome`, server flag, 3 seed tasks.
- [auth](./auth.md) (`partial`) — email live; Google OAuth code present but disabled.
- [landing](./landing.md) (`partial`) — signup + Founding-100 CTAs; newsletter capture **missing but intended** (see [newsletter](./newsletter.md)).
- [feedback](./feedback.md) (`shipped`) — loudspeaker → modal → admin email.
- [shell-prefs](./shell-prefs.md) (`shipped`) — AppShell, focus-switch nav, shortcuts, dark mode, settings.

### Planned (not in code)
- [command-palette](./command-palette.md) (`missing`, spec `ready`) — `⌘\` fuzzy search.
- [resources-project-owned](./resources-project-owned.md) (`missing`, spec `ready`) — project-owned links/notes + task refs; explicit `TaskResource` join (resolved 2026-07-03).
- [breadcrumb-nav](./breadcrumb-nav.md) (`missing`, spec `draft`) — crumbs navigate; blocking model decision captured but unresolved.
- [focus-engine-v2](./focus-engine-v2.md) (`missing`, spec `draft`) — moment-aware matcher; needs tag-management UI + a mockup + matcher-test gate.
- [observability-minimal](./observability-minimal.md) (`missing`, spec `ready`, gated by `gtm-analytics-account`) — analytics + funnel.
- [retention-criticalpath](./retention-criticalpath.md) (`missing`, spec `ready`, depends on observability) — first-7-days instrumentation.
- [work-area-merged](./work-area-merged.md) (`missing`, spec `draft`) — merged Work area + activity log.
- [custom-lenses](./custom-lenses.md) (`missing`, spec `draft`) — user-defined lenses.
- [weekly-monthly-review](./weekly-monthly-review.md) (`missing`, spec `draft`) — period debriefs; v2 gated on `work-area-merged`.
- [newsletter](./newsletter.md) (`missing`, spec `draft`) — landing-page email capture (footer + quiet hero).
- [cli](./cli.md) (`missing`, **effort split into 3 specs 2026-07-03**) — power-user terminal surface:
  - `cli-pat-plumbing` (`ready`, P3 opportunistic) — `ApiKey` + PAT routes + middleware + Settings UI.
  - `cli-package` (`draft`) — the `cli/` package; draft because the op-refactor is unscoped.
  - `cli-skills` (`draft`) — four orchestration skills; depends on `cli-package`.
- [tag-management](./tag-management.md) (`missing`, spec `not yet written`) — tag view/add/remove UI + reserved tag seeding; **prerequisite for `focus-engine-v2`**.

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
