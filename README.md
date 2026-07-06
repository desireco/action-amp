# ActionAmp

> A focus app whose thesis is: **stop optimizing capture, start optimizing the
> decision.** Every other todo app opens to a list. ActionAmp opens to *one task*
> — the next thing that matters — and hides the rest.

The home screen isn't a list. It's a decision.

Built for anyone overwhelmed. ADHD is the design muse, not the marketing target.
GTD-compatible (the *workflow*) with a flavor of PARA (the *storage shape*) —
except **Areas are replaced by Goals**, because Goals are active where Areas are
passive.

---

## Repo layout

This repo holds **two things**:

| Path      | What it is                                                                 |
|-----------|----------------------------------------------------------------------------|
| `docs/`   | **The thinking.** Strategy, spec, design system, mockups, research.        |
| `webapp/` | **The implementation.** A [Wasp](https://wasp.sh) app (React + Node + Prisma). |

```
action-amp/
├── PRODUCT.md            # Product thesis, users, tone, strategic principles
├── DESIGN.md             # Design DNA (Things reference) — canonical design system ref
├── docs/                 # All strategy, spec, mockups, research (see Table of Contents)
│   ├── mockups/          # 20 standalone HTML prototypes (visual + interaction R&D)
│   ├── wasp-ref/         # Raw copies of official Wasp docs (versioned, for grounding)
│   └── *.md              # The canonical docs (WORKFLOW, INTERACTION, TRIAGE, …)
├── webapp/               # The Wasp app
│   ├── main.wasp.ts      # Wasp config: routes, pages, auth, operations
│   ├── schema.prisma     # Prisma data model
│   ├── src/              # Feature code (vertical: src/tasks/, src/inbox/, …)
│   └── AGENTS.md         # Wasp-specific conventions for agents (mechanics)
└── AGENTS.md             # Agent-facing index: which doc to read for which task
```

> `DESIGN.md` (root) is the *Things* DNA reference. ActionAmp's decided design
> system lives in `docs/DESIGN-SYSTEM.md` (mirrors `tokens.css`).

---

## Table of Contents

### The product (root)

| Doc | Subject | Authority |
|-----|---------|-----------|
| [`PRODUCT.md`](PRODUCT.md) | Users, purpose, brand register, tone of voice, strategic principles, visual identity | Product framing |
| [`DESIGN.md`](DESIGN.md) | Design DNA extracted from *Things* — colors, type, spacing, elevation, components, do's & don'ts | Design-system **reference** (not the final identity) |

### docs/ — the thinking

**🔵 Canonical — the source of truth on conflicts.** When these disagree with
other docs, these win.

| Doc | Subject | Authority for |
|-----|---------|---------------|
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | App's area structure, what lives where, how items move between areas. Three modes (Work/Plan/Review), five areas, Lens scoping, locked decisions. | **Structure** — overrides FEATURES/PAGES/DATA-MODEL/TRIAGE on structural conflicts |
| [`docs/INTERACTION.md`](docs/INTERACTION.md) | The modal interaction model — navigation is a *state* (Plan/Do/Review × Task/Project/Goal), not a sidebar. Gesture + keyset maps. | Interaction architecture |
| [`docs/TRIAGE.md`](docs/TRIAGE.md) | The triage loop, the co-author UI, the canonical keymap (Enter/t/u/p/g/Del). | Triage keymap + UI |

**🟡 Spec / reference (align with canonical; flagged when predating a refactor).**

| Doc | Subject |
|-----|---------|
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature-level reference (F-numbered list). Status note defers to WORKFLOW on structure. |
| [`docs/PAGES.md`](docs/PAGES.md) | Pages & routes, organized into Work/Plan/Review clusters. |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Data model + triage flow (GTD + PARA; Areas → Goals). |
| [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) | The design philosophy: GTD workflow + PARA storage shape. |
| [`docs/modal-approach.md`](docs/modal-approach.md) | The four overlay patterns (popover/sheet/modal/…) and when to use each. |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | ActionAmp's decided design system — teal/amber accents, lens identity, token map. Mirrors `webapp/src/styles/tokens.css`. |

**🟢 Go-to-market & pricing.**

| Doc | Subject |
|-----|---------|
| [`docs/MARKETING.md`](docs/MARKETING.md) | Public marketing site — wedge, conversion, page roles. |
| [`docs/PUBLIC-PAGES.md`](docs/PUBLIC-PAGES.md) | Spec for every public surface (landing, onboarding, legal). |
| [`docs/PRICING.md`](docs/PRICING.md) | Pricing & billing strategy (decisions + reasoning). |
| [`docs/BILLING-INTEGRATION.md`](docs/BILLING-INTEGRATION.md) | Stripe billing **implementation** (architecture, schema, webhook, entitlement). |

**📋 Planning & tracking.**

| Doc | Subject |
|-----|---------|
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Historical narrative of completed workflow-refactor work; non-spec'd odds and ends. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Strategy queue + priority order; what to build next and why. |

**🔬 Research (decisions already made; context for *why*).**

| Doc | Subject | Verdict |
|-----|---------|---------|
| [`docs/research/wasp-research.md`](docs/research/wasp-research.md) | Can we build the API with wasp.sh? | **Yes, proceed.** |
| [`docs/research/wasp-report.md`](docs/research/wasp-report.md) | Review of the project's Wasp skills after building the full app. | Improvement report |
| [`docs/research/deployment-research.md`](docs/research/deployment-research.md) | Where to host (Wasp + VoidZero & Bun). | **Fly.io or Railway.** Cloudflare is client-only. |

**🎨 Mockups — `docs/mockups/`**

Standalone HTML prototypes for visual + interaction R&D. Open [`docs/mockups/index.html`](docs/mockups/index.html) for the workbench gallery. Notable:

| File | What it explores |
|------|------------------|
| `mode-zoom-unified.html` | The unified Mode × Zoom spine + working state (the app's core interaction). |
| `focus-switch-nav.html` | The Work/Plan/Review expanding-section nav (latest nav prototype). |
| `capture-palette.html` | The `⌘K` capture palette with NL parsing. |
| `triage-coauthor.html` | Canonical triage layout — triage as *co-authoring the spec*. |
| `plan-today-card.html` | Today as the Plan-mode card (cap, grouping, done section). |
| `landing-home.html` | Marketing landing page. |
| `mobile-gesture-modal.html` / `mobile-coach.html` | Mobile gestures + first-launch coach. |
| `project-anchor-layouts.html` | Project/Goal "Open →" anchor navigation. |
| `teal-amber-system.html` / `accent-candidates.html` | The two-accent (teal/amber) system + accent exploration. |
| `interaction-approaches.html` + `approach-{a,b,c}-*.html` | Three early interaction approaches (zoom-pan / focus-blur / time-adaptive). |

**📚 Raw references — `docs/wasp-ref/`**

Verbatim copies of official Wasp docs, pulled 2026-06-15 (v0.24). Used to ground
agent knowledge against the project's exact Wasp version. See `docs/wasp-ref/introduction_introduction.md`.

### webapp/ — the implementation

A Wasp (`>=0.24`, TypeScript Spec) app: **React 19 + Node + Prisma**.

| Path | What |
|------|------|
| [`webapp/main.wasp.ts`](webapp/main.wasp.ts) | Wasp config — every route, page, auth op, operation. Start here to see the app's surface area. |
| [`webapp/schema.prisma`](webapp/schema.prisma) | Data model: `User, Lens, Goal, Project, Task, Resource, InboxItem, Tag, Payment` + enums. |
| [`webapp/src/`](webapp/src/) | Feature code, organized **vertically per feature**: `src/tasks/`, `src/inbox/`, `src/projects/`, `src/goals/`, `src/lists/` (Today/Upcoming/Someday), `src/logbook/`, `src/billing/`, `src/auth/`, `src/landing/`, `src/public/`, `src/onboarding/`. |
| `webapp/src/components/ui/` | The design-system components (Button, Card, CompletionCircle, TriageCard, WhatNowCard, ModeDial, LensSwitch, …). |
| `webapp/src/styles/tokens.css` | Design tokens (teal/amber + neutrals + dark mode). |
| [`webapp/AGENTS.md`](webapp/AGENTS.md) | **Wasp mechanics** for agents — config format, imports, operations, migrations, troubleshooting. |

**App routes** (from `main.wasp.ts`): `/` (landing) · `/app` (What Now — home) ·
`/app/inbox` · `/app/inbox/review` (triage) · `/app/today` · `/app/upcoming` ·
`/app/someday` · `/app/projects` · `/app/goals` · `/app/logbook` · `/app/tasks/:id` ·
`/app/settings` · `/app/settings/billing` · `/welcome` (onboarding) · `/design-system` ·
`/about` · `/founding-100` · `/login` · `/signup` · legal pages.

---

## Quick start (the app)

```bash
cd webapp
wasp db migrate-dev        # apply the database schema (dev = SQLite)
wasp start                 # → http://localhost:3000
```

Requires Node.js (LTS) and Wasp (`npm i -g @wasp.sh/wasp-cli@latest`).
See [`webapp/README.md`](webapp/README.md) and [`webapp/AGENTS.md`](webapp/AGENTS.md) for Wasp conventions.

**Tests:** `npm test` (Vitest) · `npm run test:e2e` (Playwright).
**Deploy:** `npm run deploy` (Railway; see `docs/research/deployment-research.md`).

---

## Working on this repo

- **Writing code in `webapp/`?** Read [`AGENTS.md`](AGENTS.md) first — it routes
  any task to the right doc(s), and [`webapp/AGENTS.md`](webapp/AGENTS.md) covers
  the Wasp mechanics you must follow on every edit.
- **Changing structure (areas, modes, destinations)?** `docs/WORKFLOW.md` is
  canonical and overrides the feature/page/data-model docs. Update it first,
  then cascade (see its §6).
- **Picking up what's next?** [`docs/BACKLOG.md`](docs/BACKLOG.md) is the single
  source of truth for open work.
