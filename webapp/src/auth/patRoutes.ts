/**
 * PAT route handlers + the `/api/cli/now` stub.
 *
 * Three session-authed routes (issue / revoke / list) manage tokens from the
 * Settings UI. They run behind Wasp's normal `auth: true` (the logged-in user
 * is `context.user`). The `/api/cli/now` stub runs behind `patRouteMiddleware`
 * instead (Bearer auth) and proves the PAT layer end-to-end — a valid token
 * returns the user's top task; anything else 401s.
 *
 * No op-refactor here. The stub re-implements the small `getTopTask` candidate
 * query inline (the spec's "no op-refactor yet" non-goal). `cli-package` (next
 * phase) is where the pure-function refactor lands; this stub is replaced by
 * the real CLI surface then. Re-implementing ~15 lines is cheaper than
 * factoring an op halfway and undoing it.
 */
import type { Request, Response } from "express";
import { generateToken, hashToken, TOKEN_PREFIX } from "./pat";
import { PRIORITY_RANK, SIZE_RANK } from "../tasks/operations";
import { activePoolWhere } from "../tasks/activePool";
import {
  resolveLens,
  resolveAccessibleLenses,
  lensViolation,
  WORK_LENS_MESSAGE,
  type EntitlementUser,
} from "../billing/entitlements";

// Wasp injects `context.entities.<EntityName>` (Prisma clients) for every
// entity listed in the route's `entities:` array. We type the slice we use so
// the handler is self-documenting; Wasp's runtime types this as `any`.
type WaspApiContext = {
  user?: { id: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entities: any;
};

/**
 * Sort a candidate list the same way `getTopTask` does. Imported rank maps keep
 * the two paths from drifting; if `operations.ts` reorders priority/size, the
 * test for that op will fail and flag the stub to be updated in lockstep.
 */
function rankTopTask<
  T extends {
    startedAt: Date | null;
    status: string;
    priority: string;
    size: string;
    createdAt: Date;
  },
>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aStarted = a.startedAt ? 0 : 1;
    const bStarted = b.startedAt ? 0 : 1;
    if (aStarted !== bStarted) return aStarted - bStarted;
    if (a.startedAt && b.startedAt) {
      return a.startedAt.getTime() - b.startedAt.getTime();
    }
    const aToday = a.status === "TODAY" ? 0 : 1;
    const bToday = b.status === "TODAY" ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr !== 0) return pr;
    const sr = (SIZE_RANK[a.size] ?? 1) - (SIZE_RANK[b.size] ?? 1);
    if (sr !== 0) return sr;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return candidates[0];
}

// ───────────────────────────────────────────────────────────────────────────
// POST /api/pat/issue — session-authed. Body: { label }. Returns plaintext once.
// ───────────────────────────────────────────────────────────────────────────
export const patIssue = async (req: Request, res: Response, context: WaspApiContext) => {
  if (!context.user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const label =
    typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 80) : "";
  if (!label) {
    return res.status(400).json({ error: "A label is required." });
  }

  const plaintext = generateToken();
  const hashedToken = hashToken(plaintext);
  const created = await context.entities.ApiKey.create({
    data: { hashedToken, label, userId: context.user.id },
    select: { id: true, label: true, createdAt: true },
  });

  // Plaintext returned exactly once. The DB row only has the hash; the client
  // is responsible for storing/copying the plaintext now or never.
  return res.status(201).json({
    token: plaintext,
    id: created.id,
    label: created.label,
    createdAt: created.createdAt,
    // Friendly reminder for the UI to show next to the copy button.
    notice: "This token won't be shown again. Copy it now.",
  });
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/pat/revoke — session-authed. Body: { id }. Tenancy-safe delete.
// ───────────────────────────────────────────────────────────────────────────
export const patRevoke = async (req: Request, res: Response, context: WaspApiContext) => {
  if (!context.user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const id = typeof req.body?.id === "string" ? req.body.id : null;
  if (!id) {
    return res.status(400).json({ error: "An id is required." });
  }

  // Tenancy check: find first constrained to this user, then delete by id.
  // A raw deleteMany with `{ id, userId }` would also work; findFirst makes
  // the missing-vs-not-owned distinction explicit (404 vs 200).
  const owned = await context.entities.ApiKey.findFirst({
    where: { id, userId: context.user.id },
    select: { id: true },
  });
  if (!owned) {
    return res.status(404).json({ error: "No such token for this account." });
  }
  await context.entities.ApiKey.delete({ where: { id: owned.id } });
  return res.status(200).json({ revoked: true, id: owned.id });
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/pat/list — session-authed. Returns the user's keys, never the hash.
// ───────────────────────────────────────────────────────────────────────────
export const patList = async (_req: Request, res: Response, context: WaspApiContext) => {
  if (!context.user) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const keys = await context.entities.ApiKey.findMany({
    where: { userId: context.user.id },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return res.status(200).json({ keys });
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/cli/now — PAT-middleware protected. Returns the user's top task.
//
// This is the auth-proof stub. cli-package replaces it with the real CLI
// surface; for now it just demonstrates: valid PAT → user's top task JSON;
// invalid/revoked/missing PAT → 401 (handled by patRouteMiddleware before
// this handler runs).
//
// **Parity with `getTopTask` is load-bearing** (learned in review): the stub
// must apply the same candidate predicate (`activePoolWhere` — including the
// snooze guard) AND the same FREE-lens entitlement (`lensViolation`) as the
// op it mirrors. Without both, the CLI either surfaces snoozed tasks the home
// screen hides, or lets a FREE user read Pro-gated lens data. The pure
// helpers in `tasks/activePool` + `billing/entitlements` are dependency-free
// of Wasp, so importing them here costs nothing and removes the drift class.
// ───────────────────────────────────────────────────────────────────────────
export const cliNow = async (req: Request, res: Response, _context: unknown) => {
  const user = req.patUser;
  if (!user) {
    // Defensive — middleware should have caught this. Never silently proceed.
    return res.status(401).json({ error: "Not authenticated." });
  }

  // We can't use Wasp's context.entities here because PAT routes have no Wasp
  // context (only session-authed routes do). The `_context` arg is accepted
  // because Wasp's generated wrapper always passes one (empty for `auth: false`
  // routes); ignoring it keeps the signature compatible. Shared Prisma
  // singleton from ./prisma.ts (process-level — never per-request; per-request
  // pools exhaust Postgres under concurrent CLI traffic). `authEntities` is
  // already the PascalCase shape the pure entitlement helpers expect.
  const { authPrisma: prisma, authEntities: entities } = await import("./prisma");
  // The entitlement helpers read {plan, planRenewsAt, isAdmin} — exactly what
  // patMiddleware resolves onto req.patUser.
  const entUser: EntitlementUser = {
    plan: user.plan,
    planRenewsAt: user.planRenewsAt,
    isAdmin: user.isAdmin,
  };

  try {
    const requestedLensId =
      typeof req.query.lensId === "string" ? req.query.lensId : null;
    let lensId: string | null;

    if (requestedLensId) {
      // Explicit lens: must be owned by the user (tenancy) AND entitled.
      // resolveLens does the tenancy lookup; lensViolation enforces the FREE-
      // lens rule on the resolved kind. 404 for not-owned keeps "no such lens"
      // indistinguishable from "exists but not yours" (no oracle).
      const lens = await resolveLens(entities, user.id, requestedLensId);
      if (!lens) {
        return res.status(404).json({ error: "No such lens for this account." });
      }
      const violation = lensViolation(entUser, lens, WORK_LENS_MESSAGE);
      if (violation) {
        return res.status(402).json({
          error: `${violation.feature} is a Pro feature.`,
          feature: violation.feature,
          reason: violation.reason,
        });
      }
      lensId = requestedLensId;
    } else {
      // No lens specified: default to the user's first *accessible* lens.
      // resolveAccessibleLenses already applies the entitlement filter
      // (FREE → PERSONAL-only), so the default can never land on a gated lens
      // — matching the web app's behavior where a FREE user lands on Me.
      const accessible = await resolveAccessibleLenses(entities, entUser, user.id);
      lensId = accessible[0]?.id ?? null;
    }

    if (!lensId) {
      // No accessible lenses at all — the user hasn't completed onboarding (or
      // a FREE user with no PERSONAL lens, which shouldn't happen post-seed).
      return res.status(200).json({ task: null, reason: "no-lens" });
    }

    // Candidate pool: the shared `activePoolWhere` predicate — same one
    // `getTopTask` uses, including the snooze guard (`dueDate` clause) that
    // keeps snoozed/scheduled tasks off Next until their time arrives.
    const candidates = await prisma.task.findMany({
      where: activePoolWhere({ userId: user.id, lensId }),
      include: {
        project: { select: { id: true, name: true } },
        goal: { select: { id: true, name: true } },
      },
    });
    const top = rankTopTask(candidates);

    if (!top) {
      return res.status(200).json({ task: null, reason: "no-candidates" });
    }
    return res.status(200).json({ task: top });
    // NOTE: no `prisma.$disconnect()` — `prisma` is the shared process-level
    // singleton; disconnecting here would break every subsequent request.
  } catch (err) {
    console.error("[cli/now] failed:", err);
    return res.status(500).json({ error: "Could not resolve top task." });
  }
};

// Exported for tests + the CLI client (Phase 1) to reference the token format.
export { TOKEN_PREFIX };
