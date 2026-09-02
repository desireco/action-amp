/**
 * The feedback procedures — the user-facing submit op (S-review port of the
 * webapp's `submitFeedback` Wasp op; see webapp/src/feedback/operations.ts).
 *
 * Layering (mirrors procedures/prefs.ts): resolve the acting user
 * (`requireUser` — the oRPC expression of the webapp op's "Not authenticated."
 * guard), call the domain core from @actionamp/domain/feedback, return
 * `{ id }`. Validation strings ("Feedback is required." / "Feedback is too
 * long.") live INSIDE the core (webapp parity, pinned by the domain tests);
 * the guard() shim rethrows core Errors as the contract's DECLARED BAD_REQUEST
 * so the message reaches the client like HttpError(400) did.
 *
 * Submitter context (webapp parity, minus the redundant re-read): the acting
 * user already carries the stored `fullName` + identity `email` on both auth
 * paths (the session hydrates them via F10a; the PAT resolver via F10b), so
 * the webapp's User findUnique + AuthIdentity walk collapse to the acting
 * user's own fields. PAT callers get email off the User row the same way.
 *
 * EMAIL WIRING NOTE: the webapp wrapper also fired the admin notification
 * email (best-effort, never blocking — feedback was already stored). Deferred
 * until this stack's email seam grows a feedback template + admin-recipient
 * config (apps/api/src/email.ts currently ships the magic-login mail only);
 * the stored row is the source of truth and submission must never fail
 * because mail is down.
 */
import { implement, ORPCError } from "@orpc/server";
import { feedbackContract } from "@actionamp/contract";
import { submitFeedbackCore } from "@actionamp/domain/feedback";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(feedbackContract).$context<ApiContext>();

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

const submit = ORPC.submit.handler(async ({ context, input }) =>
  guard(async () => {
    const acting = requireUser(context);
    const feedback = await submitFeedbackCore(context.entities, {
      userId: acting.id,
      message: input.message,
      route: input.route ?? null,
      section: input.section ?? null,
      lens: input.lens ?? null,
      userAgent: input.userAgent ?? null,
      viewport: input.viewport ?? null,
      timezone: input.timezone ?? null,
      userName: acting.fullName ?? null,
      userEmail: acting.email ?? null,
    });
    return { id: feedback.id };
  }),
);

/** The implemented feedback fragment — composed by src/router.ts (one line,
 *  marked `S-review: feedback submit` in both routers). */
export const feedbackProcedures = {
  submit,
};
