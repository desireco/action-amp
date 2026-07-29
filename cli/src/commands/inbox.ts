/**
 * inbox — list, capture (alias), and triage.
 *
 * `capture` is a top-level command (see capture.ts); this module hosts the
 * inbox-scoped list + triage. The browser is better for full triage, but the
 * CLI gives agents (Phase 2) a machine interface.
 *
 * For triage, `--lens-id` is required for task/project decisions but optional
 * overall: an explicit flag wins, else fall back to the active lens in config
 * (set by `lens switch`).
 */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { readConfig } from "../config.js";
import { emit, type OutputCtx } from "../output.js";
import type { InboxItem } from "../types.js";

export function makeInboxCommand(): Command {
  const inbox = new Command("inbox");
  inbox.description("inbox actions (list, triage)");

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
          });
        },
        ctx,
      );
    });

  inbox
    .command("triage <id>")
    .description("triage an inbox item (decision: task-today, upcoming, someday, project, archive, delete)")
    .requiredOption("--decision <decision>", "triage decision")
    .option("--lens-id <id>", "lens to file into (required for task/project/resource; optional for archive/delete)")
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

  return inbox;
}
