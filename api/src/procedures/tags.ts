/**
 * The tags procedures — thin wrappers over the domain cores (#16, spec
 * `docs/specs/tag-management.md`). Tags are per-user data (tenancy lives in
 * the cores: the task must belong to the caller; tag rows are per-user by the
 * `@@unique([userId, name])` + upsert convention).
 *
 * Entitlement (2026-09-26): tags are a Pro feature — the whole surface sits
 * behind `assertTagsAllowed` (the rituals pattern; a 402 with
 * `{ feature, reason }` rides the DECLARED error map). This reverses the
 * spec's original "outside billing" call; the onboarding reserved-seed still
 * runs for every account so an upgrade finds the matcher names ready.
 */
import { implement } from "@orpc/server";
import { contractRouter } from "@actionamp/contract";
import type { ApiContext } from "../context.js";
import {
  assertTagsAllowed,
  linkTaskTagCore,
  listTagsCore,
  unlinkTaskTagCore,
} from "@actionamp/domain/tags";
import { requireUser } from "../context.js";

const ORPC = implement(contractRouter).$context<ApiContext>();

const tagsList = ORPC.tags.list.handler(async ({ context }) => {
  const user = requireUser(context);
  assertTagsAllowed(user);
  return await listTagsCore(context.entities, { userId: user.id });
});

const tagsLink = ORPC.tags.link.handler(async ({ context, input }) => {
  const user = requireUser(context);
  assertTagsAllowed(user);
  return await linkTaskTagCore(context.entities, {
    userId: user.id,
    taskId: input.taskId,
    name: input.name,
  });
});

const tagsUnlink = ORPC.tags.unlink.handler(async ({ context, input }) => {
  const user = requireUser(context);
  assertTagsAllowed(user);
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
