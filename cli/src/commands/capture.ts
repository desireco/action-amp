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
    .description("capture text to your inbox, a project, or a Simple list")
    .argument("<text...>", "the text to capture")
    .option("--title <text>", "shared-page title")
    .option("--content <text>", "shared-page body")
    .option("--source-url <url>", "source link")
    .option("--project-id <id>", "preselect a project for triage")
    .option("--list-id <id>", "save directly to a Simple list")
    .option("--file <path>", "image attachment (repeat up to four times, 5 MB each)", (path, files: string[] = []) => [...files, path], [])
    .option("--json", "emit JSON output")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(async (textParts: any, opts: { title?: string; content?: string; sourceUrl?: string; projectId?: string; listId?: string; file?: string[]; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const text: string = Array.isArray(textParts) ? textParts.join(" ") : String(textParts);
      const body: Record<string, unknown> = { text };
      if (opts.title !== undefined) body.title = opts.title;
      if (opts.content !== undefined) body.content = opts.content;
      if (opts.sourceUrl !== undefined) body.sourceUrl = opts.sourceUrl;
      if (opts.projectId && opts.listId) throw new Error("Use either --project-id or --list-id, not both.");
      if (opts.projectId) body.projectId = opts.projectId;
      if (opts.listId) body.listId = opts.listId;
      if (opts.file?.length) {
        if (opts.file.length > 4) throw new Error("Attach up to 4 images at a time.");
        body.attachments = opts.file.map((file) => {
          const size = statSync(file).size;
          if (size > 5 * 1024 * 1024) throw new Error("Each image must be 5 MB or smaller.");
          const extension = extname(file).toLowerCase();
          const mimeType = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif" } as Record<string, string>)[extension];
          if (!mimeType) throw new Error("Attachments must be JPEG, PNG, GIF, WebP, HEIC, or HEIF images.");
          return { filename: basename(file), mimeType, dataBase64: readFileSync(file).toString("base64") };
        });
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
