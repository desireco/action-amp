// S5/S6 — server-side entitlement guards for the projects/goals surfaces.
//
// Ported from webapp/src/billing/entitlementHttp.ts (the op-layer guards),
// freed of `wasp/server`: the pure decisions live in `../billing/entitlements`
// (already ported, F4b) and this module turns a violation into a thrown
// `HttpError(402)` carrying the byte-exact `{ feature, reason }` message the
// UI's ProGate panel renders. The API layer catches it and rethrows as a
// typed oRPC PAYMENT_REQUIRED error with `data: { feature, reason }`.
//
// Guard placement is parity-critical (s5/s6 README §2/§5): list/create/move
// are guarded; DETAIL READS ARE NEVER LENS-GATED (a FREE user may keep using
// a Work-lens project created before a downgrade — no-data-loss invariant);
// lifecycle toggles (setDone/archive) run the lens gate but never a cap check
// (completing work is hygiene — and finishing frees a slot).
import {
  capViolation,
  lensViolation,
  resolveLens,
  WORK_LENS_MESSAGE,
  type EntitlementLens,
  type EntitlementMessage,
  type EntitlementUser,
} from "../billing/entitlements.js";
import { HttpError, throwHttpStatus } from "./httpError.js";

/** The subset of a user the guards read (the acting user from the API
 *  context satisfies this structurally). */
export type GuardUser = EntitlementUser & { id: string };

function throwIfViolation(violation: EntitlementMessage | null): void {
  if (violation) {
    // Webapp's HttpError(402) body: message + { feature, reason } data.
    throw new HttpError(402, `${violation.feature} is a Pro feature.`, {
      feature: violation.feature,
      reason: violation.reason,
    });
  }
}

/** Guard a lens-scoped read/create against the FREE-lens rule. Resolves
 *  lensId → `{ name, isIncluded }` (tenancy-safe) and checks isIncluded —
 *  the rename-safety fix (NOT the lens name). */
export async function assertLensAllowed(
  entities: { Lens: { findFirst(args: {
    where: { id: string; userId: string };
    select?: { name?: true; isIncluded?: true };
  }): Promise<EntitlementLens | null> } },
  user: GuardUser | null,
  lensId: string,
): Promise<void> {
  const lens = user
    ? await resolveLens({ Lens: entities.Lens }, user.id, lensId)
    : null;
  throwIfViolation(lensViolation(user ?? null, lens));
}

/** Guard a create against the FREE cap. Call after the auth check, before
 *  the create, passing the current non-done count for the lens. */
export function assertUnderCap(
  user: GuardUser | null,
  currentCount: number,
  cap: number,
  msg: EntitlementMessage,
): void {
  throwIfViolation(capViolation(user ?? null, currentCount, cap, msg));
}

/** Structured-write guard: tasks/goal-links need a STANDARD project. A
 *  SIMPLE_LIST project takes list items only. 404 unknown, 400 type. */
export async function assertStandardProject(
  entities: {
    Project: {
      findFirst(args: {
        where: { id: string; userId: string };
        select?: { type?: true };
      }): Promise<{ type: "STANDARD" | "SIMPLE_LIST" } | null>;
    };
  },
  user: GuardUser | null,
  projectId: string,
): Promise<void> {
  const project = user
    ? await entities.Project.findFirst({
        where: { id: projectId, userId: user.id },
        select: { type: true },
      })
    : null;
  if (!project) throwHttpStatus(404, "Project not found.");
  if (project.type === "SIMPLE_LIST") {
    throwHttpStatus(
      400,
      "This action requires a standard Project. Add checklist items directly in the list.",
    );
  }
}

// Re-export for wrapper ergonomics (one import site for the guard set).
export { WORK_LENS_MESSAGE };
export type { EntitlementMessage };
