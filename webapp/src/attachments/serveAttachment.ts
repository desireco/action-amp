import type { Request, Response } from "express";

// GET /api/attachments/:id — serve a captured image's bytes to its owner.
//
// This route is the ONLY reader of the `data` column on InboxAttachment and
// ListItemAttachment. List queries select metadata only; the bytes leave the
// database exclusively through here (and the CLI twin route
// /api/cli/attachment/:id, which shares the helpers below), gated to the
// requesting user via the parent item's userId. That makes this the storage
// seam: if attachments move to object storage later, this handler is the
// single place to rewrite — callers (img src URLs) never change.
//
// Auth: `auth: false` + sessionRouteAuthMiddleware (see auth/sessionAuth.ts)
// — <img> tags can't send an Authorization header, so authentication rides
// the wasp_session cookie (lifted into a Bearer inside this route's stack).
// The middleware attaches `req.sessionAuth` (typed below).
//
// Foreign and unknown ids both 404 — no existence leak across users.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionAuthRequest = Request & { sessionAuth?: { userId: string } };

export type ServedAttachment = {
  data: Uint8Array | Buffer;
  filename: string;
  mimeType: string;
  size: number;
};

/** The attachment-delegate pair both serve routes run against. */
export type AttachmentEntities = {
  InboxAttachment: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
  };
  ListItemAttachment: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
  };
};

/** True when `id` is a well-formed attachment uuid (Prisma uuid lookups throw otherwise). */
export function isAttachmentId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * Owner-gated lookup across both attachment tables. Returns null for unknown
 * ids AND foreign ids (no existence leak). Short-circuits: a matching
 * InboxAttachment never consults the ListItem table.
 */
export async function findOwnedAttachment(
  entities: AttachmentEntities,
  { id, userId }: { id: string; userId: string },
): Promise<ServedAttachment | null> {
  const inboxAttachment = await entities.InboxAttachment.findUnique({
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
    return inboxAttachment;
  }
  const listAttachment = await entities.ListItemAttachment.findUnique({
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
    return listAttachment;
  }
  return null;
}

/**
 * Stream a found attachment: image/* enforced (every write path validates it,
 * but a stale or forged row must never be served as executable content under
 * a different Content-Type), CORP opened for cross-origin <img> consumption,
 * immutable caching (ids are uuids — the bytes for a given id never change).
 * Returns the response status so callers can short-circuit.
 */
export function writeAttachmentResponse(
  res: Response,
  record: ServedAttachment,
): 200 | 404 {
  if (!record.mimeType.startsWith("image/")) {
    res.status(404).json({ error: "Not found." });
    return 404;
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
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`);
  res.status(200).end(Buffer.from(record.data));
  return 200;
}

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
  const id = req.params.id;
  if (!isAttachmentId(id)) {
    return res.status(404).json({ error: "Not found." });
  }

  let record: ServedAttachment | null = null;
  try {
    record = await findOwnedAttachment(_context.entities, {
      id,
      userId: auth.userId,
    });
  } catch (err) {
    console.error("[attachments/serve] lookup failed:", err);
    return res.status(500).json({ error: "Could not load the image." });
  }

  if (!record) {
    return res.status(404).json({ error: "Not found." });
  }
  writeAttachmentResponse(res, record);
};
