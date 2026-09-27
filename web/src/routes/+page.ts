import { redirect } from "@sveltejs/kit";

// The home screen lives at its explicit URL — /next. The bare root is only
// a shim: every address in the app names its page (query string rides, so
// /?task=… and /?capture=1 keep working). Client-side by design — the build
// is a static SPA (ssr = false), so there is no server to 308.
export function load({ url }: { url: URL }): never {
  redirect(308, `/next${url.search}`);
}
