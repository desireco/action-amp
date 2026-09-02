// S13 — onboarding cores, ported from webapp/src/onboarding/operations.ts
// (the parity checklist is packages/contract/src/s13-onboarding/README.md §3).
//
// `ensureOnboardedCore` — idempotent: creates the default Work + Me lenses for
// the user if they don't yet have them. Covers BOTH existing users who predate
// the Lens feature and brand-new signups. Safe to call on every app load.
//
// `setPreferredNameCore` — persists the onboarding preferred-name choice.
//
// `completeOnboardingCore` — marks onboarding seen server-side (routes
// returning users straight to the app home and shows new users /welcome
// exactly once). Idempotent: re-calling on an already-complete user is a no-op.
//
// Port deviations (both seam-shaped, see docs/plans/slices/s13-s15-wiring.md):
// - The webapp op reached AuthIdentity through a direct PrismaClient to resolve
//   the welcome-email recipient. The new stack's acting user already carries
//   the email, so the email send is an INJECTED dep (`sendWelcomeEmail`) —
//   S12's email seam supplies it; until then the API layer passes a stub
//   (wiring note at the call site).
// - The analytics fire is likewise injected (`recordOnboardingCompleted`);
//   the API layer wires it to the public event recorder (same
//   ONBOARDING_COMPLETED payload, fire-and-forget, errors swallowed).

import { uniquePermalink } from "../shared/permalinks.js";
import type { Entities } from "../db/seam.js";
import type { OnboardingStage } from "../db/types.js";

// Each default lens carries an identity color key (see styles/tokens.css
// `--aa-lens-*` palette). Work and Me are ordinary Lens names. `isIncluded`
// is the Free-plan entitlement, not a Personal/Work category.
export const DEFAULT_LENSES = [
  { name: "Work", color: "indigo", isIncluded: false },
  { name: "Me", color: "emerald", isIncluded: true },
] as const satisfies readonly {
  name: string;
  color: string;
  isIncluded: boolean;
}[];

export const STARTER_TASK = "Practice: complete this task";

/** The user shape the welcome-email dep receives (what the webapp sent). */
export interface WelcomeEmailUser {
  id: string;
  firstName?: string | null;
  preferredName?: string | null;
}

/**
 * The side-channel deps completeOnboardingCore accepts. Both are
 * best-effort by design: an analytics or SMTP failure must never fail
 * completion (webapp parity — errors swallowed at both call sites).
 */
export interface OnboardingCompletionDeps {
  /** The welcome email — S12's send seam supplies the transport. */
  sendWelcomeEmail?: (user: WelcomeEmailUser) => Promise<void>;
  /** The ONBOARDING_COMPLETED analytics event (fire-and-forget). */
  recordOnboardingCompleted?: (userId: string) => Promise<unknown>;
}

type OnboardingEntities = Entities;

/**
 * Walk an error's cause chain looking for a Postgres error code (drizzle
 * wraps driver errors, so 23505 et al. ride `cause`, not the thrown error).
 */
function hasPgCode(err: unknown, code: string): boolean {
  let cur: unknown = err;
  while (cur instanceof Error) {
    if ((cur as { code?: string }).code === code) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Idempotent bootstrap: default lenses (looked up by the seed FLAGS, never by
 * name — rename-safe), a "General" project per default lens (triage's P-key
 * target so nothing is orphaned), and one sample task only when the stage is
 * SAMPLE_TASK and the user has zero tasks. Check-then-create, not atomic —
 * the client keeps a once-per-session ref guard (webapp parity).
 */
export async function ensureOnboardedCore(
  entities: OnboardingEntities,
  args: { userId: string | null },
): Promise<{ createdLenses: { name: string; id: string }[] }> {
  if (!args.userId) {
    throw new Error("Not authenticated.");
  }
  const userId = args.userId;
  const created: { name: string; id: string }[] = [];

  for (const lens of DEFAULT_LENSES) {
    // Defaults are identified by their entitlement/default flags, not names.
    const existing = await entities.Lens.findFirst({
      where: { userId, isDefault: true, isIncluded: lens.isIncluded },
      select: { id: true, name: true, color: true },
    });
    if (!existing) {
      try {
        const row = await entities.Lens.create({
          data: {
            name: lens.name,
            isDefault: true,
            isIncluded: lens.isIncluded,
            color: lens.color,
            purpose: null,
            userId,
          },
          select: {
            id: true,
            name: true,
            isDefault: true,
            isIncluded: true,
            color: true,
            purpose: true,
          },
        });
        created.push({ id: row.id, name: row.name });
      } catch (err) {
        // A user-created lens can already OWN the name while carrying the wrong
        // flags (rename the seeded "Work" → "Deep Work", then create your own
        // "Work"): the flags lookup misses it, and the per-user name-unique
        // constraint (Lens_userId_name_key, 23505) fires. That row IS the
        // user's lens — adopt it (leave name/flags/color alone) instead of
        // failing the whole bootstrap with a 500. The webapp core had the same
        // hole; this is the port's correction (pinned by test). Drizzle wraps
        // driver errors, so the constraint code may ride the cause chain.
        if (hasPgCode(err, "23505")) {
          continue;
        }
        throw err;
      }
    } else if (existing.color !== lens.color) {
      // Backfill the identity color if it drifted. We do NOT touch the name or
      // kind here — the name is user-editable, and the kind was already the
      // lookup key (so it's correct by definition).
      await entities.Lens.update({
        where: { id: existing.id },
        data: { color: lens.color },
        select: {
          id: true,
          name: true,
          isDefault: true,
          isIncluded: true,
          color: true,
          purpose: true,
        },
      });
    }
  }

  // Seed a "General" project per lens — the default target for triage's P key
  // (file-in-project). Gives every triaged task a visible home so none are
  // orphaned. Idempotent, like the lens loop above. Looked up by KIND so a
  // renamed seeded lens still gets its General project (rename-safe).
  let meLensId: string | null = null;
  for (const lens of DEFAULT_LENSES) {
    const existingLens = await entities.Lens.findFirst({
      where: { userId, isDefault: true, isIncluded: lens.isIncluded },
      select: { id: true },
    });
    if (!existingLens) continue;
    if (lens.isIncluded) meLensId = existingLens.id;
    const existingProject = await entities.Project.findFirst({
      where: { userId, lensId: existingLens.id, name: "General" },
      select: { id: true },
    });
    if (!existingProject) {
      const permalink = await uniquePermalink("General", async (candidate) => {
        const clash = await entities.Project.findFirst({
          where: { userId, permalink: candidate },
          select: { id: true },
        });
        return !!clash;
      });
      await entities.Project.create({
        data: { name: "General", permalink, userId, lensId: existingLens.id },
        select: { id: true },
      });
    }
  }

  // Seed one harmless sample task only after the user finishes onboarding.
  // Capture and triage are stage-backed actions, not pretend Tasks; that keeps
  // the user's real table clean and gives each next step the right CTA.
  if (meLensId) {
    const onboarding = await entities.User.findUnique({
      where: { id: userId },
      select: { onboardingStage: true },
    });
    const taskCount = await entities.Task.count({ where: { userId } });
    if (onboarding?.onboardingStage === "SAMPLE_TASK" && taskCount === 0) {
      const permalink = await uniquePermalink(STARTER_TASK, async (candidate) => {
        const clash = await entities.Task.findFirst({
          where: { userId, permalink: candidate },
          select: { id: true },
        });
        return !!clash;
      });
      await entities.Task.create({
        data: {
          description: STARTER_TASK,
          permalink,
          userId,
          lensId: meLensId,
          status: "TODAY",
          priority: "NORMAL",
          size: "S",
          isOnboardingSample: true,
        },
        select: { id: true },
      });
    }
  }

  return { createdLenses: created };
}

/**
 * Sets the user's preferred name (the onboarding "what should we call you?"
 * step). Independent of `ensureOnboardedCore` so it can be called once and
 * skipped.
 */
export async function setPreferredNameCore(
  entities: OnboardingEntities,
  args: { userId: string | null; preferredName: string },
): Promise<{ preferredName: string }> {
  if (!args.userId) {
    throw new Error("Not authenticated.");
  }
  const name = args.preferredName?.trim();
  if (!name) {
    throw new Error("Preferred name is required.");
  }
  await entities.User.update({
    where: { id: args.userId },
    data: { preferredName: name },
  });
  return { preferredName: name };
}

/**
 * Marks onboarding complete server-side. Persists `User.hasSeenOnboarding=true`
 * so the client can route returning users straight to the app home and show
 * new users /welcome exactly once. Idempotent: re-calling on an
 * already-complete user is a no-op. Replaces the old localStorage gate (which
 * didn't survive a browser switch or a clear).
 *
 * `hasSeenOnboarding` arrives from the acting user (the webapp read it off
 * context.user). `skipGuidance` (the Esc / "Skip intro" path) sets stage
 * COMPLETE — which also prevents ensureOnboardedCore from seeding the
 * practice task; the full flow starts the SAMPLE_TASK guidance.
 */
export async function completeOnboardingCore(
  entities: OnboardingEntities,
  args: {
    userId: string | null;
    hasSeenOnboarding: boolean;
    firstName?: string | null;
    preferredName?: string | null;
    skipGuidance?: boolean;
  },
  deps: OnboardingCompletionDeps = {},
): Promise<{ hasSeenOnboarding: boolean }> {
  if (!args.userId) {
    throw new Error("Not authenticated.");
  }
  if (args.hasSeenOnboarding) {
    return { hasSeenOnboarding: true };
  }

  const nextStage: OnboardingStage = args.skipGuidance ? "COMPLETE" : "SAMPLE_TASK";
  await entities.User.update({
    where: { id: args.userId },
    data: {
      hasSeenOnboarding: true,
      // Returning members can bypass the explainer and guided practice loop.
      // COMPLETE prevents ensureOnboardedCore from seeding the practice task.
      onboardingStage: nextStage,
    },
  });

  // Fire-and-forget analytics — errors swallowed (webapp parity).
  if (deps.recordOnboardingCompleted) {
    void deps.recordOnboardingCompleted(args.userId).catch(() => {});
  }

  // Welcome email, best-effort: completion must never fail because SMTP is
  // unavailable or a provider rejects delivery. No send without a dep —
  // the wiring note at the API call site covers when S12's seam lands.
  if (deps.sendWelcomeEmail) {
    try {
      await deps.sendWelcomeEmail({
        id: args.userId,
        firstName: args.firstName ?? null,
        preferredName: args.preferredName ?? null,
      });
    } catch {
      // Welcome email is a helpful follow-up, not a gate.
    }
  }

  return { hasSeenOnboarding: true };
}
