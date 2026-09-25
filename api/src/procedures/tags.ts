/**
 * The tags procedures — thin wrappers over the domain cores (#16, spec
 * `docs/specs/tag-management.md`). No entitlement gates: tags are per-user
 * data with no Pro cap (the spec keeps them outside billing), tenancy lives
 * in the cores (the task must belong to the caller; tag rows are per-user by
 * the `@@unique([userId, name])` + upsert convention).
 */
import { implement } from "@orpc/server";
import { contractRouter } from "@actionamp/contract";
import type { ApiContext } from "../context.js";
import {
  linkTaskTagCore,
  listTagsCore,
  unlinkTaskTagCore,
} from "@actionamp/domain/tags";
import { requireUser } from "../context.js";

const ORPC = implement(contractRouter).$context<ApiContext>();

const tagsList = ORPC.tags.list.handler(async ({ context }) => {
  const user = requireUser(context);
  return await listTagsCore(context.entities, { userId: user.id });
});

const tagsLink = ORPC.tags.link.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await linkTaskTagCore(context.entities, {
    userId: user.id,
    taskId: input.taskId,
    name: input.name,
  });
});

const tagsUnlink = ORPC.tags.unlink.handler(async ({ context, input }) => {
  const user = requireUser(context);
  return await unlinkTaskTagCore(context.entities, {
    userId: user.id,
    taskId: input.taskId,
    tagId: input.tagId,
  });
});

export const tagsProcedures = {
  list: tagsList,
  link: tagsLink,
  unlink: tagsUnlink,
};
