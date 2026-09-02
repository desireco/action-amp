/**
 * Per-request context + the user-enforcement seam (F10) — shared by every
 * procedure fragment. Kept apart from the router composition so surface
 * fragments never import the composition file (no cycles).
 */
import { ORPCError } from "@orpc/server";
import type { Entities, DomainDb } from "@actionamp/domain/db";
import type { ActingUser } from "./actingUser.js";

/** Per-request context the handlers read. Built per request in index.ts. */
export interface ApiContext {
  /** Drizzle handle — infrastructure lookups only. */
  db: DomainDb;
  /** The Prisma-shaped seam every domain core speaks. */
  entities: Entities;
  /**
   * The authenticated user (F10) — resolved BEFORE the handler by index.ts's
   * /rpc wrapper (session cookie/Bearer → F10a, `aa_` Bearer → F10b). Null
   * when no valid credential rode the request; handlers must go through
   * `requireUser`, which turns null into the typed 401.
   */
  user: ActingUser | null;
}

/**
 * The acting user for a procedure. Throws the typed oRPC UNAUTHORIZED when
 * the wrapper resolved no valid credential.
 */
export function requireUser(context: ApiContext): ActingUser {
  if (!context.user) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Authentication required.",
    });
  }
  return context.user;
}
