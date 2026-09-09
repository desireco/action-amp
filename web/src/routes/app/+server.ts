// /app was the old-webapp authed route prefix. Stale links (bookmarks,
// old emails) still hit it — send them home instead of a 404.
import { redirect } from "@sveltejs/kit";

export const GET = () => redirect(307, "/do");
