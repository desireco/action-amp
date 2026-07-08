import { useEffect } from "react";

/**
 * `/` on the app subdomain → redirect to the marketing apex.
 *
 * Under the Astro split (Phase 6), the marketing site lives at actionamp.com
 * (Astro on Cloudflare Pages) and the Wasp SPA at app.actionamp.com. This route
 * exists because App.tsx navigates unauthenticated users to "/" — without a
 * route there, that would 404. It immediately bounces to the marketing site,
 * which is where someone arriving at app.actionamp.com/ should land anyway.
 *
 * Client-side redirect (not server) because Wasp serves a client-rendered SPA.
 */
export function RedirectToMarketing() {
  useEffect(() => {
    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1";
    if (isLocal) {
      window.location.replace("/login");
      return;
    }
    window.location.replace("https://actionamp.com");
  }, []);
  return null;
}
