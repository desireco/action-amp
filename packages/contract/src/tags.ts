/**
 * The tags contract — S16-adjacent cross-cutting surface (#16, spec
 * `docs/specs/tag-management.md`). Tags are created at triage via `#token`
 * parsing (grammar v2.1); these ops make them VISIBLE and EDITABLE after the
 * fact: the user's tag list (the typeahead source), link/unlink on a task.
 * Deliberately minimal per the spec — no rename/merge/delete/color ops.
 *
 * Reserved tag names (`~15m`, `low-energy`, …) are seeded per user in
 * onboarding (domain `seedReservedTagsCore`); the UI treats membership in
 * that list as the "feeds the matcher" signal (muted chip styling).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";
import { ProGateErrorMap } from "./projects.js";

/** A tag row as the typeahead and the task-detail chips read it. */
export const TagRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

/** The user's tags, name-ordered — the add-tag typeahead's source. */
export const listTags = oc.output(z.array(TagRowSchema));

/**
 * Resolve-or-create the tag by name (case-insensitive, leading `#`/`@`
 * stripped — the triage normalization) and connect it to the task.
 * Idempotent: re-linking a connected tag is a no-op, never an error.
 * Tenancy-safe: the task must belong to the caller.
 */
export const linkTaskTag = oc
  .input(z.object({ taskId: z.string().min(1), name: z.string().min(1) }))
  .errors(ProGateErrorMap)
  .output(
    z.object({
      taskId: z.string(),
      tagId: z.string(),
      name: z.string(),
    }),
  );

/**
 * Disconnect the tag from the task. The Tag row itself is never deleted
 * (other tasks may use it — the spec decision); only the link goes.
 */
export const unlinkTaskTag = oc
  .input(z.object({ taskId: z.string().min(1), tagId: z.string().min(1) }))
  .errors(ProGateErrorMap)
  .output(z.object({ taskId: z.string(), tagId: z.string() }));

/** The tags namespace — paths: POST /rpc/tags/{list,link,unlink}. */
export const tagsContract = {
  list: listTags,
  link: linkTaskTag,
  unlink: unlinkTaskTag,
};
