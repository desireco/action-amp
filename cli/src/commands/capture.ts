/** capture — quick-capture to inbox. NL parsing (#project, @date, !priority, tags). */
import { Command } from "commander";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { request } from "../api.js";
import { emit, type OutputCtx } from "../output.js";
import type { CaptureResult } from "../types.js";

export function makeCaptureCommand(): Command {
  const cmd = new Command("capture");
  cmd
    .description("quick-capture text to your inbox")
    .argument("<text...>", "the text to capture")
    .option("--title <text>", "shared-page title")
    .option("--content <text>", "shared-page body")
    .option("--source-url <url>", "source link")
    .option("--file <path>", "one image attachment (maximum 5 MB)")
    .option("--json", "emit JSON output")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(async (textParts: any, opts: { title?: string; content?: string; sourceUrl?: string; file?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const text: string = Array.isArray(textParts) ? textParts.join(" ") : String(textParts);
      const body: Record<string, unknown> = { text };
      if (opts.title !== undefined) body.title = opts.title;
      if (opts.content !== undefined) body.content = opts.content;
      if (opts.sourceUrl !== undefined) body.sourceUrl = opts.sourceUrl;
      if (opts.file) {
        const size = statSync(opts.file).size;
        if (size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");
        const extension = extname(opts.file).toLowerCase();
        const mimeType = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif" } as Record<string, string>)[extension];
        if (!mimeType) throw new Error("Attachment must be a JPEG, PNG, GIF, WebP, HEIC, or HEIF image.");
        body.attachments = [{ filename: basename(opts.file), mimeType, dataBase64: readFileSync(opts.file).toString("base64") }];
      }
      const result = await request<CaptureResult>("/api/cli/capture", {
        method: "POST",
        body,
      });
      emit(
        result,
        () => {
          process.stdout.write("Captured.\n");
        },
        ctx,
      );
    });
  return cmd;
}
