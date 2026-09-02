// Ported verbatim from webapp/src/shared/imageAttachments.ts (S1+S4 batch —
// the simpleLists core's attachment-input normalization). Pure helpers: no
// framework imports, no DB.
export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_ATTACHMENTS = 4;

export type ImageAttachmentInput = {
  filename: string;
  mimeType: string;
  dataBase64: string;
};

export type PreparedImageAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
};

export function prepareImageAttachments(
  attachments: ImageAttachmentInput[] | undefined,
): PreparedImageAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  if (attachments.length > MAX_IMAGE_ATTACHMENTS) {
    throw new Error(`Attach up to ${MAX_IMAGE_ATTACHMENTS} images at a time.`);
  }
  return attachments.map((attachment) => {
    if (!attachment.mimeType.startsWith("image/")) throw new Error("Only images can be attached.");
    const data = Buffer.from(attachment.dataBase64, "base64");
    if (!data.length || data.length > MAX_IMAGE_ATTACHMENT_BYTES) {
      throw new Error("Each image must be 5 MB or smaller.");
    }
    return {
      filename: attachment.filename.trim().slice(0, 255) || "Shared image",
      mimeType: attachment.mimeType,
      size: data.length,
      data,
    };
  });
}
