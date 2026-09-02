/**
 * The lenses contract — S7 (lenses/areas) + the S11 Lenses settings tab.
 *
 * Shapes mirror webapp/src/lenses/operationsCore.ts (the reads) + the op-layer
 * CRUD in webapp/src/lenses/operations.ts (the parity checklist lives in
 * s11-settings/README.md §2 "Lenses tab"): list with per-lens non-done counts
 * + blocking projects, create/update (closed 8-key palette, 409 on the
 * [userId,name] unique), two-mode delete (`delete` hard-deletes an EMPTY lens;
 * `reassign` moves Goal/Task/Project rows to a target lens transactionally).
 *
 * Error surface (declared + thrown by the API fragment):
 * - `PAYMENT_REQUIRED` (402) — lens configuration is Pro-only
 *   (`assertLensConfigAllowed`) and Pro is soft-capped at 8 lenses
 *   (`assertUnderCap`, violation feature "a 9th lens"). `data` carries
 *   `{ feature, reason }`.
 * - `CONFLICT` (409) — duplicate lens name, seeded-lens delete, hard delete
 *   with content, reassign goal-name collision (messages are the webapp
 *   strings verbatim).
 * - `NOT_FOUND` (404) — lens/target lens missing or foreign.
 * - `BAD_REQUEST` (400) — unknown palette color, reassign target = self,
 *   empty lens name.
 */

import { oc } from "@orpc/contract";
import { z } from "zod";
import { ProGateErrorMap } from "./projects.js";

/**
 * The curated identity-color palette (webapp styles/tokens.css `--aa-lens-*`).
 * Free-form hex is a non-goal per the lens spec; the picker renders these only.
 */
export const LENS_COLORS = [
  "indigo",
  "emerald",
  "slate",
  "cyan",
  "coral",
  "honey",
  "lime",
  "magenta",
] as const;

/** The wire type for a lens color key (null = unset → indigo fallback). */
export const LensColorSchema = z.enum(LENS_COLORS);

/** One lens in the Settings Lenses tab list (getLenses's row). */
export const LensSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Seeded lenses (Me/Work): renameable + recolorable, never deletable. */
  isDefault: z.boolean(),
  /** The lens included with the Free plan (the FREE-readable one). */
  isIncluded: z.boolean(),
  color: z.string().nullable(),
  purpose: z.string().nullable(),
  /** Any Goal/Project/Task ever touched this lens (done included). */
  hasAnyContent: z.boolean(),
  /** Open projects (the delete dialog's "what would move" context). */
  blockingProjects: z.array(z.object({ id: z.string(), name: z.string() })),
  /** Non-done rows only — what the row's "N goals · N projects · N tasks" renders. */
  counts: z.object({
    goals: z.number().int(),
    projects: z.number().int(),
    tasks: z.number().int(),
  }),
});

/** The create/update return shape (the webapp op's select projection). */
export const LensCreatedSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  isIncluded: z.boolean(),
  color: z.string().nullable(),
  purpose: z.string().nullable(),
});

/**
 * Every owned lens, sorted included-first, then seeded, then createdAt —
 * the stable display order. No entitlement gate: listing is always allowed
 * (gating fires on configuration, not reads).
 */
export const getLenses = oc.output(z.array(LensSummarySchema));

/** Create a lens (Pro; soft cap 8). 402/409 surfaces declared on the map. */
export const createLens = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      name: z.string(),
      color: z.string().nullable().optional(),
      purpose: z.string().optional(),
    }),
  )
  .output(LensCreatedSchema);

/** Edit name / purpose / color of an owned lens (Pro; seeded lenses included). */
export const updateLens = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      purpose: z.string().optional(),
      color: z.string().nullable().optional(),
    }),
  )
  .output(LensCreatedSchema);

/**
 * Delete with an explicit content disposition (webapp deleteLens): `delete`
 * (hard, empty lenses only — no silent cascade) or `reassign` (move every
 * Goal/Task/Project to `targetLensId`, then drop the lens — transactional).
 */
export const deleteLens = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      id: z.string(),
      mode: z.enum(["delete", "reassign"]),
      targetLensId: z.string().optional(),
    }),
  )
  .output(z.object({ id: z.string() }));

/**
 * The lenses namespace — paths: POST /rpc/lenses/{list,create,update,delete}.
 * Composed into the tree by src/router.ts (the composition line lives in
 * docs/plans/slices/s7-s11-wiring.md).
 */
export const lensesContract = {
  list: getLenses,
  create: createLens,
  update: updateLens,
  delete: deleteLens,
};
