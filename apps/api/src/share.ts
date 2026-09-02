/**
 * S12 — POST /api/share, the manifest.json share_target's direct server path.
 *
 * Ported from webapp/src/share/{composeShareText.ts,shareCapture.ts,
 * shareRouteMiddleware.ts} (the parity checklist lives in
 * packages/contract/src/s12-push-pwa/README.md §3.4/§3.5).
 *
 * The PRIMARY share path is the service worker: it intercepts same-origin
 * `POST /share` (the manifest action), stashes the multipart form in
 * IndexedDB, and 303s to the review page — nothing reaches the server until
 * the user confirms (the review page then calls the normal authenticated RPC
 * ops). This route is the text-only urlencoded fallback / SW-bridge: it
 * composes the fields into one capture string and saves via
 * `createInboxItemCore` (the same pure core the inbox RPC op and the CLI
 * capture route call).
 *
 * Outcomes (303 unless `?response=json`, which answers `200 {redirect}` —
 * the service-worker bridge mode):
 *   logged out                  → /login            (user re-shares after sign-in)
 *   logged in, all fields empty → /share?error=empty
 *   logged in, save throws      → /share?error=server (logged server-side)
 *   logged in, fields present   → /share?id=<itemId> (id encodeURIComponent'd)
 *
 * Auth: **session cookie only, no CSRF header** — this is a top-level form
 * navigation from the installed PWA (SameSite=Lax permits it; no fetch, so
 * no custom header is possible). That is exactly the webapp's
 * `auth:false` + shareRouteMiddleware(`attachSessionFromCookie` +
 * `sessionAuthMiddleware`) posture, and deliberately unlike the /rpc
 * wrapper's x-requested-with rule. Repeated form keys may arrive as arrays —
 * those drop, same as the webapp's non-string branch.
 *
 * `composeShareCapture`/`composeShareText` are the canonical copies (pure,
 * unit-tested here); the web client keeps a keep-in-sync copy in
 * apps/web/src/lib/share.ts (the capture-parser precedent).
 */
import type { Context } from "hono";
import { createInboxItemCore } from "@actionamp/domain/inbox";
import type { Entities } from "@actionamp/domain/db";
import type { DomainDb } from "@actionamp/domain/db";
import { readSessionCookie, validateSession } from "./auth/session.js";

// ----------------------------------------------------------------
// Field composition (webapp composeShareText.ts, verbatim)
// ----------------------------------------------------------------

const MAX_FIELD_LEN = 2000;

export type ShareFields = {
  title?: string;
  text?: string;
  url?: string;
};

export type ShareCapture = {
  title: string;
  content: string;
  url: string;
  text: string;
};

function clean(v: string | undefined): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  if (trimmed.length <= MAX_FIELD_LEN) return trimmed;
  return trimmed.slice(0, MAX_FIELD_LEN) + "…";
}

export function composeShareCapture(fields: ShareFields): ShareCapture {
  const title = clean(fields.title);
  let text = clean(fields.text);
  let url = clean(fields.url);

  // No content at all → empty (caller decides what to do).
  if (!title && !text && !url) return { title: "", content: "", url: "", text: "" };

  // Some Android shares put the page title in `title`, then repeat it at the
  // start of `text` before the URL. Keep the useful link without making the
  // inbox item read like "Title: Title https://…".
  if (title && text) {
    const titlePrefix = `${title} `;
    if (text === title) text = "";
    else if (text.startsWith(titlePrefix)) {
      text = text.slice(titlePrefix.length).trim();
      if (!url && /^https?:\/\/\S+$/i.test(text)) {
        url = text;
        text = "";
      }
    }
  }

  // URL always appended last, after " — ", when present.
  const tail = url ? ` — ${url}` : "";
  const composed = title && text
    ? `${title}: ${text}${tail}`
    : title
      ? `${title}${tail}`
      : text
        ? `${text}${tail}`
        : url;

  return { title, content: text, url, text: composed };
}

export function composeShareText(fields: ShareFields): string {
  return composeShareCapture(fields).text;
}

// ----------------------------------------------------------------
// The route
// ----------------------------------------------------------------

/**
 * Injectable capture dependency — the seam the tests swap (the pure core's
 * DB work is its own tested concern; the handler's redirects + compose
 * threading are what this route's tests exercise).
 */
export const shareDeps = {
  createInboxItem: createInboxItemCore,
};

/** The share_target form body: urlencoded strings (repeated keys arrive as
 *  arrays — those drop, same as the webapp's non-string branch). */
type ShareFormBody = Record<string, string | string[] | File | File[] | undefined>;

function extractFields(body: ShareFormBody): ShareFields {
  const pick = (value: string | string[] | File | File[] | undefined): string | undefined =>
    typeof value === "string" ? value : undefined;
  return {
    title: pick(body.title),
    text: pick(body.text),
    url: pick(body.url),
  };
}

/** A 303 (or 200-json) response — the exact shape the PWA activity expects. */
function respondWithRedirect(c: Context, redirect: string, json: boolean): Response {
  if (json) return c.json({ redirect });
  // Hono's c.redirect defaults 302; the manifest/webapp contract is 303.
  return c.body(null, 303, { Location: redirect });
}

export interface ShareRouteDeps {
  db: DomainDb;
  entities: Entities;
  /** Injectable session resolver — the tests' seam (default: the real
   *  F10a cookie validation; a top-level form POST carries the cookie and
   *  nothing else). */
  getSession?(token: string | undefined): Promise<{ id: string } | null>;
}

/** Build the POST /api/share Hono handler over the app's singletons. */
export function createShareRoute({ db, entities, getSession }: ShareRouteDeps) {
  const resolveSession =
    getSession ?? ((token: string | undefined) => validateSession(db, token));
  return async function shareCapture(c: Context): Promise<Response> {
    // The installed PWA's same-origin service worker forwards share forms
    // here with ?response=json so it can redirect the Android share activity
    // back to the app origin; direct POSTs retain the normal 303 behavior.
    const wantsJson = c.req.query("response") === "json";

    // Session-cookie auth ONLY (see module header): no Bearer, no CSRF
    // header — a top-level form POST carries wasp_session and nothing else.
    const sessionUser = await resolveSession(readSessionCookie(c.req.header("cookie")));
    if (!sessionUser) {
      return respondWithRedirect(c, "/login", wantsJson);
    }

    let body: ShareFormBody;
    try {
      // Hono parses application/x-www-form-urlencoded (the enctype the
      // webapp route declared) into string values; File values only appear
      // for multipart, which this fallback never promised to handle — the
      // pick() above drops them like the webapp dropped non-strings.
      body = (await c.req.parseBody()) as ShareFormBody;
    } catch {
      body = {};
    }

    const text = composeShareText(extractFields(body));
    if (!text) return respondWithRedirect(c, "/share?error=empty", wantsJson);

    try {
      const created = await shareDeps.createInboxItem(entities, {
        userId: sessionUser.id,
        text,
      });
      return respondWithRedirect(c, `/share?id=${encodeURIComponent(created.id)}`, wantsJson);
    } catch (err) {
      console.error("[share] capture failed:", err);
      return respondWithRedirect(c, "/share?error=server", wantsJson);
    }
  };
}
