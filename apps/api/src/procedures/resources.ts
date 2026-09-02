/**
 * The resources procedures (S9) — thin wrappers over the domain cores,
 * mirroring webapp/src/resources/operations.ts (see the P0 notes:
 * packages/contract/src/s9-search-resources/README.md §2/§5).
 *
 * Guard placement is parity-critical: ownership (404) → SIMPLE_LIST type
 * (400, "A Simple-list Project keeps only checklist items.") → lens gate
 * (402, the Work-lens rule) → core. Unknown/foreign resources 404 the same
 * way. The core's own Errors (bad url, empty title, empty patch) map onto
 * BAD_REQUEST so the sheet surfaces them inline.
 *
 * Reads ride the project detail payload (getProjectData already carries
 * `resources`, createdAt desc) — no list op, matching webapp.
 *
 * NOTE — fragment implements FRAGMENT: this file implements
 * `resourcesContract` directly (not the composed `contractRouter`) so
 * parallel slices never edit shared composition. The one-line composition
 * for apps/api/src/router.ts lives in docs/plans/slices/s9-wiring.md.
 */
import { implement, ORPCError } from "@orpc/server";
import { resourcesContract } from "@actionamp/contract";
import {
  assertLensAllowed,
  HttpError,
  type GuardUser,
} from "@actionamp/domain/projects";
import {
  assertResourceProject,
  resourceProjectLookup,
} from "@actionamp/domain/resources";
import {
  createResourceCore,
  deleteResourceCore,
  getResourceData,
  updateResourceCore,
} from "@actionamp/domain/resources";
import type { ApiContext } from "../context.js";
import { requireUser } from "../context.js";

const ORPC = implement(resourcesContract).$context<ApiContext>();

/** Re-throw a domain HttpError as the contract's DECLARED oRPC error. */
function toOrpcError(err: unknown): never {
  if (err instanceof HttpError) {
    if (err.statusCode === 402) {
      // PAYMENT_REQUIRED is not an oRPC built-in: without an explicit status
      // it answers 500 on the wire even when declared in the contract.
      throw new ORPCError("PAYMENT_REQUIRED", {
        status: 402 as const,
        message: err.message,
        data: err.data as Record<string, string> | undefined,
      });
    }
    if (err.statusCode === 404) {
      throw new ORPCError("NOT_FOUND", { message: err.message });
    }
    throw new ORPCError("BAD_REQUEST", { message: err.message });
  }
  // Core validation `Error`s are user-facing copy ("Use a full http:// or
  // https:// link.", "Resource title cannot be empty.", "Provide a title,
  // url, or notes to update.") — BAD_REQUEST so the sheet surfaces the
  // message inline (tasks.ts's run() does the same for the task cores).
  const message = err instanceof Error ? err.message : String(err);
  throw new ORPCError("BAD_REQUEST", {
    message,
    cause: err instanceof Error ? err : undefined,
  });
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    toOrpcError(err);
  }
}

function asGuardUser(user: ApiContext["user"]): GuardUser {
  return user as unknown as GuardUser;
}

const create = ORPC.create.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    // Ownership + type FIRST (webapp placement), then the lens gate.
    const project = await resourceProjectLookup(
      context.entities,
      asGuardUser(user),
      input.projectId,
    );
    // Sync asserts-guard (not awaited — narrowing applies to `project`).
    assertResourceProject(project);
    await assertLensAllowed(context.entities, asGuardUser(user), project.lensId);
    const { resource } = await createResourceCore(context.entities, {
      userId: user.id,
      projectId: input.projectId,
      title: input.title,
      url: input.url,
      notes: input.notes,
    });
    return { id: resource.id, title: resource.title };
  }),
);

const update = ORPC.update.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const existing = await getResourceData(context.entities, {
      userId: user.id,
      id: input.id,
    }).catch(() => null);
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Resource not found." });
    }
    await assertLensAllowed(context.entities, asGuardUser(user), existing.project.lensId);
    const { resource } = await updateResourceCore(context.entities, {
      userId: user.id,
      id: input.id,
      title: input.title,
      url: input.url,
      notes: input.notes,
    });
    return { id: resource.id, title: resource.title };
  }),
);

const remove = ORPC.delete.handler(async ({ context, input }) =>
  guard(async () => {
    const user = requireUser(context);
    const existing = await getResourceData(context.entities, {
      userId: user.id,
      id: input.id,
    }).catch(() => null);
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Resource not found." });
    }
    await assertLensAllowed(context.entities, asGuardUser(user), existing.project.lensId);
    const result = await deleteResourceCore(context.entities, {
      userId: user.id,
      id: input.id,
    });
    return { id: result.id };
  }),
);

/** The implemented resources fragment — composed by src/router.ts (one line;
 *  see docs/plans/slices/s9-wiring.md). */
export const resourcesProcedures = {
  create,
  update,
  delete: remove,
};
