/**
 * The feedback contract — the user-facing submit op (S-review port of the
 * webapp's `submitFeedback` Wasp op; the admin triage surface stays S17's
 * admin.ts + the `/api/cli/feedback/*` PAT routes).
 *
 * Shapes mirror webapp/src/feedback/operations.ts's `SubmitFeedbackArgs`:
 * the message plus the captured page context (route/section/lens/user-agent/
 * viewport/timezone) the app attaches. `section` is the webapp's
 * `FeedbackSection` union; `lens` is the pill context of the surface the
 * feedback was filed from. All optional fields are nullable (explicit null
 * clears, absence omits — the core clamps + nulls empties either way).
 *
 * Error surface (declared + thrown by the API fragment):
 * - `UNAUTHORIZED` (401) — no valid session/PAT (the API's requireUser).
 * - `BAD_REQUEST` (400) — blank ("Feedback is required.") or over-long
 *   ("Feedback is too long.") message, the webapp strings verbatim.
 *
 * The admin notification email the webapp wrapper sent is NOT part of the
 * contract — the stored row is the source of truth (see
 * api/src/procedures/feedback.ts for the wiring note).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

/** The surfaces a feedback form can be filed from (webapp FeedbackSection). */
export const FeedbackSectionSchema = z.enum(["work", "plan", "review"]);
export type FeedbackSection = z.infer<typeof FeedbackSectionSchema>;

/** The lens pill context of the surface feedback was filed from. */
export const FeedbackLensSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});
export type FeedbackLens = z.infer<typeof FeedbackLensSchema>;

/** Blank or over-long message → BAD_REQUEST, webapp message verbatim. */
export const FeedbackSubmitErrorMap = {
  BAD_REQUEST: { status: 400, message: "Feedback is required." },
} as const;

/**
 * Submit user feedback → `{ id }` (the row's UUID; the human-addressable
 * Crockford `shortId` stays an admin-surface concern — the triage list shows
 * it, the submitter never needs it).
 */
export const submitFeedback = oc
  .errors(FeedbackSubmitErrorMap)
  .input(
    z.object({
      message: z.string(),
      route: z.string().nullable().optional(),
      section: FeedbackSectionSchema.nullable().optional(),
      lens: FeedbackLensSchema.nullable().optional(),
      userAgent: z.string().nullable().optional(),
      viewport: z.string().nullable().optional(),
      timezone: z.string().nullable().optional(),
    }),
  )
  .output(z.object({ id: z.string() }));

/** The feedback namespace — path: POST /rpc/feedback/submit. Composed into
 *  the tree by src/router.ts (both routers, marked `S-review`). */
export const feedbackContract = {
  submit: submitFeedback,
};
