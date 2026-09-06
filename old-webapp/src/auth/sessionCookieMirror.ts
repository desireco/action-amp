/**
 * Client-side wasp_session cookie mirror.
 *
 * The Wasp client SDK sends the session token as an Authorization header on
 * its own API calls and does NOT use credentialed fetch — so even though the
 * server correctly stamps Set-Cookie on authenticated responses
 * (sessionCookie.ts), the browser drops those cookies: a cross-origin
 * response's Set-Cookie is only honored when the request was credentialed.
 *
 * Some requests can't carry an Authorization header at all — `<img>` loads
 * (captured-image thumbnails via /api/attachments/:id) and the PWA
 * share-target's top-level form POST. Those rely on the wasp_session cookie
 * existing. This module mirrors the SDK-held session token into that cookie
 * from the client side, closing the loop.
 *
 * The mirror is intentionally NOT httpOnly: the token already lives in
 * localStorage (same XSS exposure — see sessionCookie.ts's security notes),
 * and client JS is the only writer the browser will actually accept here.
 * In production the client and API are separate hosts under one site
 * (app./api.actionamp.com), so the cookie must carry Domain=<shared suffix>
 * — a host-only write would never reach the API origin. SameSite=Lax + that
 * shared site lets the cookie ride same-site subresource requests; on
 * localhost (dev) both roles share one host and the cookie stays host-only.
 */
import { getSessionId } from "wasp/client/api";

const SESSION_COOKIE_NAME = "wasp_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // keep in sync with sessionCookie.ts

/**
 * The `Domain=` attribute the mirrored cookie needs so the API host can see
 * it. A bare document.cookie write is host-only: a cookie set on
 * app.actionamp.com is never sent to api.actionamp.com, so `<img>` requests
 * to /api/attachments/:id would arrive cookie-less and 401 in production
 * (dev is unaffected — one localhost host serves both roles, ports aside).
 * When the client and API hosts share a registrable suffix
 * (app./api.actionamp.com → actionamp.com), widen the cookie to it;
 * otherwise leave it host-only. Exported for the unit test.
 */
export function cookieDomainAttribute(
  clientHost: string,
  apiOrigin: string,
): string {
  try {
    const apiHost = new URL(apiOrigin).hostname;
    if (!clientHost.includes(".") || clientHost === apiHost) return "";
    // Last two labels — the shared site. (Public-suffix registries can't be
    // honored client-side without the full list; exotic hosts simply won't
    // match and keep the host-only cookie.)
    const suffix = clientHost.split(".").slice(-2).join(".");
    const shared =
      apiHost.endsWith(`.${suffix}`) && clientHost.endsWith(`.${suffix}`);
    return shared ? `; Domain=${suffix}` : "";
  } catch {
    // Unparseable/absent API origin — host-only is the safe default.
    return "";
  }
}

export function syncSessionCookie(): void {
  // SSR/node guard: probing globalThis (not the bare `document` binding,
  // which would throw a ReferenceError where it does not exist).
  if (!("document" in globalThis)) return;
  try {
    const token = getSessionId();
    // The Domain attribute must be identical on set and clear, or the clear
    // only removes the host-only variant and the domain cookie survives.
    const domain = cookieDomainAttribute(
      window.location.hostname,
      import.meta.env.REACT_APP_API_URL ?? "",
    );
    if (token) {
      document.cookie = `${SESSION_COOKIE_NAME}=${token}; path=/; max-age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${domain}`;
    } else {
      document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0${domain}`;
    }
  } catch {
    // Cookie access can throw (e.g. blocked in some privacy modes). The app
    // keeps working via the Bearer path; only cookie-based flows degrade.
  }
}
