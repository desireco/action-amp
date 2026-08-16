import type { Request, Response } from "express";

// GET /api/attachments/:id — serve a captured image's bytes to its owner.
//
// This route is the ONLY reader of the `data` column on InboxAttachment and
// ListItemAttachment. List queries select metadata only; the bytes leave the
// database exclusively through here, gated to the requesting user via the
// parent item's userId. That makes it the storage seam: if attachments move
// to object storage later, this handler is the single place to rewrite —
// callers (img src URLs) never change.
//
// Auth: `auth: false` + sessionRouteAuthMiddleware (see auth/sessionAuth.ts)
// — <img> tags can't send an Authorization header, so authentication rides
// the wasp_session cookie (lifted into a Bearer inside this route's stack).
// The middleware attaches `req.sessionAuth` (typed below).
//
// Foreign and unknown ids both 404 — no existence leak across users.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionAuthRequest = Request & { sessionAuth?: { userId: string } };

type ServedAttachment = {
  data: Uint8Array | Buffer;
  filename: string;
  mimeType: string;
  size: number;
};

export const serveAttachment = async (
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _context: { entities: any },
) => {
  const auth = (req as SessionAuthRequest).sessionAuth;
  if (!auth) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  const userId = auth.userId;
  const id = req.params.id;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return res.status(404).json({ error: "Not found." });
  }

  let record: ServedAttachment | null = null;
  try {
    const inboxAttachment = await _context.entities.InboxAttachment.findUnique({
      where: { id },
      select: {
        data: true,
        filename: true,
        mimeType: true,
        size: true,
        inboxItem: { select: { userId: true } },
      },
    });
    if (inboxAttachment?.inboxItem.userId === userId) {
      record = inboxAttachment;
    } else {
      const listAttachment = await _context.entities.ListItemAttachment.findUnique({
        where: { id },
        select: {
          data: true,
          filename: true,
          mimeType: true,
          size: true,
          listItem: { select: { userId: true } },
        },
      });
      if (listAttachment?.listItem.userId === userId) {
        record = listAttachment;
      }
    }
  } catch (err) {
    console.error("[attachments/serve] lookup failed:", err);
    return res.status(500).json({ error: "Could not load the image." });
  }

  if (!record) {
    return res.status(404).json({ error: "Not found." });
  }
  // Every write path validates image/* (prepareImageAttachments); enforce it
  // on read too so a stale or forged row can never be served as executable
  // content under a different Content-Type.
  if (!record.mimeType.startsWith("image/")) {
    return res.status(404).json({ error: "Not found." });
  }

  // Strip characters that would break out of the quoted-string or inject
  // headers; filenames are user-supplied via the share sheet.
  const safeFilename = record.filename.replace(/["\r\n]/g, "");

  // helmet's default CORP (same-origin) would block these bytes in the
  // browser: the client origin (app host / dev :4000) differs from the API
  // origin, and no-cors <img> loads enforce CORP. Explicitly allow
  // cross-origin use; access control is the session check above.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", record.mimeType);
  res.setHeader("Content-Length", String(record.size));
  // Ids are immutable uuids — the bytes for a given id never change.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`);
  return res.status(200).end(Buffer.from(record.data));
};
