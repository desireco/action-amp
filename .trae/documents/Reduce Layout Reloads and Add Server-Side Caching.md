## Findings
- Layout data loads on every navigation:
  - `getSettings()` in `src/layouts/AppLayout.astro:29`
  - `getCollection('projects')` in `src/layouts/AppLayout.astro:34-35` (to build context subitems)
- Pages re-read collections and filesystem frequently:
  - `next.astro`: `getSettings()` at `src/pages/next.astro:10`, `getCollection('actions')` at `:13`, `getCollection('projects')` at `:14`
  - `projects/index.astro`: `getCollection('projects')` at `src/pages/projects/index.astro:18`
  - `areas/index.astro`: `dataReader.getAreas()` at `src/pages/areas/index.astro:10`, `dataReader.getAllProjects()` at `:11`, `getSettings()` at `:12`
  - `dashboard.astro`: four `getCollection(...)` calls at `src/pages/dashboard.astro:7-10`
  - `inbox/index.astro`: direct FS scan of `data/inbox` and read of each `.md` file at `src/pages/inbox/index.astro:22-31`
  - `api/search.ts`: loads every collection on each request at `src/pages/api/search.ts:15,33,57,81,103`
- Node adapter is used (`astro.config.mjs:19-21`), so an in-memory cache will persist across requests within the server process.

## Strategy Overview
- Introduce a lightweight in-memory cache with TTL and request coalescing.
- Replace repeated `getSettings`/`getCollection`/FS scans with cached wrappers.
- Invalidate caches precisely on writes via existing API routes (`/api/settings`, inbox/project/area writers).
- Keep real-time UX where needed (Inbox), but use short TTL and targeted invalidation to avoid stale data.

## Implementation Steps
1. Create `src/lib/cache.ts`:
   - Export `getCached(key, fetcher, { ttlMs })` that:
     - Dedupes concurrent calls by storing in-flight `Promise` per key.
     - Stores `{ value, expiresAt }` per key.
     - Returns cached value until expired.
   - Export `invalidate(keys...)` and `invalidateByPrefix(prefix)`.
2. Cache settings:
   - Add `getCachedSettings()` in `src/lib/data/settings.ts` using `getCached('settings', readSettings, { ttlMs: 5000 })`.
   - Update `src/layouts/AppLayout.astro` and pages (`next.astro`, `areas/index.astro`) to use `getCachedSettings()`.
   - In `src/pages/api/settings.ts`, after `updateSettings(...)`, call `invalidate('settings')`.
3. Cache content collections:
   - Add `getCachedCollection(name: 'projects'|'areas'|'actions'|'inbox'|'reviews')` in `src/lib/content-cache.ts` that wraps `getCollection(name)` with per-collection TTLs (e.g., projects/areas/actions: 5000ms; inbox/reviews: 2000ms).
   - Refactor:
     - `src/layouts/AppLayout.astro` (context projects) to use `getCachedCollection('projects')`.
     - `src/pages/projects/index.astro`, `src/pages/next.astro`, `src/pages/dashboard.astro`, `src/pages/reviews/index.astro` to use cached collections.
     - `src/pages/api/search.ts` to use `getCachedCollection(...)` for each collection.
4. Cache DataReader operations:
   - Wrap `getAreas()` and `getAllProjects()` in `src/lib/data/reader.ts` using cache keys like `areas:list`, `projects:list` with TTL 5000ms.
   - Use these cached methods in `src/pages/areas/index.astro`.
5. Targeted invalidation on writes:
   - In `src/lib/data/writer.ts`:
     - After inbox create/update/delete → `invalidateByPrefix('collection:inbox')`.
     - After area create/update → `invalidate('areas:list'); invalidateByPrefix('collection:areas')` and `invalidateByPrefix('collection:projects')` if area affects project listing.
     - After project create/update → `invalidate('projects:list'); invalidateByPrefix('collection:projects')`.
   - In `src/lib/data/reviews.ts` create-review → `invalidateByPrefix('collection:reviews')`.
6. Request coalescing:
   - Ensure `getCached` stores the in-flight `Promise` so multiple simultaneous navigations don’t re-run the same disk scans.
7. Optional: very short Inbox TTL + proactive invalidation:
   - Keep inbox TTL small (e.g., 1000–2000ms) and rely on invalidation triggered by `/api/inbox` POST.
8. Client navigation polish:
   - Add `rel="prefetch"` for top nav anchors where feasible to overlap network with idle time.
   - Keep `ClientRouter` loader; no change needed.

## Verification
- Add a quick diagnostic counter in cache module (dev-only) to log when a cache miss occurs for keys like `settings`, `collection:projects`.
- Run the existing Playwright suite to ensure no behavioral regressions.
- Manually test:
  - Navigate across pages; confirm layout renders without repeated disk reads within TTL.
  - Change context via Areas page (`src/pages/areas/index.astro`); confirm caches invalidate and nav subitems update immediately.
  - Quick-capture in Inbox; confirm new item appears and inbox cache invalidates.

## Notes & Defaults
- Suggested TTLs: settings 5000ms; projects/areas/actions 5000ms; inbox/reviews 2000ms.
- TTLs can be tuned; provide env overrides later if needed.
- In Node standalone, memory cache is shared for the process; in dev, HMR resets cache as expected.
