import type {
  GetCommandPaletteIndex,
  SearchSite,
} from "wasp/server/operations";
import {
  assertSitewideSearchAccess,
  throwHttpStatus,
} from "../billing/entitlementHttp";
import {
  normalizeSearchQuery,
  getCommandPaletteIndexData,
  searchQueryError,
  searchSiteData,
} from "./operationsCore";

export const searchSite = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  assertSitewideSearchAccess(context);
  const error = searchQueryError(args.query);
  if (error) throwHttpStatus(400, error);
  return await searchSiteData(context.entities, {
    userId: context.user.id,
    query: normalizeSearchQuery(args.query),
  });
}) satisfies SearchSite<{ query: string }>;

export const getCommandPaletteIndex = (async (_args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  assertSitewideSearchAccess(context);
  return await getCommandPaletteIndexData(context.entities, {
    userId: context.user.id,
  });
}) satisfies GetCommandPaletteIndex<void>;
