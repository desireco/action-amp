# AGENTS.md — ActionAmp

> Agent-facing index. **Read this before any non-trivial work.** It tells you
> which doc to read for which task, and which doc wins when two disagree.
> For the human-facing overview + full table of contents, see [`README.md`](README.md).

## What this repo is

ActionAmp is a focus app: it opens to **one task** (the next thing that matters),
not a list. Two halves of the repo:

- **`docs/` (+ root `PRODUCT.md`, `DESIGN.md`)** — the *thinking*: strategy,
  spec, canonical interaction/workflow design, mockups, research.
- **`webapp/`** — the *implementation*: a Wasp (`>=0.24`, TypeScript Spec) app,
  React 19 + Node + Prisma, organized vertically per feature in `webapp/src/`.
- **`cli/`** — the *terminal client*: a standalone TypeScript package
  (`commander` + `chalk`, ESM) that talks to the webapp's `/api/cli/*` routes.
  Auth via OAuth browser login; every command supports `--json`. The
  `/api/cli/*` routes + the pure `*Core.ts` files they share with the Wasp ops
  live under `webapp/src/`.
- **`admin-cli/`** — the *admin terminal client*: a separate standalone package
  (same stack as `cli/`, no shared code) restricted to admin accounts. Login
  rejects non-admins; stores its token at `~/.config/actionamp-admin/` (separate
  from `cli/`'s). Surfaces: feedback triage (`feedback list/show/status`) and
  product stats (`stats`, text + `--json`). Talks to the same `/api/cli/*`
  backend; the admin-only routes (`/api/cli/feedback/*`, `/api/cli/admin/*`)
  gate on `req.patUser.isAdmin`.

ADHD is the design muse, not the marketing target. Tone is calm, direct,
opinionated, honest — no exclamation marks, no streaks, no guilt-trip red dots.

## Authority hierarchy (which doc wins)

When docs conflict, **higher wins**:

1. **`docs/WORKFLOW.md`** — canonical for *structure* (areas, modes, where things
   live, how items move). Explicitly overrides `FEATURES.md`, `PAGES.md`,
   `DATA-MODEL.md`, and `TRIAGE.md` on structural questions. (See its §5
   "Decisions locked" and §6 "Document cascade".)
2. **`docs/INTERACTION.md`** — canonical for the modal interaction architecture
   (modes, state machine, gesture/keyset maps).
3. **`docs/TRIAGE.md`** — canonical for the triage keymap + co-author UI.
4. Everything else (`FEATURES.md`, `PAGES.md`, `DATA-MODEL.md`, spec/design
   drafts) is **reference** — useful, but defer to the canonical docs above on
   conflict, and update them when the canonical doc changes.

> `DESIGN.md` (root) is the *Things* DNA reference — the design-system
> foundation, not the final ActionAmp identity. ActionAmp's own decided system
> (teal/amber accents, lens identity, token map) lives in
> `docs/DESIGN-SYSTEM.md`, mirroring `webapp/src/styles/tokens.css`.

## Task → doc routing

Pick the task; read the doc(s) on the right **before** writing code.

| If the task is about… | Read first |
|-----------------------|------------|
| App structure, areas, modes, Lens scoping, where an item lives | `docs/WORKFLOW.md` |
| The home screen (What Now), Now/Next state machine, Today cap | `docs/WORKFLOW.md` §2.3, §5 |
| Triage loop, the keymap, dispatch destinations | `docs/TRIAGE.md` (+ `WORKFLOW.md` §2.2) |
| **What features exist + what each does (code-verified)** | **`docs/features/` (catalog; 1 file per feature, 1:1 with specs)** — supersedes `FEATURES.md` on "does it exist" |
| Capture (`⌘K`), NL parsing, Inbox | `docs/WORKFLOW.md` §2.1, `docs/features/capture.md` + `inbox-triage.md` |
| Navigation, modes (Work/Plan/Review), gestures, keysets | `docs/INTERACTION.md` (modal modes §§1–8) |
| Overlays — popover vs sheet vs modal | `docs/INTERACTION.md` §9 (overlay patterns, merged from `modal-approach.md`) |
| Data model, entities, enums, triage flow | `docs/DATA-MODEL.md` + `webapp/schema.prisma` |
| A specific page/route | `docs/PAGES.md` + the route in `webapp/main.wasp.ts` |
| Look/feel, color, type, components, tokens | `docs/DESIGN-SYSTEM.md` (decided) + `DESIGN.md` (Things DNA) + `webapp/src/styles/tokens.css` (source of truth) |
| A UI component (Button, Card, CompletionCircle, …) | `webapp/src/components/ui/` + `DESIGN.md` |
| Pricing, plans, feature caps | `docs/PRICING.md` + `docs/FEATURES.md` |
| Stripe billing implementation | `docs/BILLING-INTEGRATION.md` (implemented) + `webapp/src/billing/` |
| The CLI (`actionamp`) terminal client | `cli/README.md` + `cli/src/` + `webapp/src/auth/patRoutes.ts` (the `/api/cli/*` routes) + `webapp/src/*/operationsCore.ts` (the shared pure cores) |
| The admin CLI (`actionamp-admin`) | `admin-cli/README.md` + `admin-cli/src/` + `webapp/src/auth/patRoutes.ts` (the admin-gated `/api/cli/feedback/*` routes) + `webapp/src/feedback/operationsCore.ts` |
| The admin dashboard (in-app stats page + `actionamp-admin stats`) | `docs/superpowers/specs/2026-07-22-admin-dashboard-design.md` + `webapp/src/admin/` + `admin-cli/README.md` |
| Share-to-inbox (PWA `share_target`, Android/Chrome) | `docs/features/pwa-notifications.md` (Share target §) + `webapp/src/share/` + `docs/superpowers/specs/2026-07-25-pwa-share-target-design.md` |
| Marketing/public site | `docs/MARKETING.md` + `docs/PUBLIC-PAGES.md` |
| Deployment / hosting | `docs/research/deployment-research.md` |
| What's left to do / pick up next | `docs/ROADMAP.md` (priority order + ready specs) + `docs/backlog/` |
| Duet pull / decompose contract | `docs/queue.md` (round-robin + `parent:`/`children:` rules; steering is via the GH Projects board, not a frontmatter flag) |
| The roadmap board (GH Projects — picking up stories, moving statuses) | "Roadmap board (GitHub Projects)" section below |
| Running a second `wasp start` / parallel dev / distributing work across agents | `docs/DEV-WORKTREES.md` + `webapp/scripts/dev-worktree.sh <name>` (worktree + own DB + own ports; `--list` / `--remove`). From inside one: `worktree-teardown.sh` (remove + cd back) and `worktree-sync.sh` (rebase onto main; `--push`/`--abort`/`--continue`) |
| Capturing a new idea fast ("maybe" bucket) | `scripts/duet-capture.sh "<idea>"` (the intake floor) |
| Refining a draft toward ready (enrich + decompose) | `duet-refine` skill (Discover sub-mode; operates only on `status: draft`) |
| Historical context (why past decisions landed) | `docs/ROADMAP.md` §Shipped + `docs/reviews/` (sign-off writeups) |
| What success means (the bets + their measurable triggers) | `docs/SUCCESS.md` |
| A specific feature spec (ready/draft status, done-conditions) | `docs/specs/<feature>.md` (index + order in `docs/ROADMAP.md`) |
| Product thesis, tone, strategic principles (the "why") | `PRODUCT.md` |
| Wasp mechanics (config, imports, migrations, ops) | `webapp/AGENTS.md` ← load the `wasp` skill too |
| **Code review** (reviewing changes/PRs/diffs) | `code-review` skill — then auto-implement the fixes (see "Rules that always apply") |

## Implementation map (webapp/)

- **`webapp/main.wasp.ts`** — every route, page, auth op, operation. The fastest
  way to see the app's full surface area.
- **`webapp/schema.prisma`** — core models: `User, Lens, Goal, Project, Task,
  Resource, InboxItem (+ InboxAttachment), Tag, Payment`; supporting models:
  `MagicLoginChallenge` (passwordless email), `ApiKey` (CLI PATs), `Feedback`
  (triage), `PushSubscription` (Web Push), `TaskSession` (focus accounting),
  `TaskUpdate` (activity log). Enums: `Plan, Priority, Size, TaskStatus
  (incl. WONT_DO), InboxItemStatus, PaymentStatus, FeedbackStatus`.
- **`webapp/src/`** — vertical per feature. Each feature folder typically has its
  page (`*Page.tsx`), server ops (`operations.ts`), and styles (`*.css`):
  - `src/app/` — shell, What Now, Inbox, triage, settings, keyboard shortcuts
  - `src/tasks/` · `src/inbox/` · `src/projects/` · `src/goals/` · `src/logbook/`
  - `src/lists/` — Today / Upcoming / Someday
  - `src/billing/` · `src/auth/` · `src/landing/` · `src/public/` · `src/onboarding/`
  - `src/components/ui/` — design-system components + `icons.tsx`
  - `src/styles/tokens.css` — design tokens (teal/amber, neutrals, dark mode)
- **Tests:** Vitest (`*.test.ts(x)`) + Playwright e2e (`webapp/e2e/`).

## Agent browser access

- For authenticated page inspection in local dev, use the dev autologin route:
  `http://localhost:4000/login?devEmail=zeljko%40dakic.com`.
- To inspect as a different local user, replace the query value:
  `/login?devEmail=name@example.com`. The local-only action creates or verifies
  that email identity, sets a temporary dev password, logs in through Wasp's
  normal email auth, and redirects to `/do`.
- Use this before Playwright/browser QA so you can examine authenticated pages
  yourself. The server-side guard lives in `webapp/src/auth/devAutologin.ts` and
  only allows the bypass when `NODE_ENV === "development"`.
- **In a dev worktree** (see `docs/DEV-WORKTREES.md`), use that worktree's
  server port, not 4000: `http://localhost:<server_port>/login?devEmail=…`.
  Run `bash webapp/scripts/dev-worktree.sh --list` to see each worktree's ports.

## Agent database access

- Local PostgreSQL 18 (Homebrew `postgresql@18`, brew service) listens on
  `localhost:5432`; connect as user `jake`, no password (`psql -h localhost`).
- Plain `psql` may not resolve on the agent's inherited PATH (a stale
  `postgresql@15` entry lingers from the Aug 2026 upgrade). Invoke it by
  absolute path: `/opt/homebrew/opt/postgresql@18/bin/psql`.
- Databases: `actionamp_dev` is the dev DB (`webapp/.env.server`
  `DATABASE_URL`), `actionamp_e2e` for e2e runs. The same server also hosts
  unrelated projects' databases — leave those alone.
- Dev worktrees get their own databases (see `docs/DEV-WORKTREES.md`); run
  `bash webapp/scripts/dev-worktree.sh --list` to find them.
- Use psql for inspection and ad-hoc queries; schema changes go through
  `wasp db migrate-dev` (see "Rules that always apply"), never hand-written DDL
  against `actionamp_dev`.

## Roadmap board (GitHub Projects)

The steering surface for stories is the **ActionAmp Roadmap** board:
<https://github.com/users/desireco/projects/5> (project number `5`, owner
`desireco`, project id `PVT_kwHN6NzOAXMArg`). Board items are usually mirrors
of GH issues in `desireco/action-amp` — the issue body is the story text.

- **List items** (flat JSON per item: `title`, `status`, `id`, `content.url`):
  `gh project item-list 5 --owner desireco --format json`
- **Status workflow:** Draft → Ready → Next → **Building** → **Review** →
  Done (plus Bugs & Enhancements, Blocked). When you pick up a story, move it
  to **Building** yourself; move it to **Review** when the work is done and
  validated and it awaits Jake's sign-off.
- **Moving an item** — ids come from the API, never from memory:
  1. `gh project field-list 5 --owner desireco --format json | jq -r '.fields[] | select(.name=="Status") | .id as $f | .options[] | "\($f)  \(.id)  \(.name)"'`
  2. `gh project item-edit --project-id PVT_kwHN6NzOAXMArg --id <item-id> --field-id <status-field-id> --single-select-option-id <option-id>`
- **Never hand-type item ids.** `PVTI_…` ids end in easily-dropped doubled
  characters (the "Mobile review site" item ends `…McSs`); a truncated id
  fails with `Could not resolve to a node`. Pipe ids straight from
  `item-list` output via jq.

## Rules that always apply

- **Roadmaps exclude future admin work.** Do not add new admin-only features,
  admin tooling, or admin implementation updates to `docs/ROADMAP.md` or the
  public website roadmap. Track that work in its feature spec, feature-catalog
  entry, and review/handoff docs instead. Existing roadmap history may remain.
- **Calm over features.** Whitespace is the point. If a section feels crowded,
  remove something. No streaks, badges, or guilt-trip UI — banned entirely.
- **Two-accent system.** Teal = system/state (completion, selection, CTA);
  Amber = rare human emphasis. Color must carry meaning — no decorative color.
- **Native, not custom.** System font only. No custom display/web font.
- **Keyboard-first.** Every action has a shortcut. Modal navigation, not sidebars
  of nouns.
- **The list is demoted.** The home screen (`/do`) is a chooser (What Now), not
  a list.
- **Structure changes start in `docs/WORKFLOW.md`.** Update it first, then
  cascade to the docs it governs (its §6 lists the cascade).
- **Wasp edits:** follow `webapp/AGENTS.md` (config-format detection, `with { type:
  "ref" }` imports, `wasp db migrate-dev --name <x>`, verify with `wasp compile`
  not `tsc`). Load the project's `wasp` skill for non-trivial Wasp work, and
  ground against the versioned docs (`webapp/AGENTS.md` §Documentation protocol).
- **Work on `main`.** Commit directly to `main` unless the user explicitly
  asks for a branch. Do not auto-create feature branches.
- **Commit as you go.** During multi-part work, commit each part as soon as
  it is fully working and can land without breaking the app — don't batch
  everything into one end-of-task commit. Keep each commit focused (one
  concern), and never commit a state that leaves the app broken.
- **Be brief.** Keep prose concise and direct, but use normal grammar and complete
  sentences. Preserve technical substance. Add detail when needed for clarity,
  security warnings, irreversible-action confirmations, or complex sequences.
- **Code review = fix loop.** When a code review is requested (explicit or
  implied), load the `code-review` skill, run the review, then **continue
  straight into implementing the fixes** — do not stop and wait for approval
  unless a fix is destructive, outward-facing, or materially ambiguous. Run
  Oxlint as part of every review that changes `webapp/`: from `webapp/`, run
  `npm run lint -- <changed source paths>` (or the full `npm run lint` when
  assessing the whole webapp). It is the default lint gate and includes the
  anti-slop rules plus correctness checks; do not bypass a new diagnostic with
  a suppression merely to make review pass. Group fixes by file; verify with
  `wasp compile` (or the feature's test command) when the change touches
  `webapp/`. Report what was reviewed, what was fixed, and what was deferred
  (with reason) in the summary. Commits follow the existing convention (direct
  to `main` unless told otherwise).

## Where to start if you're new

1. [`PRODUCT.md`](PRODUCT.md) — the thesis and tone (5 min).
2. [`docs/WORKFLOW.md`](docs/WORKFLOW.md) — the app's structure (canonical).
3. [`docs/INTERACTION.md`](docs/INTERACTION.md) — how you move through it.
4. [`docs/ROADMAP.md`](docs/ROADMAP.md) — what's left to build + the priority
   order; §Shipped records what landed and why.
5. [`webapp/main.wasp.ts`](webapp/main.wasp.ts) — the implementation's front door.
