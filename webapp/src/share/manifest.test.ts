// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PWA image share target", () => {
  it("registers Android's generic image MIME intent", () => {
    // SAFETY: JSON.parse returns any; cast to the manifest shape for type-safe access.
    const manifest = JSON.parse(
      readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8"),
    ) as {
      share_target: {
        params: { files: { accept: string[] }[] };
      };
    };

    expect(manifest.share_target.params.files[0]?.accept).toContain("image/*");
  });
});
