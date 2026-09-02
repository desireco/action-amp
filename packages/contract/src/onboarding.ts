/**
 * The onboarding contract — S13 (the one-time first-run flow).
 *
 * Shapes mirror webapp/src/onboarding/operations.ts (the parity checklist
 * lives in s13-onboarding/README.md §2–§3): `ensureOnboarded` (idempotent
 * bootstrap — default Work/Me lenses looked up by seed FLAGS, a "General"
 * project per lens, one sample task only when stage=SAMPLE_TASK and the user
 * has zero tasks), `setPreferredName` (trim + required), and
 * `completeOnboarding` (idempotent server-side flag; skipGuidance → COMPLETE,
 * full flow → SAMPLE_TASK).
 *
 * `status` is NEW (surface-driven deviation, see docs/plans/slices/
 * s13-s15-wiring.md): the webapp read `hasSeenOnboarding`/`firstName` off
 * Wasp's `useAuth()` (the ["auth/me"] cache). The new stack has no auth/me yet
 * (S10), so the first-run gate + the /welcome carousel read this instead. The
 * optimistic post-completion patch targets this store the same way the webapp
 * patched ["auth/me"] — the redirect-loop guard from s13-onboarding/README.md
 * §5. S10's `me` query supersedes it (wiring note).
 *
 * Error surface (declared + thrown by the API fragment):
 * - `UNAUTHORIZED` (401) — no valid session/PAT ("Authentication required.",
 *   the API's requireUser message; the domain core's "Not authenticated."
 *   guard sits beneath it).
 * - `BAD_REQUEST` (400) — `setPreferredName` with a blank name
 *   ("Preferred name is required.", the webapp string verbatim).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

/** The onboarding state machine (`User.onboardingStage`). Schema default is
 *  COMPLETE — pre-existing users never see onboarding. */
export const OnboardingStageSchema = z.enum([
  "SAMPLE_TASK",
  "CAPTURE",
  "TRIAGE",
  "COMPLETE",
]);
export type OnboardingStage = (typeof OnboardingStageSchema)["options"][number];

/** The first-run gate's read (the useAuth parity shim — see file header). */
export const OnboardingStatusSchema = z.object({
  hasSeenOnboarding: z.boolean(),
  onboardingStage: OnboardingStageSchema,
  /** Drives the carousel's name step: shown only when blank. */
  firstName: z.string(),
  preferredName: z.string().nullable(),
});
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;

/** One seeded lens in ensureOnboarded's return (the client ignores it; the
 *  shape is pinned for tests). */
export const CreatedLensSchema = z.object({
  name: z.string(),
  id: z.string(),
});

/** Blank/whitespace preferred name → BAD_REQUEST, webapp message verbatim. */
export const PreferredNameErrorMap = {
  BAD_REQUEST: { status: 400, message: "Preferred name is required." },
} as const;

/** Idempotent bootstrap — safe to call once per session on app entry. */
export const ensureOnboarded = oc.output(
  z.object({ createdLenses: z.array(CreatedLensSchema) }),
);

/** The "what should we call you?" step. 400 on blank (map above). */
export const setPreferredName = oc
  .errors(PreferredNameErrorMap)
  .input(z.object({ preferredName: z.string() }))
  .output(z.object({ preferredName: z.string() }));

/** Idempotent completion. skipGuidance (Esc / "Skip intro") → COMPLETE. */
export const completeOnboarding = oc
  .input(z.object({ skipGuidance: z.boolean().optional() }))
  .output(z.object({ hasSeenOnboarding: z.boolean() }));

/** The gate read (useAuth parity shim — retired when S10's auth/me lands). */
export const onboardingStatus = oc.output(OnboardingStatusSchema);

/**
 * The onboarding namespace — paths:
 * POST /rpc/onboarding/{ensureOnboarded,setPreferredName,completeOnboarding,status}.
 * Composed into the tree by src/router.ts (the composition line lives in
 * docs/plans/slices/s13-s15-wiring.md).
 */
export const onboardingContract = {
  ensureOnboarded,
  setPreferredName,
  completeOnboarding,
  status: onboardingStatus,
};
