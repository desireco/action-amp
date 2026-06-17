import type { GetTask } from "wasp/server/operations";

/**
 * Fetch a single Task by id, scoped to the logged-in user.
 * A user can never read another user's task — the `userId` clause enforces it.
 * Declared in main.wasp.ts with `auth: true`, so `context.user` is guaranteed.
 */
export const getTask = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  return await context.entities.Task.findUnique({
    where: { id: args.id, userId: context.user.id },
  });
}) satisfies GetTask<{ id: string }>;
