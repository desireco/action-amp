/**
 * The search op layer — ported from webapp/src/search/operations.ts (the Wasp
 * operation wrappers), freed of the framework: the API procedures become thin
 * (auth → here), and the guard/validation/composition sequence stays unit-
 * testable exactly where webapp's `operations.test.ts` pinned it:
 * auth → entitlement (402) → query-length validation (400) → core, each step
 * rejecting before any entity read.
 */
import { assertSitewideSearchAccess } from "./guards.js";
import {
  getCommandPaletteIndexData,
  normalizeSearchQuery,
  searchQueryError,
  searchSiteData,
  type CommandPaletteIndexResponse,
  type SearchSiteResponse,
} from "./operationsCore.js";
import { HttpError } from "../projects/httpError.js";
import type { GuardUser } from "../projects/guards.js";

export async function searchSite(
  entities: Parameters<typeof searchSiteData>[0],
  user: GuardUser | null,
  args: { query: string },
): Promise<SearchSiteResponse> {
  if (!user) throw new Error("Not authenticated.");
  assertSitewideSearchAccess(user);
  const error = searchQueryError(args.query);
  if (error) throw new HttpError(400, error);
  return await searchSiteData(entities, {
    userId: user.id,
    query: normalizeSearchQuery(args.query),
  });
}

export async function getCommandPaletteIndex(
  entities: Parameters<typeof getCommandPaletteIndexData>[0],
  user: GuardUser | null,
): Promise<CommandPaletteIndexResponse> {
  if (!user) throw new Error("Not authenticated.");
  assertSitewideSearchAccess(user);
  return await getCommandPaletteIndexData(entities, {
    userId: user.id,
  });
}
