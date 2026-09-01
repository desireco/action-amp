# ActionAmp Platform Switch — Plan v3

> Status: **framework decision made (2026-09-01, Jake)** after the link-garden
> spike (`docs/plans/spike-link-garden-report.md`): **Svelte 5 confirmed**;
> **Hono + oRPC + Drizzle** replaces Typebase for `apps/api` — the measured
> regen-restart loop and 0.1.x bundle issues outweigh the generated-client
> convenience, oRPC keeps the same typed client with zero codegen, and
> `bun --hot` gives instant-reload dev. Premise otherwise unchanged: the
> active user base is tiny — the primary daily user is Jake — so there is
> **no migration program**, just a rebuild against the same database and one
> clean switch. Date: 2026-08-31, decision addendum 2026-09-01.

---

## 1. What this plan delivers

The point of this effort is not the new stack for its own sake. It delivers
two things:

1. **A switch runbook** — a scripted, rehearsed, reversible procedure that
   moves ActionAmp from Wasp to the new stack in one move (§6). Because the
   new app runs against the *same PostgreSQL database*, a switch involves
   **no data migration at all** — it is a deployment and domain flip.
2. **Replaceable layers** — the architecture keeps every layer
   independently switchable *after* this move, cheaply:

| Layer | Switch to | Cost when the time comes |
|---|---|---|
| Frontend (`apps/web`) | Imba, Vue, Solid, … | rewrite UI only; `packages/contract` is the sole API surface |
| API (`apps/api`) | Hono ↔ Typebase ↔ Elysia | re-implement thin endpoints; logic lives in `packages/domain` |
| Runtime/host | Railway → Fly/other | redeploy; no code change |
| Database | Railway PG → Neon (§5 P3) | `DATABASE_URL` swap + pooling |

And one property that makes trying this cheap: **the build never modifies
`webapp/`**. Abandoning the plan at any point = deleting `apps/` and
`packages/`. Zero cleanup, zero risk to the running product.

---

## 2. Premise — why a single switch is right

- Few active users, and the main daily user is Jake himself. The asset to
  protect is **the data and the momentum**, not zero-downtime continuity.
- **Production runs exactly one backend from today until the switch.** The
  new stack is built and verified entirely against a **staging copy** of
  production; it touches the production database for the first time on
  switch day, when it *becomes* the backend. No read-only prod roles, no
  dogfooding against prod, no second writer — ever.
- Existing sessions and CLI tokens keep working across the switch (§5, M1),
  so most users notice nothing at all.
- Consequently: no dual-run period, no routing flips, no write-access ladder,
  no per-surface cutovers, no campaign gating. Announce, flip, verify.

If the user base were large, v2's phased strangler would be the right design.
It isn't, so it isn't.

---

## 3. Target architecture

Unchanged in substance from v1/v2; the escape hatches are package boundaries:

```text
apps/web            SvelteKit — routing, rendering, interaction
   │  imports ONLY packages/contract
packages/contract   request/response types + typed client
   │
apps/api            Typebase or Hono (Phase 0 decides) on Bun
   │  calls ONLY packages/domain for logic
packages/domain     the 13 operationsCore.ts files, pure, I/O-free
   │
Drizzle → PostgreSQL (Railway, existing database) → optionally Neon later
```

`tokens.css` carries over untouched (no Tailwind by default). The 13
`operationsCore.ts` files (5,423 lines) already contain nearly all business
logic, and their tests mock the `entities` seam — so each core keeps its
signatures and tests, and only the seam is re-bound to Drizzle behind a thin
data-access layer. The Phase 0 pilot fixes that pattern; only one scheduled
job exists (`sendDailyTodayReminder`).

---

## 4. Invariants

* **I1 — `webapp/` is never modified.** Wasp keeps running, untouched, as
  the product and the rollback, until §5 P3.
* **I2 — Zero schema changes before the switch.** The new app runs on the
  existing schema exactly. This makes rollback = domain flip only, and it
  removes the entire class of dual-tooling schema drift. Schema evolution
  resumes *after* the switch, under Drizzle.
* **I3 — Prisma owns the schema until handover** (P3). If product work needs
  a migration during the build, it goes through Prisma as usual, followed by
  a `drizzle-kit pull` regen. Watch the known gotcha: Prisma's
  `uuid()`/`cuid()` defaults and `updatedAt` live in the *client*, not the
  database — introspection won't show them, so the domain package must
  supply them on writes.
* **I4 — Parity, not redesign.** Port behavior per `docs/INTERACTION.md` and
  the existing Playwright suite. Improvements come later, as product work.
* **I5 — A same-day `pg_dump` exists before switch day** and before any
  other operation that touches production.

---

## 5. Phases and milestones

Effort in **focused days** (one person-day with agent support).

### Phase 0 — Spike & decision (3–4 days, timeboxed one calendar week)

Identical to v2's Phase 0; this is where "not 100% sure we'll do this" gets
resolved for the cost of a few days:

1. Monorepo skeleton (`apps/web`, `apps/api`, `packages/domain`,
   `packages/contract`, npm workspaces). `webapp/` untouched.
2. Snapshot tooling (`pg_dump` prod → local/staging restore). The new stack
   never connects to production (single-backend rule), so no read-only prod
   role is needed.
3. `drizzle-kit pull` against the snapshot; diff report vs
   `webapp/schema.prisma`, especially the client-side-defaults gotcha (I3).
4. Two `operationsCore` files into `packages/domain`, tests green.
5. **Typebase arm:** `tasks.list` + one write against the snapshot; generated
   client; Bun; isolated Railway deploy pointed at staging.
6. **Control arm:** same endpoints in Hono + Drizzle (~half a day).
7. Drift-check script (regen + `git diff --exit-code`) in CI.
8. **Decision doc.** Hard gates: custom Wasp-compatible auth possible without
   better-auth's schema; Bun clean on Railway; schema adequate. Default on a
   tie or gate failure: **Hono + oRPC + Drizzle**.

Exit: go/no-go. No-go costs a week and deletes cleanly.

### Phase 1 — Rebuild to parity (~25–35 days across milestones)

Nothing user-facing ships. Milestones are internal checkpoints, each ending
in a stable, parkable state:

| Milestone | Done means | Est. |
|---|---|---|
| **M1 — Machinery** | all 13 cores in `packages/domain`; contract types for every surface; **auth validates existing Wasp session cookies and CLI PATs** against the same tables; read endpoints work locally on a snapshot | 3–5 |
| **M2 — Core loop** | Capture (⌘K + NL parse), Inbox/triage, What Now/Focus, Today — Jake could run his whole day in the new app | 6–9 |
| **M3 — Structure** | Tasks/lists (Upcoming/Someday, row editors), Projects, Goals, Lenses, Logbook, Search, Resources | 8–12 |
| **M4 — The rest + auth issuance** | Settings, notifications/push (VAPID keys carry over), PWA/share target, onboarding, billing + entitlements + Stripe webhooks, admin dashboard + admin routes, scheduled job; **new app issues Wasp-format sessions** (passwordless flow via Resend per `docs/EMAIL-INTEGRATION.md`) — Wasp accepts those sessions unchanged | 6–9 |
| **M5 — Verification** | full e2e suite green against a refreshed prod snapshot; Jake's staging dogfood week complete; switch rehearsal executed and timed | 3–5 |

**Dogfooding happens on staging, not production.** The staging environment
runs a refreshed production snapshot, so Jake exercises the new app against
his real data — capturing, triaging, running focus sessions — without
production ever growing a second backend. Refresh the snapshot at the start
of the dogfood week and again before the rehearsal. Since Jake is the main
active user, one realistic week of his staging use de-risks everyone else's
cutover.

**Parity bar.** 100% for everything a real user touches in a normal week
(cross-checked against usage analytics). The long tail (rare admin corners,
edge surfaces) may land within two weeks *after* the switch, with dormant
Wasp as Jake's personal stopgap. This bar is what keeps the build weeks, not
months.

### Phase 2 — Switch day (1 day, §6)

### Phase 3 — After (≈1 week of cleanup, spread out)

1. Wasp stays **stopped-but-startable for 2–4 weeks** as the rollback; then
   delete the service, `webapp/`, and Prisma.
2. **Schema handover:** first Drizzle migration happens only now; Drizzle
   becomes the source of truth.
3. Update the doc cascade (`AGENTS.md`, `docs/ROADMAP.md` §Shipped, feature
   catalog, this plan's outcome).
4. Optional, separate project: **Neon** — pooled `DATABASE_URL` swap in a
   quiet window; verification checklist (row counts, sequences, indexes,
   billing refs); rollback = repoint the URL. Bonus afterwards: Neon
   branching becomes the staging mechanism.

**Calendar guidance:** if Phase 0 says go, finish the build and switch
*before* the September campaign ramps — every week of delay adds users to
the side of the switch that's getting retired. The build itself is invisible
to users, so it doesn't compete with campaign work until switch day; pick a
quiet hour for the flip.

---

## 6. The switch runbook

**Preconditions (all must be true):** M5 exit — e2e green on a refreshed
snapshot; Jake's staging dogfood week complete; rollback script tested;
same-day production backup taken; new stack deployed and warm; Stripe
test-mode dry run of webhook handling passed.

**The switch, in order:**

1. **Announce** — email to users, honest and short: "We're switching the
   platform ActionAmp runs on this week. Your account and data are untouched.
   If anything looks off afterward, reply."
2. **Freeze writes** — put Wasp in maintenance mode (or simply pick an hour
   with no active sessions per analytics). Minutes, not hours.
3. **Final backup** — `pg_dump`, verified restorable.
4. **Warm check** — new stack healthy on its Railway service; smoke: health
   endpoint, one read, one write on a scratch record.
5. **Flip the domain** — DNS/service swap: `actionamp.com` (and the app
   subdomain) → new stack. This is the entire "migration."
6. **Stripe** — update the webhook endpoint URL to the new stack.
7. **Verify on the real domain** — passwordless login (email code + link),
   capture, complete a task, lists, CLI login + one `--json` command, billing
   portal, push notification opt-in. Existing sessions from before the flip
   must still work (M1 compatibility).
8. **Unfreeze** — done. Most users never noticed; nobody was logged out.
9. **Watch** — 48h of close log watching; Wasp stays stopped-but-startable.

**Rollback (pre-scripted, minutes):** flip the domain back to the Wasp
service (untouched the whole time, I1), point the Stripe webhook back, note
the switch window in case of write conflicts. Restore from step 3's backup
only if data damage is suspected — rare, since both stacks share one schema
and one database. Trigger conditions to roll back: login broken for a new
user, write errors, billing misbehavior.

**What makes this safe:** no data moves (same DB), no schema changed (I2),
sessions and PATs survive (M1/M4), Wasp is intact and startable (I1), and the
rehearsal in M5 timed every step.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| We decide not to do this at all | Phase 0 costs days and deletes cleanly; `webapp/` untouched throughout |
| Parity gaps surface post-switch | e2e on prod snapshots; parity bar; dormant Wasp as stopgap; 2-week long-tail window |
| Auth incompatibility (sessions/PATs) | M1 validates real Wasp cookies early; M4 issuance is Wasp-format; verified again in rehearsal |
| Silent data corruption (client-side defaults) | Phase 0 diff report; domain package owns those values on write |
| Billing breakage | Stripe test-mode dry run; webhook flip is one URL; rollback is one URL |
| Switch-day surprise | Full rehearsal in M5, timed; quiet-hour flip; 48h watch |
| Build stalls mid-way (the real risk) | Milestones are parkable; nothing user-facing depends on the build; abort = delete two folders |

---

## 8. What changed from v2

| v2 | v3 | Why |
|---|---|---|
| Strangler migration: dual backends, routing flips, write ladder, per-surface cutovers | Single rebuild, single switch day | Tiny user base; the main user is Jake; dual-run protects against a risk that doesn't exist at this scale |
| Auth = read-only bridge, issuance deferred to a late phase | New app validates *and issues* Wasp-format sessions by M4 | No coexistence period to bridge across; sessions surviving the switch are a feature, not a hazard |
| Campaign gates on every phase | One line: switch before the campaign ramps; build is invisible meanwhile | With no user-visible intermediate states, there's nothing to gate |
| 14-day warm rollback + batched deletions | Wasp stopped-but-startable 2–4 weeks; rollback = domain flip | Same insurance, less ceremony |
| Full feature parity required | Parity bar: 100% of daily-use surfaces, long tail within 2 weeks post-switch | Few users ⇒ the honest scope cut that keeps the build tractable |
| Routing/proxy mechanics workstream | Deleted | A domain flip doesn't need a routing layer |

Kept from v2 unchanged: the contract/domain package boundaries, the Phase 0
bake-off with Hono default, the Prisma-defaults gotcha, snapshot discipline,
Stripe webhook care, Neon as a separate later project.
