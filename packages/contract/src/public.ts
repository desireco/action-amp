/**
 * The public contract — S15 (the marketing site's one DB coupling + the app's
 * public offer pages).
 *
 * `getFounding100Status` mirrors webapp/src/billing/operations.ts's op of the
 * same name: PII-free global counts only — `{ cap: 100, reserved: 2, claimed,
 * remaining: max(0, 98 − claimed), isFull: claimed ≥ 98 }`. The cap math: two
 * of the 100 lifetime spots are launch-partner-reserved, so `isFull` is
 * computed against the PUBLIC cap (98), not the nominal 100. Membership is
 * counted as billed FOUNDER plan OR a manual FOUNDER access grant — never
 * FRIEND (webapp `FOUNDER_MEMBERSHIP_WHERE`, domain billing/config.ts).
 * User-specific state ("am I already a founder?") comes from the account read
 * on the client — this query returns only the global count.
 *
 * The same payload is also served as a REST endpoint, `GET /founding-100/status`
 * (Cache-Control: public, max-age=60; CORS widened for exactly
 * https://actionamp.com) — that handler lives in api/src/procedures/
 * public.ts because it is an HTTP surface, not an oRPC procedure; the Astro
 * marketing site (a separate deployable) can't call the /rpc mount.
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

/** The exact wire payload (field order matches the webapp's res.json call). */
export const Founding100StatusSchema = z.object({
  cap: z.number().int(),
  reserved: z.number().int(),
  claimed: z.number().int(),
  remaining: z.number().int(),
  isFull: z.boolean(),
});
export type Founding100Status = z.infer<typeof Founding100StatusSchema>;

/** Public (no auth) — the landing page's live spots-remaining count. */
export const getFounding100Status = oc.output(Founding100StatusSchema);

/**
 * The public namespace — path: POST /rpc/public/getFounding100Status.
 * Composed into the tree by src/router.ts (the composition line lives in
 * docs/plans/slices/s13-s15-wiring.md).
 */
export const publicContract = {
  getFounding100Status,
};
