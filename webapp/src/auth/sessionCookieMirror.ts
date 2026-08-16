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
 * SameSite=Lax + the shared site (localhost in dev, *.actionamp.com in prod)
 * lets the cookie ride same-site subresource requests.
 */
import { getSessionId } from "wasp/client/api";

const SESSION_COOKIE_NAME = "wasp_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // keep in sync with sessionCookie.ts

export function syncSessionCookie(): void {
  if (typeof document === "undefined") return;
  try {
    const token = getSessionId();
    if (token) {
      document.cookie =
        `${SESSION_COOKIE_NAME}=${token}; path=/; max-age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax`;
    } else {
      document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0`;
    }
  } catch {
    // Cookie access can throw (e.g. blocked in some privacy modes). The app
    // keeps working via the Bearer path; only cookie-based flows degrade.
  }
}
