import { type ImageAttachmentInput } from "./imageAttachments";

/**
 * Client-side image-file helpers for capture intake (paste, drag-drop).
 *
 * Pure browser code — no Node APIs at module scope, so it bundles cleanly
 * alongside imageAttachments.ts (whose `Buffer` use stays server-side inside
 * prepareImageAttachments, which the client never calls).
 */

/** Read a Blob as a bare base64 string (no data: URL prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Encode a picked File into the op wire shape ({filename, mimeType, dataBase64}). */
export async function fileToImageAttachmentInput(
  file: File,
): Promise<ImageAttachmentInput> {
  return {
    filename: file.name,
    mimeType: file.type,
    dataBase64: await blobToBase64(file),
  };
}

/**
 * Collect files from a paste or drop payload. Checks `files` first; falls
 * back to `items` (`kind === "file"` → `getAsFile()`) because some browsers
 * expose pasted images only through DataTransferItemList. Returns raw
 * candidates — filter by type at the call site.
 */
export function rawFilesFromDataTransfer(dt: DataTransfer): File[] {
  if (dt.files && dt.files.length > 0) return Array.from(dt.files);
  if (!dt.items) return [];
  return Array.from(dt.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

/** Only the image entries of a paste/drop payload. */
export function imageFilesFromDataTransfer(dt: DataTransfer): File[] {
  return rawFilesFromDataTransfer(dt).filter((f) =>
    f.type.startsWith("image/"),
  );
}
