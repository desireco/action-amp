/**
 * Capture image intake — the ⌘K popover's client half of the S12 attachment
 * contract (`createInboxItem.attachments`). The DataTransfer/FileReader
 * helpers are ported from webapp src/shared/imageFiles.ts (the intake the
 * Svelte port originally left text-only); the caps mirror
 * packages/domain/src/shared/imageAttachments.ts, which re-validates
 * server-side. Pure browser code — no Node APIs (the domain's `Buffer` use
 * stays server-side inside prepareImageAttachments, which this never calls).
 */

import { blobToBase64, fileToDataUrl } from "../share";

/** The contract's AttachmentInput, shape-typed (api.ts owns contract imports). */
export interface CaptureAttachmentInput {
  filename: string;
  mimeType: string;
  dataBase64: string;
}

export const MAX_CAPTURE_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Collect files from a paste or drop payload. Checks `files` first; falls
 * back to `items` (`kind === "file"` → `getAsFile()`) because some browsers
 * expose pasted images only through DataTransferItemList.
 */
export function rawFilesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  if (dt.files && dt.files.length > 0) return Array.from(dt.files);
  if (!dt.items) return [];
  return Array.from(dt.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

/** A paste/drop payload's image files (raw candidates already type-filtered). */
export function imageFilesFromDataTransfer(dt: DataTransfer | null): File[] {
  return rawFilesFromDataTransfer(dt).filter((f) => f.type.startsWith("image/"));
}

/** Read a Blob/File as a data: URL preview (CSP-safe; re-exported for the popover). */
export { fileToDataUrl };

/** Encode a picked File into the op wire shape ({filename, mimeType, dataBase64}). */
export async function fileToImageAttachmentInput(
  file: File,
): Promise<CaptureAttachmentInput> {
  return {
    filename: file.name,
    mimeType: file.type,
    dataBase64: await blobToBase64(file),
  };
}
