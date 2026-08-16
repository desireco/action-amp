/**
 * inbox — list, capture (alias), triage, and attachment download.
 *
 * `capture` is a top-level command (see capture.ts); this module hosts the
 * inbox-scoped list + triage + download. The browser is better for full
 * triage, but the CLI gives agents (Phase 2) a machine interface — including
 * pulling captured images to disk so app/mobile work can loop on real share
 * payloads: `inbox list --json` → attachment ids → `inbox download <id>`.
 *
 * For triage, `--lens-id` is required for task/project decisions but optional
 * overall: an explicit flag wins, else fall back to the active lens in config
 * (set by `lens switch`).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { request, download } from "../api.js";
import { readConfig } from "../config.js";
import { emit, type OutputCtx } from "../output.js";
import type { InboxItem } from "../types.js";

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function makeInboxCommand(): Command {
  const inbox = new Command("inbox");
  inbox.description("inbox actions (list, triage, download)");

  inbox
    .command("list")
    .description("show unprocessed inbox items")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ items: InboxItem[] }>("/api/cli/inbox/list");
      emit(
        result,
        () => {
          if (result.items.length === 0) {
            process.stdout.write("Inbox is empty.\n");
            return;
          }
          result.items.forEach((item, i) => {
            process.stdout.write(`  ${chalk.gray(`${i + 1}.`)} ${item.text}\n`);
            const attached = [
              item.sourceUrl ? "link" : null,
              item.attachments?.length ? `${item.attachments.length} image${item.attachments.length === 1 ? "" : "s"}` : null,
            ].filter(Boolean).join(", ");
            if (attached) process.stdout.write(`     ${chalk.gray(`attached: ${attached}`)}\n`);
            // The ids make `inbox download <id>` usable from text output
            // without a --json round-trip.
            item.attachments?.forEach((a) => {
              process.stdout.write(`     ${chalk.gray(`image ${a.filename} — ${a.id}`)}\n`);
            });
          });
        },
        ctx,
      );
    });

  inbox
    .command("triage <id>")
    .description("triage an inbox item (decision: task-today, upcoming, someday, project, resource, list-item, archive, delete)")
    .requiredOption("--decision <decision>", "triage decision")
    .option("--lens-id <id>", "lens to file into (required for task/project/resource/list-item; optional for archive/delete)")
    .option("--project-id <id>", "existing project to file into")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { decision: string; lensId?: string; projectId?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const body: Record<string, unknown> = { inboxItemId: id, decision: opts.decision };
      // --lens-id flag wins; else fall back to the active lens in config. The
      // server still validates the decision (some decisions ignore lensId).
      const lensId = opts.lensId ?? readConfig()?.lensId;
      if (lensId) body.lensId = lensId;
      if (opts.projectId) body.projectId = opts.projectId;
      const result = await request<{ kind: string; id: string }>("/api/cli/inbox/triage", {
        method: "POST",
        body,
      });
      emit(
        result,
        () => {
          process.stdout.write(`Triaged to ${result.kind}.\n`);
        },
        ctx,
      );
    });

  inbox
    .command("download <attachmentId> [outPath]")
    .description("download a captured image by attachment id (see `inbox list`)")
    .option("--json", "emit JSON output")
    .action(async (attachmentId: string, outPath: string | undefined, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await download(`/api/cli/attachment/${encodeURIComponent(attachmentId)}`);
      // Target: explicit path > server filename > <id>.<ext from mime>.
      const fallbackExt = MIME_EXTENSION[result.mimeType] ?? "img";
      const target = resolve(outPath ?? result.filename ?? `${attachmentId}.${fallbackExt}`);
      writeFileSync(target, result.buffer);
      emit(
        { ok: true as const, path: target, bytes: result.buffer.length, mimeType: result.mimeType, filename: result.filename },
        () => {
          process.stdout.write(`Saved ${result.buffer.length} bytes to ${target}\n`);
        },
        ctx,
      );
    });

  return inbox;
}
