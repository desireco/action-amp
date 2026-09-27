// The app home used to live at /do. Every old surface — bookmarks, emails,
// the auth returnTo — lands here; send them to the What Now screen at its explicit URL.
import { redirect } from "@sveltejs/kit";

export const GET = () => redirect(308, "/next");
