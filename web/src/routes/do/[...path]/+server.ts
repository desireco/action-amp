// Old deep links used the /<section>/… prefix. Strip it: /today/x →
// /today/x, /settings/billing → /settings/billing. Query string rides.
import { redirect } from "@sveltejs/kit";

export const GET = ({ params, url }) =>
  redirect(307, `/${params.path}${url.search}`);
