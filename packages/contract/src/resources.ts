/**
 * The resources contract — S9 (surface slice: project-owned reference CRUD).
 *
 * Shapes mirror webapp/src/resources/operationsCore.ts + operations.ts (the
 * parity checklist lives in s9-search-resources/README.md): create/update/
 * delete. A Resource is project-owned reference material — a link + notes,
 * "NOT an action": `title` required (trimmed, non-empty), `url` optional
 * (normalized server-side; must parse as http(s) else 400 "Use a full
 * http:// or https:// link."), `notes` optional. Reads ride the existing
 * project detail payload (`projects.detail` → `resources`, createdAt desc) —
 * no separate list op, matching webapp.
 *
 * Wire conventions match projects.ts: `PAYMENT_REQUIRED` (the Work-lens gate
 * — FREE users cannot file into a non-included lens), `NOT_FOUND` (unknown/
 * foreign project or resource), `BAD_REQUEST` (SIMPLE_LIST parent → "A
 * Simple-list Project keeps only checklist items.", empty title, bad url).
 * Image attachments are S12's share-target surface (the contract carries
 * none; webapp's triage/share callers pass them server-side).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

import { ProGateErrorMap } from "./projects.js";

/** Create a resource in a project → `{ id, title }`. */
export const createResource = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      projectId: z.string().min(1),
      title: z.string(),
      url: z.string().optional(),
      notes: z.string().optional(),
    }),
  )
  .output(z.object({ id: z.string(), title: z.string() }));

/**
 * Update at least one of title/url/notes — an empty patch is a 400 ("Provide
 * a title, url, or notes to update."). `url: ""` clears the link.
 */
export const updateResource = oc
  .errors(ProGateErrorMap)
  .input(
    z.object({
      id: z.string().min(1),
      title: z.string().optional(),
      url: z.string().optional(),
      notes: z.string().optional(),
    }),
  )
  .output(z.object({ id: z.string(), title: z.string() }));

/** Delete — resources leave with their project (cascade) or this op. */
export const deleteResource = oc
  .errors(ProGateErrorMap)
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ id: z.string() }));

/** The resources namespace — paths: POST /rpc/resources/{create,update,delete}. */
export const resourcesContract = {
  create: createResource,
  update: updateResource,
  delete: deleteResource,
};
