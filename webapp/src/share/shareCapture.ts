import type { Request, Response } from "express";
import { createInboxItemCore } from "../inbox/operationsCore";
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
// `auth: true` on the route resolves context.user from the wasp_session cookie
// the share POST carries (SameSite=lax permits top-level form navigations).
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WaspApiContext = { user?: { id: string }; entities: any };

function respondWithRedirect(res: Response, redirect: string, json: boolean) {
  return json ? res.status(200).json({ redirect }) : res.redirect(303, redirect);
}

function extractFields(body: unknown): ShareFields {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  return {
    title: typeof b.title === "string" ? b.title : undefined,
    text: typeof b.text === "string" ? b.text : undefined,
    url: typeof b.url === "string" ? b.url : undefined,
  };
}

export const shareCapture = async (
  req: Request,
  res: Response,
  context: WaspApiContext,
) => {
  // The installed PWA's same-origin service worker forwards share forms here.
  // It requests JSON so it can redirect the Android share activity back to the
  // app origin; direct POSTs retain the normal 303 behavior.
  const wantsJson = req.query?.response === "json";

  // auth:true → context.user is set iff the cookie was present.
  if (!context.user) {
    return respondWithRedirect(res, "/login", wantsJson);
  }

  const text = composeShareText(extractFields(req.body));
  if (!text) return respondWithRedirect(res, "/share?error=empty", wantsJson);

  try {
    const created = await createInboxItemCore(context.entities, {
      userId: context.user.id,
      text,
    });
    return respondWithRedirect(res, `/share?id=${encodeURIComponent(created.id)}`, wantsJson);
  } catch (err) {
    console.error("[share] capture failed:", err);
    return respondWithRedirect(res, "/share?error=server", wantsJson);
  }
};
