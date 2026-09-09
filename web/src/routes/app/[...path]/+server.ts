// Old /app deep links forwarded the full subpath under /do (the old
// webapp's LegacyAppRedirectPage); keep forwarding it post-flatten:
// /app/today → /today, /app/review/week → the logbook (see lib/legacyRedirects).
import { redirect } from "@sveltejs/kit";
import { legacyTarget } from "$lib/legacyRedirects";

export const GET = ({ params, url }) =>
  redirect(308, legacyTarget(`/${params.path}`, url.search));
