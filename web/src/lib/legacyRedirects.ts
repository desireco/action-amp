// The legacy-path remap shared by the dev-mode +server.ts redirects
// (routes/app, routes/do). Production answers these from the API instead
// (api/src/legacy-redirects.ts — the static SPA build drops +server
// endpoints); keep the two maps in sync.
//
// Old subpaths whose stripped form has no route in the new app — map them to
// the nearest living page so a stale link never lands on the 404 card.
export const LEGACY_REMAP: Record<string, string> = {
  // Cadence reviews (Today/Week/Month) aren't ported; the Logbook is the
  // accomplishments surface they built on. Re-point when reviews ship.
  "/review": "/logbook",
  "/review/today": "/logbook",
  "/review/week": "/logbook",
  "/review/month": "/logbook",
  // PAT management became the CLI's OAuth flow (`actionamp login`); no
  // settings page exists — send token managers to the settings hub.
  "/settings/pat": "/settings",
  // The legacy admin settings alias always was a redirect to the dashboard.
  "/settings/admin": "/admin",
};

// Stripped legacy subpath → redirect target. Remapped paths drop the query
// (their target page doesn't consume it); passthroughs keep it (e.g.
// ?capture=1, ?task=…). `subpath` is what follows the legacy prefix
// ("/today/x" for /do/today/x, "" for the bare prefix).
export function legacyTarget(subpath: string, search: string): string {
  const stripped = subpath || "/";
  return LEGACY_REMAP[stripped] ?? stripped + search;
}
