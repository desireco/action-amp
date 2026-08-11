# Admin user management — parked execution queue

> Queue state: **active**. AU01–AU05 are complete; AU06 is next and
> dependency-ready. This does not authorize server starts, deployment, external
> Stripe writes, or production migration.
>
> Product contract: [`specs/admin-user-management.md`](specs/admin-user-management.md).

## Model routing

| Model | Use in this queue |
|---|---|
| `gpt-5.6-sol` | Schema/migration, auth, entitlement, admin authorization, deletion, integration review |
| `gpt-5.6-terra` | Pure core, bounded Wasp wrapper, page/UI, focused tests |

Run exactly one task per invocation. `gpt-5.6-sol` owns tasks that alter a
shared security, billing, auth, schema, or shell boundary. `gpt-5.6-terra`
may complete bounded tasks only after their dependencies are verified.

## Execution contract

1. Read root `AGENTS.md`, `webapp/AGENTS.md` for webapp tasks, this queue, and
   the product contract before editing.
2. Inspect `git status --short`; preserve unrelated changes. Work on `main`.
3. Edit only task Allowed paths. Stop and hand off if another path is needed.
4. Do not start/restart a server, push, deploy, run production migration, or
   mutate Stripe. A schema migration may be generated/applied only to the
   executor's local development database, with exact scope reported.
5. Run every listed check. Distinguish focused tests, compile, browser QA, and
   deployment evidence.
6. After a complete verified task, create one focused local commit only when
   authorized by the active user instruction; do not begin next task.

Handoff format:

```text
TASK: AUxx
RESULT: complete | partial | blocked
FILES: exact changed paths
CHECKS: exact commands and results
DEFERRED: intentional later work
NEXT: next dependency-ready task
```

## Queue

### AU01 — Schema, migration, and test-fixture foundation

**Status:** done
**Preferred model:** `gpt-5.6-sol` high
**Acceptable model:** `gpt-5.6-terra` xhigh
**Depends on:** none

**Goal:** add nullable account-login/manual-grant data and durable audit/event
storage without changing existing effective access.

**Allowed paths:**

- `webapp/schema.prisma`
- `webapp/migrations/<new>_admin_user_management/migration.sql`
- `webapp/src/test/mockContext.ts`

**Required inputs:**

- `docs/specs/admin-user-management.md`
- `webapp/schema.prisma`
- latest two `webapp/migrations/*/migration.sql` files
- `webapp/src/test/mockContext.ts`

**Required changes:**

- Add nullable `lastLoginAt`, `manualAccessGrant`, and `manualGrantAt` to User.
- Add `ManualAccessGrant`, `LoginEvent`, and `AdminUserAction` exactly as the
  contract defines.
- Make Payment's User relation nullable with `onDelete: SetNull`; do not drop
  payment rows or Stripe identifiers.
- Add only contract-listed query indexes after checking generated SQL.
- Extend test mock delegates for new model names; do not change production
  behavior in this task.

**Verification:**

- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`
- Inspect migration SQL and report whether it was generated only or applied to
  local development DB. Confirm no destructive/reset SQL.

**Stop condition:** schema and fixture foundation compile. Do not add auth,
entitlement, admin operations, or UI.

**Evidence:** migration `20260811182556_admin_user_management` generated and
applied only to local `actionamp_dev`; generated SQL has no reset/drop-table
operation; `./scripts/wasp-safe.sh compile` passed.

### AU02 — Central effective-access resolver and Founder-cap semantics

**Status:** done
**Preferred model:** `gpt-5.6-sol` high
**Acceptable model:** `gpt-5.6-terra` xhigh
**Depends on:** AU01

**Goal:** make Pro, Founder, and Friend grants consistently affect product
entitlement without changing Stripe billing truth.

**Allowed paths:**

- `webapp/src/billing/config.ts`
- `webapp/src/billing/operations.ts`
- `webapp/src/billing/operations.test.ts`
- `webapp/src/billing/entitlements.ts`
- `webapp/src/billing/entitlements.test.ts`
- `webapp/src/billing/entitlementHttp.ts`
- `webapp/src/billing/useEntitled.ts`
- `webapp/src/auth/patMiddleware.ts`
- `webapp/src/auth/patRoutes.ts`
- `webapp/src/app/operations.ts`
- directly corresponding focused tests

**Required inputs:**

- `docs/specs/admin-user-management.md`
- `webapp/src/billing/config.ts`
- `webapp/src/billing/entitlements.ts`
- `webapp/src/billing/operations.ts`
- `webapp/src/auth/patMiddleware.ts`
- `webapp/src/auth/patRoutes.ts`

**Required changes:**

- Create one pure effective-access resolver; all touched entitlement callers
  must use it instead of ad hoc manual-grant checks.
- Preserve admin bypass and billed-plan expiry behavior.
- Friend is unlimited, visually/source-distinct downstream, and excluded from
  Founding-100 counts; manual Founder is included.
- Update all Founding-100 count/admission reads in `billing/operations.ts` so
  manual Founder grants count and Friend grants do not.
- Add boundary tests for Free, active/expired billed Pro, billed Founder, each
  manual grant, admin, and grant removal fallback.

**Verification:**

- `cd webapp && npm test -- src/billing/entitlements.test.ts src/billing/entitlements.ops.test.ts src/billing/operations.test.ts`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** central resolver works in current permitted callers. Do not
add grant-mutating admin actions or Users UI.

**Evidence:** focused billing tests passed (47 tests), `./scripts/wasp-safe.sh
compile` passed, and `git diff --check` passed. Review found and removed the
last duplicate client-side admin bypass; Fallow reported no new issues.

### AU03 — Successful-login recorder

**Status:** done
**Preferred model:** `gpt-5.6-sol` high
**Acceptable model:** `gpt-5.6-terra` xhigh
**Depends on:** AU01

**Goal:** record genuine successful login evidence for magic and built-in auth
without turning telemetry failure into authentication failure.

**Allowed paths:**

- `webapp/src/auth/loginActivity.ts` (new)
- `webapp/src/auth/loginActivity.test.ts` (new)
- `webapp/src/auth/magicLogin.ts`
- `webapp/src/auth/hooks.ts` (new)
- `webapp/main.wasp.ts`
- directly corresponding auth tests

**Required inputs:**

- `docs/specs/admin-user-management.md`
- `webapp/src/auth/magicLogin.ts`
- `webapp/main.wasp.ts`
- current Wasp 0.25 auth-hook documentation

**Required changes:**

- Add one shared helper that updates `lastLoginAt` and creates LoginEvent.
- Call it once after magic session creation; register `onAfterLogin` for
  built-in/dev/future OAuth flows. Do not double-record magic login.
- Provider value is bounded/validated and contains no token/email payload.
- Name and log recorder write failures with safe context; preserve a successful
  session when the recorder fails.
- Test new magic login, existing magic login, hook path, recorder failure, and
  no historical backfill.

**Verification:**

- `cd webapp && npm test -- src/auth/loginActivity.test.ts src/auth/`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** successful-auth recording is complete. Do not expose any
admin directory query or UI.

**Evidence:** focused auth tests passed (21 tests), `./scripts/wasp-safe.sh
compile` passed, and `git diff --check` passed. Review found no actionable
issues; Fallow's changed-export report is a false positive for Wasp config
references and generated auth entry points.

### AU04 — Pure user-directory and account-action cores

**Status:** done
**Preferred model:** `gpt-5.6-sol` high
**Acceptable model:** `gpt-5.6-terra` xhigh
**Depends on:** AU01, AU02, AU03

**Goal:** create tenant-safe admin-only data behavior for paged users, grants,
and deletion before Wasp wrappers or React UI.

**Allowed paths:**

- `webapp/src/admin/operationsCore.ts`
- `webapp/src/admin/operationsCore.test.ts`
- `webapp/src/admin/userManagementCore.ts` (new)
- `webapp/src/admin/userManagementCore.test.ts` (new)
- `webapp/src/billing/stripe.ts`

**Required inputs:**

- `docs/specs/admin-user-management.md`
- `webapp/src/admin/operationsCore.ts`
- `webapp/src/admin/operationsCore.test.ts`
- `webapp/src/feedback/operationsCore.ts`
- `webapp/schema.prisma`

**Required changes:**

- Implement plain serializable cursor-paged rows with only authorized email
  identity fields; reject invalid filters/sorts/cursors by named errors.
- Use page user ids plus bounded aggregate queries; no per-row DB query.
- Return exact contract metric fields and `Not recorded`-capable nulls.
- Implement transactional grant/remove with AdminUserAction record.
- Implement deletion preflight and deletion core: self/admin/bad-email guards,
  read-only active-recurring-Stripe check, magic-login cleanup, local deletion,
  and detached payment audit. Stripe lookup failure is named and fails closed;
  no Stripe mutation is allowed.
- Provide an operation boundary matrix in tests proving guard-before-read or
  guard-before-mutation semantics.

**Verification:**

- `cd webapp && npm test -- src/admin/operationsCore.test.ts src/admin/userManagementCore.test.ts`
- `git diff --check`

**Stop condition:** pure behavior and its focused tests pass. Do not register
Wasp operations, modify route config, or build UI.

**Evidence:** focused admin-core tests passed (14 tests) and `git diff --check`
passed. The core validates list inputs before reads, uses page-wide groupBy
aggregates, and requires a caller-provided transaction for local mutations.

### AU05 — Guarded Wasp operations and registration

**Status:** done
**Preferred model:** `gpt-5.6-sol` high
**Acceptable model:** `gpt-5.6-terra` xhigh
**Depends on:** AU04

**Goal:** expose user list and mutations only through authenticated admin Wasp
operations with complete entity declarations.

**Allowed paths:**

- `webapp/src/admin/operations.ts`
- `webapp/src/admin/operations.test.ts` (new)
- `webapp/main.wasp.ts`

**Required inputs:**

- `docs/specs/admin-user-management.md`
- `webapp/src/admin/userManagementCore.ts`
- `webapp/src/admin/operations.ts`
- admin operation registrations in `webapp/main.wasp.ts`

**Required changes:**

- Add typed `getAdminUsers`, `grantAdminUserAccess`, `removeAdminUserAccess`,
  and `deleteAdminUser` wrappers.
- Check `context.user.isAdmin` before every core call.
- Declare every entity read/mutated so Wasp generated types and cache behavior
  remain correct.
- Test non-admin 403s and wrapper argument validation. No CLI/PAT endpoint.

**Verification:**

- `cd webapp && npm test -- src/admin/operations.test.ts`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** operations compile and authorize correctly. Do not modify
admin navigation/page files.

**Evidence:** focused wrapper checks passed (2 tests), `./scripts/wasp-safe.sh
compile` passed, and `git diff --check` passed. The test checks wrappers from
source because Wasp blocks client Vitest from importing server-only modules.

### AU06 — Users page, navigation, and action UX

**Status:** pending
**Preferred model:** `gpt-5.6-terra` xhigh
**Acceptable model:** `gpt-5.6-sol` high
**Depends on:** AU05

**Goal:** deliver calm, URL-stable admin user inspection and actions without
duplicating dashboard metrics or leaking a non-admin surface.

**Allowed paths:**

- `webapp/src/admin/AdminLayout.tsx`
- `webapp/src/admin/AdminPage.tsx`
- `webapp/src/admin/AdminUsersPage.tsx` (new)
- `webapp/src/admin/AdminUsersPage.css` (new)
- `webapp/src/admin/AdminUsersPage.test.tsx` (new)
- `webapp/src/admin/AdminPage.css`
- `webapp/main.wasp.ts`
- directly corresponding UI tests

**Required inputs:**

- `docs/specs/admin-user-management.md`
- `webapp/src/admin/AdminLayout.tsx`
- `webapp/src/admin/AdminPage.tsx`
- `webapp/src/admin/AdminFeedbackPage.tsx`
- `webapp/src/components/ui/ConfirmDialog.tsx`
- `webapp/src/components/ui/Table.tsx`

**Required changes:**

- Add nav/route and link Overview user tiles to exact Users URL filters.
- Implement search/filter/sort/paging state in URL; clear cursor when filter or
  sort changes.
- Render exact timestamps plus relative helper, null login state, expandable
  detail metrics, horizontal mobile table behavior, and accessible action menu.
- Use confirmation dialogs for grants and typed-email deletion. Disable pending
  actions; surface named server errors; invalidate/refetch relevant user and
  overview queries only after success.
- Preserve existing Overview, Funnel, Feedback layouts and no admin CLI UI.

**Verification:**

- `cd webapp && npm test -- src/admin/AdminUsersPage.test.tsx`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `git diff --check`

**Stop condition:** browser implementation is wired but unverified in an
actual browser. Do not perform deployment or change billing pages.

### AU07 — Integration, adversarial checks, and code-verified docs

**Status:** pending
**Preferred model:** `gpt-5.6-sol` high
**Acceptable model:** `gpt-5.6-terra` xhigh
**Depends on:** AU06

**Goal:** prove end-to-end safety and update only code-verified documentation.

**Allowed paths:**

- `webapp/e2e/admin-users.spec.ts` (new)
- directly corresponding test fixtures/helpers
- `docs/features/admin-user-management.md`
- `docs/features/admin-workspace.md`
- `docs/features/entitlements.md`
- `docs/features/auth.md`
- `docs/features/billing.md`
- `docs/features/README.md`

**Required inputs:**

- `docs/specs/admin-user-management.md`
- this queue
- focused tests from AU01-AU06
- existing authenticated e2e helpers

**Required changes:**

- Exercise admin route/link/filter/sort state, non-admin denial, legacy null
  login display, each grant type, Founder cap, failed confirmation, protected
  deletes, and eligible deletion outcomes.
- Use approved local dev autologin only when an already-running ActionAmp
  server exists; otherwise report browser verification unavailable.
- Update feature catalog descriptions/status only after implementation evidence.
- Do not edit `docs/ROADMAP.md` or public roadmaps.

**Verification:**

- `cd webapp && npm test -- src/admin src/billing/entitlements.test.ts src/auth/`
- `cd webapp && ./scripts/wasp-safe.sh compile`
- `cd webapp && npm run test:e2e -- admin-users.spec.ts` when authorized local
  server/test environment exists
- `git diff --check`

**Stop condition:** evidence and feature docs are truthful. No deploy, push,
or product-acceptance claim.

## Dependency graph

```text
AU01 ──┬── AU02 ──┐
       ├── AU03 ──┼── AU04 ── AU05 ── AU06 ── AU07
       └──────────┘
```

AU02 and AU03 are parallel-safe only after AU01 is committed: their allowed
paths do not overlap. All later tasks are serial because they share generated
Wasp contracts, admin operation boundaries, or documentation truth.

## Plan validation

Every contract done condition maps to AU01-AU07. Queue is **active**: AU01 is
done; AU02 and AU03 are dependency-ready but require a separate explicit task
run or whole-queue instruction.
