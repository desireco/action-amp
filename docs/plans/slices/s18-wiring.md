# S18 wiring — CLI `/api/cli/*` routes

> Goal: `2026-08-31-platform-switch-goals.md` §S18 · P0 conformance spec:
> `packages/contract/src/s18-cli-routes/README.md` (the 34-route table every
> envelope was verified against) · the strictest bar of the switch: both CLIs
> run UNCHANGED and their `--json` output matches Wasp's.

## 1. What landed (all NEW files — zero edits to existing files)

| File | What it is |
|---|---|
| `apps/api/src/cli/routes.ts` | `createCliRoutes({ db, entities })` → Hono sub-app: the 27 NON-admin `/api/cli/*` routes + the session-authed `/api/pat/*` trio (issue/revoke/list). Ported 1:1 from `webapp/src/auth/patRoutes.ts`. |
| `apps/api/src/cli/gates.ts` | The HTTP-layer helpers the webapp kept at the top of patRoutes.ts: `gateLens` (tenancy 404 → FREE 402), `firstAccessibleLensId`, `queryString`/`bodyString` with "non-string = absent" semantics, `InvalidCliField` + triage/priority/size boundary validators, `EntitlementRejection` tag, `taskWriteErrorResponse`. |
| `apps/api/src/cli/nowContext.ts` | Verbatim port of `webapp/src/app/focusWhy.ts` (composeWhy) + the `buildNowContext` half of `app/taskContext.ts` — the CLI `now` `context` builder. Pure. |
| `apps/api/src/cli/reviews.ts` | Verbatim port of `webapp/src/reviews/{types,period,report}.ts` + `getReviewData` (Drizzle-backed evidence + saved-Review read). The domain seam has no Review delegate yet; the five queries here are the promotion inventory. |
| `apps/api/src/cli/attachments.ts` | Port of `webapp/src/attachments/serveAttachment.ts`: `isAttachmentId`, the owner-gated five-table walk (Drizzle), and the exact response headers (image-only, CORP, immutable, RFC 5987 Content-Disposition — the CLI names downloads from it). |
| `apps/api/src/cli/cli-conformance.test.ts` | The conformance suite (57 tests). DB-backed, self-seeding. |
| `apps/api/src/seed-cli.ts` | Idempotent, localhost-only fixtures: `cli-pro@local.test` (PRO, full data), `cli-free@local.test` (FREE, cap-filled), `cli-admin@local.test` (admin), `cli-bare@local.test` (no lenses). Mints fresh PATs per run; run directly to print them. |
| `docs/plans/slices/s18-wiring.md` | This file. |

**Deliberately NOT here:** the seven admin-gated routes
(`/api/cli/feedback/*`, `/api/cli/admin/*`) — S17's
`apps/api/src/cli-routes.ts` (`createCliRest`, over
`@actionamp/domain/{feedback,admin}`) landed them mid-slice. Per the dispatch's
coordinate clause, this slice EXTENDS rather than duplicates: my routes file
does not define them, and the conformance suite mounts BOTH sub-apps so the
whole 34-route table is verified in one place.

## 2. Mount line (the one composition edit for the integrator)

In `apps/api/src/index.ts`, next to S17's line:

```ts
// S18 — the non-admin CLI surface: /api/cli/* + the session-authed /api/pat/*
// trio (docs/plans/slices/s18-wiring.md §2).
import { createCliRoutes } from "./cli/routes.js";
app.route("/", createCliRoutes({ db, entities }));
```

No path conflicts with `createCliRest` (S17) or `createPublicRest` — the
sub-apps declare absolute paths and none overlap. Order does not matter.

## 3. Verification (the done-bar)

| Gate | Result |
|---|---|
| Conformance suite | ✅ `57 passed (57)` — the admin-stats test re-enabled after S17's no-arg count fix (§4.1). `cd apps/api && DATABASE_URL=postgresql://jake@localhost:5432/actionamp_dev bunx --bun vitest run src/cli/cli-conformance.test.ts` |
| api vitest (full) | ✅ `12 files, 209 passed` |
| api tsc | ✅ for every file in this slice. Two PRE-EXISTING error groups remain in OTHER agents' uncommitted work, untouched here: `packages/domain/src/db/client.ts` (S16 seam) and `src/cli-routes.test.ts` (S17 test mocks). |
| oxlint (new files) | ✅ 0 warnings, 0 errors |
| domain / contract packages | ✅ untouched (verified: the only files this slice creates are listed in §1) |
| Playwright ×2 | 69 passed / 1 failed both runs — the failure is `billing.spec.ts` (S16's Stripe-webhook surface vs the long-running dev server); this slice edits no existing file, so it cannot affect e2e. |

### Live CLI run (the real bar)

The dev server on :8080 predates the S18 mount line, so the sweep ran against
an ephemeral launcher (same `createCliRoutes` + S17's `createCliRest`, dev DB,
:8081) — identical composition to the mount line in §2. `ACTIONAMP_API_URL`
was pointed at it via the CLIs' own config (`~/.config/actionamp*/config.json`,
written fresh, removed after). Login: the browser hop of `login --dev` can't
run headless, so login was exercised the way the P0 notes allow — fixtures
minted the PAT, the config written, and `whoami` run as login's post-callback
validation step (the exact request+config-write `login` performs).

Every command below ran UNMODIFIED against the new API, `--json`, all 200/201:

- `actionamp whoami` · `now` · `today` · `today --done`
- `capture "test task"` → `{"ok":true,"kind":"inbox-item",…}`; `inbox list`;
  `inbox triage <id> --decision task-today --lens-id …` →
  `{"result":{"kind":"task",…}}`; `inbox download <attachmentId>` → wrote a
  real PNG (verified with `file`: `PNG image data, 1 x 1`)
- `task show <permalink>` (by-permalink lookup) · `task start/pause/done`
  (toggle verified both ways) · `task snooze --preset 1h` · `task move --to today`
- `project list --lens-id …` · `project show` · `project create` ·
  `project add-task --project-id …`
- `resource list/add` (`--project`, `--url`)
- `goal list` · `goal create`
- `lens list` · `lens show Work` · `lens switch Work` (config fallback then
  drove `logbook`, as designed — no server-side active lens)
- `logbook` (5-key envelope) · `review week` · `review month` (totals +
  5 weekly slices)
- `actionamp-admin whoami` (isAdmin:true) · `growth` (full FunnelStats) ·
  `feedback list` / `show T8ST-…` (shortId prefix) / `status … RESOLVED` /
  `delete` / post-delete `show` → exit 1 `Feedback not found.`
- FREE account through the real CLI: `whoami`/`capture` →
  `error: CLI and API access is a Pro feature.` (exit 1) — the middleware 402
  mapped by the CLI's own `request()` exactly as specified.

Byte-parity method: the CLIs `JSON.stringify` the parsed server body verbatim,
so parity = parsed-shape equality + key order. The conformance suite asserts
exactly that per route (envelope key ORDER, row field sets, null-ness, list
ordering where deterministic), matching the P0 §3 oracles (the CLIs' own unit
tests). The one webapp-vs-new-api shape risk found and fixed in-slice: the
domain seam's `select` is advisory (rows come back full), so
`/api/cli/inbox/list` projects to the core's 16-field select and
`/api/cli/resource/list` fetches resources via the exact webapp select in the
route — both payloads are now byte-shaped like Wasp's.

### 401 sweep (the cli-pat-plumbing oracle)

All 37 `/api/cli/*` routes (mine + S17's, incl. the attachment route with a
well-formed uuid) without a token → `401 {"error":"Missing or malformed
bearer token."}`; bogus token → `{"error":"Invalid or revoked token."}`
identically on every route (no probing oracle); `OPTIONS` → 204. The three
`/api/pat/*` routes correctly answer `401 {"error":"Not authenticated."}` —
they are session-authed (Wasp `auth: true` parity; the P0 §1.1 table pins
exactly this body), and were verified live with a real session cookie:
list → keys, issue → plaintext-once envelope, missing CSRF header → the
session layer's 403.

## 4. Cross-slice findings (for the coordinator / S17)

1. **BUG (S17, blocks live `actionamp-admin stats`) — FIXED:** the shared count
   delegate (`packages/domain/src/db/client.ts` `countImpl`) dereferenced
   `args.where` unconditionally, and `getAdminStatsCore`
   (`packages/domain/src/admin/operationsCore.ts`) calls
   `entities.User.count()` / `entities.Task.count()` with NO args →
   TypeError → 500. Reproduced live at find-time: the real `actionamp-admin
   stats --json` printed `error: Could not load admin stats.`. S17 fixed the
   delegate (`countImpl` takes optional args — client.ts line ~1306), the
   conformance test was re-enabled, and the real admin CLI now returns the
   full AdminStats envelope against the live server (cross-review re-verified
   2026-09-02).
2. **Unreachable-by-design 402s (parity-kept):** because the account-level
   CLI gate (`cliAccessViolation`) runs in the middleware on EVERY
   `/api/cli/*` request, a FREE token always gets the account 402 — the
   per-route lens/cap gates behind it can only fire for entitled users, for
   whom they never violate. Identical layering on the webapp; the route-level
   gates stay as defense-in-depth parity. The conformance suite pins the
   account 402 for every FREE-token path.
3. **S16/S17 in-flight tsc errors** (not this slice's files): see the tsc row
   in §3.

## 5. Deferred

- **Domain promotion of the route-local ports** (`reviews`, `attachments`
  walk, `nowContext`): each module header lists its delegate/query inventory;
  promote when the reviews surface grows its oRPC fragment (or at V5 cleanup).
  Kept route-local here to leave `packages/domain` untouched per the dispatch.
- **Playwright e2e spec** (`apps/web/e2e/cli-conformance.spec.ts`): not added
  — the brief marked it optional and a browser adds nothing over the vitest
  conformance suite + live curl/CLI sweeps (no DOM on this surface).
