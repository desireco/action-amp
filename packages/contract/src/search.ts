/**
 * The search contract — S9 (surface slice: sitewide search + command palette).
 *
 * Shapes mirror webapp/src/search/operationsCore.ts + operations.ts (the
 * parity checklist lives in s9-search-resources/README.md): `searchSite` (the
 * ranked, capped, snippeted full-text query) and `getCommandPaletteIndex` (the
 * compact title-only index the palette fuzzy-matches locally). Both are
 * WHOLE-ACCOUNT Pro capabilities: FREE callers get the 402 gate before any
 * entity read (data carries `{ feature, reason }` byte-exact from webapp —
 * feature "Command palette and search").
 *
 * Wire conventions match projects.ts: temporals cross as ISO strings;
 * `PAYMENT_REQUIRED` is declared via the shared `ProGateErrorMap`; the query
 * length 400s ("Search query must be at least 2 characters." / "…at most 100
 * characters.") are oRPC built-in BAD_REQUESTs with the webapp strings.
 *
 * Deliberate addition (parity bridge, not drift): `entitlement` — webapp's
 * shell knew `entitled` from useAuth and never fired the queries for FREE
 * users; the new stack has no shell identity read yet, so the palette asks
 * this one tiny query instead (S11 settings may retire it).
 */

import { oc } from "@orpc/contract";
import { z } from "zod";

import { ProGateErrorMap } from "./projects.js";

const datetime = () => z.string();

/** The result kinds (webapp SearchResultKind / CommandIndexKind). */
export const SearchResultKindSchema = z.enum([
  "task",
  "project",
  "goal",
  "resource",
  "inbox",
]);

export const SearchMatchedFieldSchema = z.enum([
  "title",
  "body",
  "outcome",
  "note",
  "url",
]);

export const SearchResultStateSchema = z.enum([
  "active",
  "today",
  "upcoming",
  "someday",
  "done",
  "wont-do",
  "inbox",
  "archived",
]);

/** One ranked search hit (webapp SearchSiteResult). href IS the route. */
export const SearchSiteResultSchema = z.object({
  id: z.string(),
  kind: SearchResultKindSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  snippet: z.string().nullable(),
  matchedField: SearchMatchedFieldSchema,
  href: z.string(),
  lens: z
    .object({ id: z.string(), name: z.string(), color: z.string().nullable() })
    .nullable(),
  state: SearchResultStateSchema,
});

/** One compact palette-index entry (webapp CommandIndexItem). */
export const CommandIndexItemSchema = z.object({
  id: z.string(),
  kind: SearchResultKindSchema.or(z.literal("lens")),
  title: z.string(),
  subtitle: z.string().nullable(),
  /** null for lens entries — switching a lens is not a navigation. */
  href: z.string().nullable(),
  aliases: z.array(z.string()),
  lensColor: z.string().nullable().optional(),
  /** ISO datetime — archivedAt | createdAt on inbox records. */
  occurredAt: datetime().nullable().optional(),
});

/**
 * The full sitewide search. 402 for FREE (before any entity read); 400 for a
 * normalized query outside 2–100 chars ("Search query must be at least 2
 * characters." / "…at most 100 characters.").
 */
export const searchSite = oc
  .errors(ProGateErrorMap)
  .input(z.object({ query: z.string() }))
  .output(
    z.object({
      query: z.string(),
      results: z.array(SearchSiteResultSchema),
      truncated: z.boolean(),
    }),
  );

/** The compact title-only index for instant client fuzzy matching. */
export const getCommandPaletteIndex = oc
  .errors(ProGateErrorMap)
  .output(z.object({ items: z.array(CommandIndexItemSchema) }));

/**
 * Parity bridge for the webapp shell's `entitled` flag: lets the palette
 * render the calm ProGate for FREE users without firing the search queries.
 */
export const searchEntitlement = oc.output(
  z.object({ entitled: z.boolean() }),
);

/** The search namespace — paths: POST /rpc/search/{site,index,entitlement}. */
export const searchContract = {
  site: searchSite,
  index: getCommandPaletteIndex,
  entitlement: searchEntitlement,
};

// ---- Client-side DTO types (inferred from the schemas, router-type style). ----

export type SearchResultKind = z.infer<typeof SearchResultKindSchema>;
export type SearchMatchedField = z.infer<typeof SearchMatchedFieldSchema>;
export type SearchResultState = z.infer<typeof SearchResultStateSchema>;
export type SearchSiteResult = z.infer<typeof SearchSiteResultSchema>;
export type CommandIndexItem = z.infer<typeof CommandIndexItemSchema>;
export type CommandIndexKind = SearchResultKind | "lens";
export type SearchSiteResponse = {
  query: string;
  results: SearchSiteResult[];
  truncated: boolean;
};
export type CommandIndexResponse = { items: CommandIndexItem[] };
