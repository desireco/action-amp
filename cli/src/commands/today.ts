/**
 * today — the committed-for-today list (+ --done for reflection).
 *
 * Spans all accessible lenses (WORKFLOW.md §5.11). Calm output: numbered list,
 * no counts/badges/streaks.
 */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { emit, formatTask, type OutputCtx } from "../output.js";
import type { Task } from "../types.js";

export function makeTodayCommand(): Command {
  const cmd = new Command("today");
  cmd
    .description("show today's committed tasks")
    .option("--done", "show tasks completed today")
    .option("--json", "emit JSON output")
    .action(async (opts: { done?: boolean; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const path = opts.done ? "/api/cli/today/done" : "/api/cli/today";
      const result = await request<{ tasks: Task[] }>(path);
      emit(
        result,
        () => {
          if (result.tasks.length === 0) {
            process.stdout.write(
              opts.done ? "Nothing done today.\n" : "Nothing on Today.\n",
            );
            return;
          }
          if (opts.done) {
            process.stdout.write(`${result.tasks.length} done:\n`);
          }
          result.tasks.forEach((t, i) => {
            process.stdout.write(`  ${chalk.gray(`${i + 1}.`)} ${formatTask(t)}\n`);
          });
        },
        ctx,
      );
    });
  return cmd;
}
