/**
 * attachment — generic image download by attachment id.
 *
 * The serve route (`/api/cli/attachment/:id`) owner-gates across EVERY
 * attachment table (inbox, task, project, resource, list item), so one
 * command serves every surface: `task show` / `project show` /
 * `resource list` (text or --json) surface the ids → `attachment download
 * <id>` pulls the bytes to disk. `inbox download` stays as the original
 * spelling and delegates here.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { download } from "../api.js";
import { emit, type OutputCtx } from "../output.js";

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** The shared download action behind `attachment download` and `inbox download`. */
export async function runAttachmentDownload(
  attachmentId: string,
  outPath: string | undefined,
  ctx: OutputCtx,
): Promise<void> {
  const result = await download(
    `/api/cli/attachment/${encodeURIComponent(attachmentId)}`,
  );
  // Target: explicit path > server filename > <id>.<ext from mime>.
  const fallbackExt = MIME_EXTENSION[result.mimeType] ?? "img";
  const target = resolve(
    outPath ?? result.filename ?? `${attachmentId}.${fallbackExt}`,
  );
  writeFileSync(target, result.buffer);
  emit(
    {
      ok: true as const,
      path: target,
      bytes: result.buffer.length,
      mimeType: result.mimeType,
      filename: result.filename,
    },
    () => {
      process.stdout.write(`Saved ${result.buffer.length} bytes to ${target}\n`);
    },
    ctx,
  );
}

export function makeAttachmentCommand(): Command {
  const attachment = new Command("attachment");
  attachment.description(
    "download a captured image by attachment id (works for inbox, task, project, resource, and list images)",
  );

  attachment
    .command("download <attachmentId> [outPath]")
    .description(
      "download an image by attachment id (ids appear in task/project/resource/inbox output)",
    )
    .option("--json", "emit JSON output")
    .action(async (attachmentId: string, outPath: string | undefined, opts: { json?: boolean }) => {
      await runAttachmentDownload(attachmentId, outPath, {
        json: opts.json ?? false,
      });
    });

  return attachment;
}
