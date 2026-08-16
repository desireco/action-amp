---
kind: task
status: draft
priority: P3
created: 2026-08-16
---

# Anti-slop lint cleanup (webapp)

The [anti-slop Oxlint plugin](https://www.npmjs.com/package/@oxlint/plugins) is
installed in `webapp/` (`tools/oxlint/anti-slop/`, config in
`webapp/oxlint.config.ts`, run via `npm run lint`). The first full scan on
2026-08-16 produced **690 findings across 143 files**. This doc is the cleanup
backlog: findings grouped by rule (similar items adjacent), organized into
batches that can be resolved one at a time.

None of these are known bugs — they're type-safety hygiene. Work the batches in
order, or cherry-pick; each is independent enough to land alone.

## Regenerate the counts

After any batch lands, refresh the tables below from live output (counts are
recorded, line numbers deliberately are not — they drift immediately):

```bash
cd webapp
npx oxlint 2>&1 | grep 'error anti-slop' | wc -l   # total
npx oxlint 2>&1 | grep 'error anti-slop' \
  | sed 's/^\(.*\):\([0-9]*\):\([0-9]*\): error anti-slop(\([^)]*\)).*/\4|\1/' \
  | sort | uniq -c | sort -k2                       # per rule|file
```

## Batches

Ordered by risk/effort: mechanical first, architectural last. Counts are the
original scan and overlap where rules fire on the same lines (B6–B8 assume B3/B4
already handled the hotspots).

| # | Scope | ~Findings | Risk | Verify with |
|---|-------|-----------|------|-------------|
| B1 | `SAFETY:` comments on type assertions in **test files** | 131 | trivial (comment-only) | vitest on touched files |
| B2 | Chained `as X as Y` assertions outside hotspots | 14 | low | vitest + lint |
| B3 | **`src/billing/webhook.ts`** — parse at boundary | 74 | medium (payment code) | `webhook.test.ts`, lint |
| B4 | **`src/auth/patRoutes.ts`** — typed CLI request parsing | 64 | medium | auth tests, `cli/` smoke |
| B5 | Conditional empty-object spreads → built objects | 22 | low | feature vitest suites |
| B6 | Widen + unsafe-dictionary pairs in src (`satisfies`, named types) | ~105 | medium | per-file vitest, `wasp compile` |
| B7 | `typeof` chains → narrowing / discriminated unions / parsing | ~86 | medium | per-file vitest |
| B8 | Unknown-parameter tail → explicit param types | ~38 | low-medium | vitest |
| B9 | Module mocking → dependency injection in tests | 44 | high (architectural) | full vitest for touched dirs |
| B10 | Return-type + object-param tail | 9 | low | lint |

Rules with **zero** findings (nothing to do): `no-widen-then-assert`,
`no-reflect-apply`, `no-reflect-get`, `no-shape-in-symbol-names`,
`no-unknown-type-aliases`.

`cli/` and `admin-cli/` are separate packages and were **not** scanned — extend
the config there if wanted (follow-up, not part of these batches).

### Batch notes

- **B1** — every assertion in a `*.test.ts(x)` gets a `// SAFETY:` comment
  stating the checked invariant (e.g. `// SAFETY: mock returns Partial<Task>;
  all readers only touch these fields`). Comment-only; zero behavior change.
  Biggest single count drop.
- **B2** — collapse `x as A as B` into one assertion (usually the outer one is
  enough after narrowing) or replace with proper narrowing. Mostly tests.
- **B3** — the Stripe webhook is the densest file (7 different rules). The fix
  is boundary parsing: define event/request shapes once at the top, parse
  incoming payloads into them, let handlers take the parsed types. Clears
  assertions, dictionaries, chained casts, `typeof`s, and return types in one
  pass. Highest correctness value — it's payment code.
- **B4** — the CLI API surface: 40 untyped params + 12 `typeof` guards. Define
  per-route request types (or small parsers) so `req` fields are typed once at
  the boundary instead of re-checked per handler.
- **B5** — the `...(cond ? { key: val } : {})` Prisma-where idiom in
  `operationsCore.ts` files. Fix: build the object, assign keys conditionally,
  and give it a named/satisfied type.
- **B6** — `Record<string, unknown>` data/where objects and widened bindings,
  mostly in `operationsCore.ts` files. Fix with named owner types,
  Prisma-generated input types, `satisfies`, and `as const` for the rank/offset
  maps (`PRIORITY_RANK`, `SIZE_RANK`, `SNOOZE_OFFSETS`). The two rules usually
  fire together — fix per file, not per rule.
- **B7** — `typeof x === "..."` chains in shared utilities. Prefer narrowing,
  discriminated unions, or parsing at the I/O boundary over ad-hoc checks.
- **B8** — exported functions with untyped params; mostly resolved as a side
  effect of B3/B4/B6 — sweep the remainder.
- **B9** — `vi.mock` → inject the dependency (props, a service module, or a
  faithful fake). Architectural; do per directory. If a specific mock is
  genuinely the right call, restructure so the seam is explicit rather than
  suppressing the rule.
- **B10** — stragglers; fold into whichever batch touches the same files.

### Ground rules (from the anti-slop skill)

- Do not suppress rules, lower severity, or add unsafe casts to make a batch
  pass — that launders the finding instead of fixing it.
- Prefer inference, `as const`, `satisfies`, named owner contracts, and
  boundary parsing.
- Commit each batch separately (repo rule: commit as you go, direct to `main`).
- Never commit a state where `npm run lint` count went up.

## Task list (by rule, files ranked by count)

### require-safety-comment-for-type-assertion — 282 findings, 85 files

Test files (~131) are batch **B1**; the rest are **B3/B4/B6** territory.

| Count | File |
|-------|------|
| 37 | `src/billing/webhook.ts` |
| 13 | `src/tasks/TaskDetailPage.tsx` |
| 13 | `src/tasks/operations.test.ts` |
| 13 | `src/onboarding/operations.test.ts` |
| 12 | `src/components/ui/usePropertyKeys.test.tsx` |
| 10 | `src/inbox/operations.test.ts` |
| 9 | `src/share/shareCapture.test.ts` |
| 8 | `src/auth/patRoutes.ts` |
| 7 | `src/lenses/LensesPage.test.tsx` |
| 7 | `src/attachments/serveAttachment.test.ts` |
| 6 | `src/shared/imageFiles.test.ts` |
| 6 | `src/billing/webhook.test.ts` |
| 5 | `src/tasks/operationsCore.test.ts` |
| 5 | `src/reviews/operationsCore.ts` |
| 5 | `src/inbox/triagePropertyFields.ts` |
| 5 | `src/inbox/operations.capture.test.ts` |
| 5 | `src/auth/sessionCookie.ts` |
| 4 | `src/simpleLists/operations.test.ts` |
| 4 | `src/components/ui/FocusMode.test.tsx` |
| 4 | `src/billing/entitlements.ts` |
| 4 | `src/app/BillingPage.tsx` |
| 3 | `src/tasks/taskPropertyFields.ts` |
| 3 | `src/simpleLists/SimpleListPage.test.tsx` |
| 3 | `src/inbox/TriagePage.test.tsx` |
| 3 | `src/app/operations.test.ts` |
| 3 | `src/app/AppShell.test.tsx` |
| 3 | `src/analytics/operationsCore.ts` |
| 3 | `src/analytics/eventApi.ts` |
| 3 | `src/admin/userManagementCore.test.ts` |
| 3 | `src/admin/AdminUsersPage.tsx` |
| 2 | `src/reviews/ReviewPage.tsx` |
| 2 | `src/projects/operations.test.ts` |
| 2 | `src/onboarding/operations.ts` |
| 2 | `src/onboarding/OnboardingPage.tsx` |
| 2 | `src/inbox/operationsCore.ts` |
| 2 | `src/components/ui/OverflowMenu.tsx` |
| 2 | `src/components/ui/GroupedList.tsx` |
| 2 | `src/components/ui/caretCoords.ts` |
| 2 | `src/components/ui/AttachmentThumbs.tsx` |
| 2 | `src/components/design/DesignSystemPage.tsx` |
| 2 | `src/billing/stripe.ts` |
| 2 | `src/auth/sessionAuth.ts` |
| 2 | `src/auth/loginActivity.ts` |
| 2 | `src/app/useKeyboardShortcuts.test.tsx` |
| 2 | `src/app/PatSettingsPage.tsx` |
| 2 | `src/app/NextPage.tsx` |
| 2 | `src/analytics/StatCounter.tsx` |
| 2 | `src/admin/operationsCore.ts` |
| 1 | `src/tasks/activePool.test.ts` |
| 1 | `src/simpleLists/SimpleListPage.tsx` |
| 1 | `src/share/SharePage.tsx` |
| 1 | `src/share/shareCapture.ts` |
| 1 | `src/share/pendingShare.ts` |
| 1 | `src/share/manifest.test.ts` |
| 1 | `src/search/paletteAvailability.test.ts` |
| 1 | `src/search/CommandPalette.test.tsx` |
| 1 | `src/reviews/report.ts` |
| 1 | `src/projects/ProjectsPage.tsx` |
| 1 | `src/projects/operations.ts` |
| 1 | `src/notifications/client.ts` |
| 1 | `src/lists/UpcomingPage.test.tsx` |
| 1 | `src/lists/SomedayPage.test.tsx` |
| 1 | `src/lenses/operations.ts` |
| 1 | `src/lenses/LensesPage.tsx` |
| 1 | `src/inbox/parseCapture.ts` |
| 1 | `src/inbox/InboxPage.test.tsx` |
| 1 | `src/goals/operations.test.ts` |
| 1 | `src/feedback/operationsCore.ts` |
| 1 | `src/feedback/operationsCore.test.ts` |
| 1 | `src/feedback/captureContext.ts` |
| 1 | `src/components/ui/Table.tsx` |
| 1 | `src/components/ui/PropertyChips.tsx` |
| 1 | `src/components/ui/LensPopover.tsx` |
| 1 | `src/components/ui/FocusMode.tsx` |
| 1 | `src/components/ui/CapturePopover.test.tsx` |
| 1 | `src/billing/useEntitled.ts` |
| 1 | `src/auth/email/LoginPage.test.tsx` |
| 1 | `src/auth/CliLoginPage.tsx` |
| 1 | `src/attachments/serveAttachment.ts` |
| 1 | `src/app/operations.ts` |
| 1 | `src/app/focusTaskView.ts` |
| 1 | `src/admin/userManagementCore.ts` |
| 1 | `src/admin/AdminPage.tsx` |
| 1 | `src/admin/AdminFunnelPage.tsx` |
| 1 | `src/admin/AdminFeedbackPage.tsx` |

### no-runtime-typeof — 104 findings, 43 files

Batch **B7** (minus the B3/B4 hotspots).

| Count | File |
|-------|------|
| 12 | `src/auth/patRoutes.ts` |
| 6 | `src/reviews/operationsCore.ts` |
| 6 | `src/billing/webhook.ts` |
| 6 | `src/auth/sessionCookie.ts` |
| 5 | `src/notifications/client.ts` |
| 5 | `src/components/ui/useMediaQuery.ts` |
| 5 | `src/analytics/operationsCore.ts` |
| 4 | `src/share/shareCapture.ts` |
| 4 | `src/lenses/operations.ts` |
| 4 | `src/analytics/eventApi.ts` |
| 3 | `src/shared/dateFormat.ts` |
| 3 | `src/feedback/captureContext.ts` |
| 3 | `src/auth/magicLogin.ts` |
| 3 | `src/app/operations.ts` |
| 2 | `src/test/setup.ts` |
| 2 | `src/lenses/LensesPage.tsx` |
| 2 | `src/billing/useEntitled.ts` |
| 2 | `src/auth/email/userSignupFields.ts` |
| 2 | `src/app/AppShell.tsx` |
| 2 | `src/admin/userManagementCore.ts` |
| 1 | `src/test/mockContext.ts` |
| 1 | `src/tasks/TaskDetailPage.tsx` |
| 1 | `src/share/composeShareText.ts` |
| 1 | `src/search/CommandPalette.tsx` |
| 1 | `src/projects/operations.ts` |
| 1 | `src/goals/operations.ts` |
| 1 | `src/feedback/operationsCore.ts` |
| 1 | `src/feedback/captureContext.test.ts` |
| 1 | `src/components/ui/LensPopover.tsx` |
| 1 | `src/components/ui/AttachmentThumbs.tsx` |
| 1 | `src/auth/sessionCookieMirror.ts` |
| 1 | `src/auth/sessionAuth.ts` |
| 1 | `src/auth/serverMiddleware.ts` |
| 1 | `src/auth/returnTo.ts` |
| 1 | `src/auth/patMiddleware.ts` |
| 1 | `src/auth/loginActivity.ts` |
| 1 | `src/auth/devAutologin.ts` |
| 1 | `src/auth/cliMint.ts` |
| 1 | `src/attachments/serveAttachment.ts` |
| 1 | `src/app/theme.ts` |
| 1 | `src/analytics/tracking.ts` |
| 1 | `src/analytics/StatCounter.tsx` |
| 1 | `public/service-worker.js` |

### no-unknown-parameters — 79 findings, 31 files

Batch **B4** (patRoutes) + **B8** tail.

| Count | File |
|-------|------|
| 40 | `src/auth/patRoutes.ts` |
| 3 | `src/reviews/operationsCore.ts` |
| 3 | `src/billing/entitlements.ts` |
| 3 | `src/auth/loginActivity.ts` |
| 2 | `src/lenses/operations.ts` |
| 2 | `src/auth/returnTo.ts` |
| 2 | `src/attachments/serveAttachment.test.ts` |
| 1 | `src/tasks/TaskDetailPage.test.tsx` |
| 1 | `src/simpleLists/SimpleListPage.tsx` |
| 1 | `src/share/shareCapture.ts` |
| 1 | `src/share/shareCapture.test.ts` |
| 1 | `src/projects/ProjectDetailPage.test.tsx` |
| 1 | `src/onboarding/OnboardingPage.tsx` |
| 1 | `src/lists/UpcomingPage.test.tsx` |
| 1 | `src/lenses/LensesPage.tsx` |
| 1 | `src/lenses/LensesPage.test.tsx` |
| 1 | `src/inbox/TriagePage.test.tsx` |
| 1 | `src/goals/GoalDetailPage.test.tsx` |
| 1 | `src/feedback/operationsCore.ts` |
| 1 | `src/billing/webhook.ts` |
| 1 | `src/billing/webhook.test.ts` |
| 1 | `src/billing/useEntitled.ts` |
| 1 | `src/auth/sessionCookie.ts` |
| 1 | `src/auth/patMiddleware.ts` |
| 1 | `src/auth/magicLogin.ts` |
| 1 | `src/auth/devAutologin.ts` |
| 1 | `src/attachments/serveAttachment.ts` |
| 1 | `src/app/AppShell.test.tsx` |
| 1 | `src/analytics/operationsCore.ts` |
| 1 | `src/analytics/eventApi.ts` |
| 1 | `src/admin/userManagementCore.ts` |

### no-known-value-widening — 70 findings, 35 files

Batch **B6** (pairs with the dictionary rule below).

| Count | File |
|-------|------|
| 7 | `src/tasks/taskPropertyFields.ts` |
| 6 | `src/tasks/operationsCore.ts` |
| 6 | `src/inbox/triageFlow.ts` |
| 5 | `src/shared/dateFormat.ts` |
| 4 | `src/projects/ProjectDetailPage.test.tsx` |
| 4 | `src/inbox/operationsCore.ts` |
| 2 | `src/projects/ProjectDetailPage.tsx` |
| 2 | `src/projects/operations.ts` |
| 2 | `src/inbox/useTriageKeyboard.ts` |
| 2 | `src/inbox/parseCapture.ts` |
| 2 | `src/components/ui/TaskRow.tsx` |
| 2 | `src/components/ui/Card.tsx` |
| 2 | `src/components/ui/Button.tsx` |
| 2 | `src/app/taskContext.test.ts` |
| 2 | `src/admin/operationsCore.ts` |
| 1 | `src/tasks/TaskDetailPage.test.tsx` |
| 1 | `src/tasks/operations.ts` |
| 1 | `src/share/SharePage.tsx` |
| 1 | `src/search/operationsCore.ts` |
| 1 | `src/search/CommandPalette.tsx` |
| 1 | `src/lists/UpcomingPage.tsx` |
| 1 | `src/goals/operations.ts` |
| 1 | `src/goals/GoalDetailPage.test.tsx` |
| 1 | `src/components/ui/TriageCard.tsx` |
| 1 | `src/components/ui/DispatchButton.tsx` |
| 1 | `src/billing/webhook.ts` |
| 1 | `src/billing/config.ts` |
| 1 | `src/auth/magicLogin.ts` |
| 1 | `src/app/useKeyboardShortcuts.ts` |
| 1 | `src/app/focusWhy.ts` |
| 1 | `src/app/AppShell.tsx` |
| 1 | `src/analytics/StatCounter.tsx` |
| 1 | `src/admin/StatusSelect.tsx` |
| 1 | `src/admin/AdminPage.tsx` |
| 1 | `src/admin/AdminFunnelPage.tsx` |

### no-unsafe-dictionary-type — 59 findings, 29 files

Batch **B6** (pairs with the widening rule above).

| Count | File |
|-------|------|
| 19 | `src/billing/webhook.ts` |
| 4 | `src/auth/patRoutes.ts` |
| 3 | `src/tasks/operationsCore.ts` |
| 3 | `src/billing/entitlements.ts` |
| 2 | `src/tasks/operations.ts` |
| 2 | `src/search/operationsCore.test.ts` |
| 2 | `src/reviews/operationsCore.ts` |
| 2 | `src/projects/ProjectDetailPage.test.tsx` |
| 2 | `src/analytics/eventApi.ts` |
| 1 | `src/tasks/TaskDetailPage.test.tsx` |
| 1 | `src/simpleLists/operationsCore.ts` |
| 1 | `src/share/shareCapture.ts` |
| 1 | `src/search/operationsCore.ts` |
| 1 | `src/resources/operationsCore.ts` |
| 1 | `src/projects/operationsCore.ts` |
| 1 | `src/logbook/operationsCore.ts` |
| 1 | `src/lenses/operationsCore.ts` |
| 1 | `src/lenses/LensesPage.test.tsx` |
| 1 | `src/inbox/operationsCore.ts` |
| 1 | `src/goals/operationsCore.ts` |
| 1 | `src/goals/GoalDetailPage.test.tsx` |
| 1 | `src/feedback/operationsCore.ts` |
| 1 | `src/components/ui/Table.tsx` |
| 1 | `src/billing/webhook.test.ts` |
| 1 | `src/billing/operations.ts` |
| 1 | `src/analytics/operationsCore.ts` |
| 1 | `src/admin/userManagementCore.ts` |
| 1 | `src/admin/operationsCore.ts` |
| 1 | `src/admin/operations.ts` |

### no-module-mocking — 44 findings, 26 files (all tests)

Batch **B9** — architectural, do per directory.

| Count | File |
|-------|------|
| 4 | `src/lenses/LensesPage.test.tsx` |
| 4 | `src/app/AppShell.test.tsx` |
| 3 | `src/simpleLists/SimpleListPage.test.tsx` |
| 3 | `src/lists/UpcomingPage.test.tsx` |
| 3 | `src/lists/SomedayPage.test.tsx` |
| 3 | `src/auth/email/PasswordlessAuthPage.test.tsx` |
| 2 | `src/share/shareCapture.test.ts` |
| 2 | `src/lenses/operations.test.ts` |
| 2 | `src/inbox/TriagePage.test.tsx` |
| 2 | `src/auth/email/LoginPage.test.tsx` |
| 1 | `src/tasks/TaskDetailPage.test.tsx` |
| 1 | `src/tasks/operations.test.ts` |
| 1 | `src/simpleLists/operations.test.ts` |
| 1 | `src/search/operations.test.ts` |
| 1 | `src/search/CommandPalette.test.tsx` |
| 1 | `src/projects/ProjectDetailPage.test.tsx` |
| 1 | `src/projects/operations.test.ts` |
| 1 | `src/onboarding/operations.test.ts` |
| 1 | `src/inbox/operations.test.ts` |
| 1 | `src/inbox/operations.capture.test.ts` |
| 1 | `src/inbox/InboxPage.test.tsx` |
| 1 | `src/goals/operations.test.ts` |
| 1 | `src/goals/GoalDetailPage.test.tsx` |
| 1 | `src/billing/webhook.test.ts` |
| 1 | `src/billing/entitlements.ops.test.ts` |
| 1 | `src/App.test.tsx` |

### no-conditional-empty-object-spread — 22 findings, 12 files

Batch **B5** — the Prisma conditional-where idiom.

| Count | File |
|-------|------|
| 6 | `src/admin/operationsCore.ts` |
| 4 | `src/projects/operationsCore.ts` |
| 2 | `src/feedback/operationsCore.ts` |
| 2 | `scripts/create-verified-user.mjs` |
| 1 | `src/simpleLists/operationsCore.ts` |
| 1 | `src/projects/ProjectDetailPage.tsx` |
| 1 | `src/lenses/LensesPage.tsx` |
| 1 | `src/inbox/operationsCore.ts` |
| 1 | `src/analytics/operationsCore.ts` |
| 1 | `scripts/tasks-to-inbox.mjs` |
| 1 | `scripts/setup-stripe.mjs` |
| 1 | `playwright.config.ts` |

### no-chained-type-assertions — 21 findings, 10 files

Batch **B2** (webhook's 7 land in B3).

| Count | File |
|-------|------|
| 7 | `src/billing/webhook.ts` |
| 3 | `src/shared/imageFiles.test.ts` |
| 3 | `src/attachments/serveAttachment.test.ts` |
| 2 | `src/share/shareCapture.test.ts` |
| 1 | `src/components/ui/GroupedList.tsx` |
| 1 | `src/billing/stripe.ts` |
| 1 | `src/auth/sessionCookie.ts` |
| 1 | `src/app/useKeyboardShortcuts.test.tsx` |
| 1 | `src/analytics/StatCounter.tsx` |
| 1 | `src/analytics/eventApi.ts` |

### no-unknown-returns — 7 findings, 4 files

Batch **B10** (webhook's 3 land in B3).

| Count | File |
|-------|------|
| 3 | `src/billing/webhook.ts` |
| 2 | `src/auth/loginActivity.ts` |
| 1 | `src/simpleLists/SimpleListPage.tsx` |
| 1 | `src/auth/sessionCookie.ts` |

### no-object-parameters — 2 findings, 2 files

Batch **B10**.

| Count | File |
|-------|------|
| 1 | `src/search/operationsCore.ts` |
| 1 | `src/feedback/operationsCore.ts` |
