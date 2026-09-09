/**
 * Captured-image attachment display (S12). The bytes live behind the
 * owner-gated `GET /api/attachments/:id` (cookie-authed same-origin GET —
 * `<img>` loads can't set headers, which the API's CSRF stance explicitly
 * exempts). Metadata rides the DTOs; this is the only src builder.
 */
export function attachmentSrc(id: string): string {
  return `/api/attachments/${id}`;
}
