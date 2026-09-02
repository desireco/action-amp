/**
 * S18 — the attachment-storage seam for `GET /api/cli/attachment/:id`,
 * ported from `webapp/src/attachments/serveAttachment.ts` (the CLI twin).
 *
 * Same owner-gated walk across the five attachment tables (inbox → list-item →
 * task → project → resource; a matching row short-circuits), same 404-for-
 * unknown-AND-foreign (no existence leak), same response headers (image-only,
 * CORP cross-origin, immutable caching, RFC 5987 Content-Disposition — the CLI
 * names the downloaded file from it). The lookup speaks Drizzle directly: the
 * domain seam covers InboxAttachment only, and the walk needs all five tables.
 * Byte-serving is the Hono twin of `writeAttachmentResponse`.
 */
import { eq } from "drizzle-orm";
import type { DomainDb } from "@actionamp/domain/db";
import {
  inboxAttachment,
  inboxItem,
  listItem,
  listItemAttachment,
  project,
  projectAttachment,
  resource,
  resourceAttachment,
  task,
  taskAttachment,
} from "@actionamp/domain/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ServedAttachment = {
  data: Uint8Array;
  filename: string;
  mimeType: string;
  size: number;
};

/** True when `id` is a well-formed attachment uuid (bad ids 404 before any query). */
export function isAttachmentId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * Owner-gated lookup across the attachment tables. Returns null for unknown
 * ids AND foreign ids (no existence leak). Short-circuits: a matching row
 * returns before the remaining tables are consulted.
 */
export async function findOwnedAttachment(
  db: DomainDb,
  { id, userId }: { id: string; userId: string },
): Promise<ServedAttachment | null> {
  // SAFETY: all five walks select the same row shape (bytes + metadata +
  // the parent's owner id).
  type WalkRow = {
    data: Uint8Array;
    filename: string;
    mimeType: string;
    size: number;
    ownerId: string;
  };
  // The tables and their owner-parent joins, in lookup order (inbox seeds
  // first, dispatched entities after). Adding the next table is one entry here.
  const walks: Promise<WalkRow[]>[] = [
    db
      .select({
        data: inboxAttachment.data,
        filename: inboxAttachment.filename,
        mimeType: inboxAttachment.mimeType,
        size: inboxAttachment.size,
        ownerId: inboxItem.userId,
      })
      .from(inboxAttachment)
      .innerJoin(inboxItem, eq(inboxAttachment.inboxItemId, inboxItem.id))
      .where(eq(inboxAttachment.id, id))
      .limit(1),
    db
      .select({
        data: listItemAttachment.data,
        filename: listItemAttachment.filename,
        mimeType: listItemAttachment.mimeType,
        size: listItemAttachment.size,
        ownerId: listItem.userId,
      })
      .from(listItemAttachment)
      .innerJoin(listItem, eq(listItemAttachment.listItemId, listItem.id))
      .where(eq(listItemAttachment.id, id))
      .limit(1),
    db
      .select({
        data: taskAttachment.data,
        filename: taskAttachment.filename,
        mimeType: taskAttachment.mimeType,
        size: taskAttachment.size,
        ownerId: task.userId,
      })
      .from(taskAttachment)
      .innerJoin(task, eq(taskAttachment.taskId, task.id))
      .where(eq(taskAttachment.id, id))
      .limit(1),
    db
      .select({
        data: projectAttachment.data,
        filename: projectAttachment.filename,
        mimeType: projectAttachment.mimeType,
        size: projectAttachment.size,
        ownerId: project.userId,
      })
      .from(projectAttachment)
      .innerJoin(project, eq(projectAttachment.projectId, project.id))
      .where(eq(projectAttachment.id, id))
      .limit(1),
    db
      .select({
        data: resourceAttachment.data,
        filename: resourceAttachment.filename,
        mimeType: resourceAttachment.mimeType,
        size: resourceAttachment.size,
        ownerId: resource.userId,
      })
      .from(resourceAttachment)
      .innerJoin(resource, eq(resourceAttachment.resourceId, resource.id))
      .where(eq(resourceAttachment.id, id))
      .limit(1),
  ];

  for (const walk of walks) {
    const row = (await walk)[0];
    if (row && row.ownerId === userId) {
      // SAFETY: the selected owner row and MIME fields were validated at the
      // attachment boundary (every write path restricts to image/*).
      return {
        data: row.data,
        filename: row.filename,
        mimeType: row.mimeType,
        size: row.size,
      };
    }
    // A foreign row does NOT stop the walk (webapp parity): the owner check
    // runs per table until a match or exhaustion — unknown and foreign both
    // end at the same 404.
  }
  return null;
}

/**
 * The response headers for a found attachment — the Hono twin of
 * `writeAttachmentResponse`. Non-image mime → null (the caller 404s: every
 * write path validates image/*, but a stale or forged row must never be
 * served as executable content under a different Content-Type).
 *
 * Node (and Bun) reject non-latin1 bytes in header values, and real filenames
 * have them (macOS screenshots carry U+202F): serve an ASCII-only filename=
 * fallback plus the RFC 5987 filename* form carrying the true name (the CLI
 * download names files from this header).
 */
export function attachmentHeaders(
  record: ServedAttachment,
): Record<string, string> | null {
  if (!record.mimeType.startsWith("image/")) return null;
  const cleanName = record.filename.replace(/["\r\n]/g, "");
  const asciiName = cleanName.replace(/[^\x20-\x7E]/g, "_") || "image";
  return {
    // CORP opened for cross-origin <img> consumption (the webapp default
    // same-origin would break the client; access control is the PAT check).
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Type": record.mimeType,
    "Content-Length": String(record.size),
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cleanName)}`,
  };
}
