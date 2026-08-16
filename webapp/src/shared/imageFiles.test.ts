import { describe, expect, it } from "vitest";
import {
  blobToBase64,
  fileToImageAttachmentInput,
  imageFilesFromDataTransfer,
  rawFilesFromDataTransfer,
} from "./imageFiles";

// Client-side capture intake helpers — DataTransfer extraction (files-first,
// items fallback) and base64 encoding for the op wire shape.

function file(name: string, type: string): File {
  return new File(["body"], name, { type });
}

describe("imageFiles", () => {
  it("rawFilesFromDataTransfer prefers the files list", () => {
    const png = file("a.png", "image/png");
    // SAFETY: DataTransfer is a DOM API not available in node; mock fixture cast via unknown.
    const dt = { files: [png], items: [] } as unknown as DataTransfer;
    expect(rawFilesFromDataTransfer(dt)).toEqual([png]);
  });

  it("falls back to items when files is empty (paste quirk in some browsers)", () => {
    const png = file("pasted.png", "image/png");
    // SAFETY: DataTransfer is a DOM API not available in node; mock fixture cast via unknown.
    const dt = {
      files: [],
      items: [
        { kind: "file", getAsFile: () => png },
        { kind: "string", getAsFile: () => null },
        { kind: "file", getAsFile: () => null }, // broken entry — skipped
      ],
    } as unknown as DataTransfer;
    expect(rawFilesFromDataTransfer(dt)).toEqual([png]);
  });

  it("imageFilesFromDataTransfer keeps only image/* entries", () => {
    const png = file("a.png", "image/png");
    const pdf = file("b.pdf", "application/pdf");
    // SAFETY: DataTransfer is a DOM API not available in node; mock fixture cast via unknown.
    const dt = { files: [png, pdf] } as unknown as DataTransfer;
    expect(imageFilesFromDataTransfer(dt)).toEqual([png]);
  });

  it("blobToBase64 strips the data-URL prefix", async () => {
    expect(await blobToBase64(new Blob(["hi"]))).toBe("aGk=");
  });

  it("fileToImageAttachmentInput carries filename + mimeType alongside the bytes", async () => {
    const input = await fileToImageAttachmentInput(file("shot.png", "image/png"));
    expect(input.filename).toBe("shot.png");
    expect(input.mimeType).toBe("image/png");
    expect(input.dataBase64).toBe("Ym9keQ=="); // "body"
  });
});
