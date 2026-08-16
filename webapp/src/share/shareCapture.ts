import type { Request, Response } from "express";
import { isJsonString } from "../shared/jsonValue";
import { createInboxItemCore } from "../inbox/operationsCore";
import { getSessionAuth } from "../auth/sessionAuth";
import { composeShareText, type ShareFields } from "./composeShareText";

// POST /api/share — the manifest.json share_target action. Receives a
// form-urlencoded body (title / text / url), composes a single capture string,
// saves it via createInboxItemCore (the pure core the Wasp createInboxItem
// action and the CLI cliCapture route both call), and 303-redirects.
//
// Outcomes:
//   logged in, fields present    → save → 303 /share?id=<itemId>
//   logged in, all fields empty  → 303 /share?error=empty
//   logged in, save throws       → log + 303 /share?error=server
//   logged out                   → 303 /login  (user re-shares after sign-in)
//
// Auth: `auth: false` + shareRouteMiddleware's session-cookie check. The share
// POST is a top-level form navigation from the installed PWA — it carries the
// wasp_session cookie (SameSite=lax permits top-level navigations) and no
// Authorization header, and Wasp's `auth: true` handler runs before any
// route middleware on /api/* (it can't see the cookie lift) — so the route
// owns the check. See auth/sessionAuth.ts.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WaspApiContext = { entities: any };

function respondWithRedirect(res: Response, redirect: string, json: boolean) {
  return json
    ? res.status(200).json({ redirect })
    : res.redirect(303, redirect);
}

/** The share_target form body: urlencoded strings (repeated keys can arrive
 *  as string arrays — those drop, same as the old non-string branch). */
type ShareFormBody = Record<string, string | string[]>;

function extractFields(body: ShareFormBody | undefined): ShareFields {
  if (!body) return {};
  return {
    title: isJsonString(body.title) ? body.title : undefined,
    text: isJsonString(body.text) ? body.text : undefined,
    url: isJsonString(body.url) ? body.url : undefined,
  };
}

export const shareCapture = async (
  req: Request,
  res: Response,
  _context: WaspApiContext,
) => {
  // The installed PWA's same-origin service worker forwards share forms here.
  // It requests JSON so it can redirect the Android share activity back to the
  // app origin; direct POSTs retain the normal 303 behavior.
  const wantsJson = req.query?.response === "json";

  const auth = getSessionAuth(req);
  if (!auth) {
    return respondWithRedirect(res, "/login", wantsJson);
  }

  const text = composeShareText(extractFields(req.body));
  if (!text) return respondWithRedirect(res, "/share?error=empty", wantsJson);

  try {
    const created = await createInboxItemCore(_context.entities, {
      userId: auth.userId,
      text,
    });
    return respondWithRedirect(
      res,
      `/share?id=${encodeURIComponent(created.id)}`,
      wantsJson,
    );
  } catch (err) {
    console.error("[share] capture failed:", err);
    return respondWithRedirect(res, "/share?error=server", wantsJson);
  }
};
