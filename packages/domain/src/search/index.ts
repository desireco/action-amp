// S9 — public export barrel for the search surface (same pattern as
// src/projects/index.ts).
export {
  getCommandPaletteIndexData,
  normalizeSearchQuery,
  searchQueryError,
  searchSiteData,
  type CommandIndexItem,
  type CommandIndexKind,
  type CommandPaletteIndexResponse,
  type SearchMatchedField,
  type SearchResultKind,
  type SearchResultState,
  type SearchSiteResponse,
  type SearchSiteResult,
} from './operationsCore.js';
export { assertSitewideSearchAccess } from './guards.js';
export { getCommandPaletteIndex, searchSite } from './operations.js';
