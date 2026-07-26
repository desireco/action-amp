/**
 * logbook — completed tasks, finished projects/goals, archived inbox items.
 *
 * The reflection surface. Optional --lens-id scopes to one lens; without a
 * flag the active lens in config (set by `lens switch`) is used; if neither
 * is set the logbook is global (all accessible lenses) — the same default
 * the server picks when no lensId is sent.
 */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { readConfig } from "../config.js";
import { emit, formatTask, type OutputCtx } from "../output.js";
import type { LogbookEntry } from "../types.js";

export function makeLogbookCommand(): Command {
  const cmd = new Command("logbook");
  cmd
    .description("show completed tasks, finished projects/goals, archived items")
    .option("--lens-id <id>", "scope to one lens (default: the active lens, else all accessible)")
    .option("--json", "emit JSON output")
    .action(async (opts: { lensId?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const lensId = opts.lensId ?? readConfig()?.lensId;
      const qs = lensId ? `?lensId=${encodeURIComponent(lensId)}` : "";
      const result = await request<LogbookEntry>(`/api/cli/logbook${qs}`);
      emit(
        result,
        () => {
          const tasks = result.tasks ?? [];
          const projects = result.projects ?? [];
          const goals = result.goals ?? [];
          const archived = result.archived ?? [];

          if (tasks.length === 0 && projects.length === 0 && goals.length === 0 && archived.length === 0) {
            process.stdout.write("Nothing in the logbook.\n");
            return;
          }

          if (tasks.length > 0) {
            process.stdout.write(`Completed tasks (${tasks.length}):\n`);
            tasks.forEach((t) => {
              process.stdout.write(`  ${chalk.green("✓")} ${formatTask(t)}\n`);
            });
          }
          if (projects.length > 0) {
            process.stdout.write(`Finished projects (${projects.length}):\n`);
            projects.forEach((p) => {
              process.stdout.write(`  ${chalk.green("✓")} ${p.name}\n`);
            });
          }
          if (goals.length > 0) {
            process.stdout.write(`Achieved goals (${goals.length}):\n`);
            goals.forEach((g) => {
              process.stdout.write(`  ${chalk.green("✓")} ${g.name}\n`);
            });
          }
          if (archived.length > 0) {
            process.stdout.write(`Archived (${archived.length}):\n`);
            archived.forEach((a) => {
              process.stdout.write(`  ${chalk.gray("•")} ${a.text}\n`);
            });
          }
        },
        ctx,
      );
    });
  return cmd;
}
