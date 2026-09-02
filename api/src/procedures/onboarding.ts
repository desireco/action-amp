/**
 * The onboarding procedures (S13) — thin wrappers over the domain cores.
 *
 * Layering (mirrors procedures/lenses.ts): resolve the acting user
 * (`requireUser`), call the domain core from @actionamp/domain/onboarding,
 * return its result as-is. The "Not authenticated." / "Preferred name is
 * required." guards live INSIDE the cores (webapp-op parity, pinned by the
 * domain tests); this layer's requireUser turns a missing credential into the
 * typed 401 first, and the guard() shim rethrows core Errors as
 * BAD_REQUEST so the webapp message reaches the client like HttpError(400).
 *
 * `status` is the first-run read (contract header + wiring doc): the
 * webapp's first-run gate + carousel read hasSeenOnboarding/firstName off
 * useAuth(). S10's `auth.me` now carries `hasSeenOnboarding`, but NOT
 * `onboardingStage` (it doesn't ride the session user), so this read remains
 * the only stage source for the stage-aware capture/triage guidance — it is
 * NOT retired by S10; retirement would mean folding the stage into `me`
 * (a contract change, out of this fragment's scope). Either way it takes one
 * by-PK read (the same query useAuth made).
 *
 * WIRING NOTE (S12's email seam): completeOnboarding's `sendWelcomeEmail` dep
 * is a stub — the welcome email fires here when S12's email-send seam lands
 * (subject "Your first task is waiting", CTA Open ActionAmp → appUrl/do,
 * best-effort/never-blocking; see s13-onboarding/README.md §3.6). The
 * analytics dep is wired to the public event recorder with the webapp's exact
 * ONBOARDING_COMPLETED payload (visitorId `user_<id>`, route "/welcome").
 *
 * NOTE — fragment implements FRAGMENT: this file implements
 * `onboardingContract` directly (not the composed `contractRouter`). The
 * one-line composition for api/src/router.ts lives in
 * docs/plans/slices/s13-s15-wiring.md.
 */
import { implement, ORPCError } from "@orpc/server";
import { onboardingContract } from "@actionamp/contract";
import {
  completeOnboardingCore,
  ensureOnboardedCore,
  setPreferredNameCore,
} from "@actionamp/domain/onboarding";
import { requireUser, type ApiContext } from "../context.js";
import { sendWelcomeEmail } from "../emailNotifications.js";
import { recordPublicAnalyticsEvent } from "./publicCore.js";

const ORPC = implement(onboardingContract).$context<ApiContext>();

/** Core `Error`s are user-facing messages — rethrown as BAD_REQUEST (the
 *  prefs procedures' shim). */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && !(err instanceof ORPCError)) {
      throw new ORPCError("BAD_REQUEST", { message: err.message });
    }
    throw err;
  }
}

const ensureOnboarded = ORPC.ensureOnboarded.handler(async ({ context }) => {
  const user = requireUser(context);
  // Idempotent + check-then-create: safe to call once per session from the
  // client's ref-guarded bootstrap (the StrictMode double-fire guard).
  return await ensureOnboardedCore(context.entities, { userId: user.id });
});

const setPreferredName = ORPC.setPreferredName.handler(
  async ({ context, input }) =>
    guard(async () => {
      const user = requireUser(context);
      return await setPreferredNameCore(context.entities, {
        userId: user.id,
        preferredName: input.preferredName,
      });
    }),
);

const completeOnboarding = ORPC.completeOnboarding.handler(
  async ({ context, input }) =>
    guard(async () => {
      const user = requireUser(context);
      // The guard fields come off the row (one by-PK read): PAT callers have
      // a narrower ActingUser than sessions, and the webapp read the same
      // values off its per-request hydrated context.user.
      const row = await context.entities.User.findUnique({
        where: { id: user.id },
        select: {
          hasSeenOnboarding: true,
          firstName: true,
          preferredName: true,
        },
      });
      return await completeOnboardingCore(
        context.entities,
        {
          userId: user.id,
          hasSeenOnboarding: row?.hasSeenOnboarding ?? false,
          firstName: row?.firstName,
          preferredName: row?.preferredName,
          skipGuidance: input?.skipGuidance,
        },
        {
          // S12's email seam — best-effort by design (the core swallows dep
          // errors; completion never fails because mail is down). Localhost
          // skips the send per email.ts's transport gate.
          sendWelcomeEmail: async (u) => {
          // PAT callers can lack an address — no email, no send. Localhost
          // skips the transport per email.ts's gate; the core swallows dep
          // errors either way (completion never fails because mail is down).
          if (!user.email) return;
          await sendWelcomeEmail({
            email: user.email,
            firstName: u.firstName,
            preferredName: u.preferredName,
          });
        },
          recordOnboardingCompleted: (userId) =>
            // Fire-and-forget inside the core (errors swallowed). Same
            // payload the webapp's recordAnalyticsEventCore received.
            recordPublicAnalyticsEvent(
              context.db,
              {
                name: "ONBOARDING_COMPLETED",
                visitorId: `user_${userId}`,
                route: "/welcome",
              },
              userId,
            ),
        },
      );
    }),
);


/** The implemented onboarding fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s13-s15-wiring.md). */
export const onboardingProcedures = {
  ensureOnboarded,
  setPreferredName,
  completeOnboarding,
};
