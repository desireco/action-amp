// Old deep links used the /do/<section>/… prefix. Strip it: /do/today/x →
// /today/x, /do/settings/billing → /settings/billing. Query string rides;
// subpaths with no new route remap to their nearest page (lib/legacyRedirects).
import { redirect } from "@sveltejs/kit";
import { legacyTarget } from "$lib/legacyRedirects";

export const GET = ({ params, url }) =>
  redirect(308, legacyTarget(`/${params.path}`, url.search));
